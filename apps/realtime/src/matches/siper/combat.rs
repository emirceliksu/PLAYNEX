use super::data::{WeaponSpec, rules};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pose {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub crouched: bool,
    pub alive: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Zone {
    Head,
    Body,
    Legs,
}

impl Pose {
    pub fn top(&self) -> f64 {
        let player = &rules().player;
        self.y
            + if self.crouched {
                player.crouch_height
            } else {
                player.height
            }
    }

    pub fn head_center(&self) -> [f64; 3] {
        [self.x, self.top() - rules().player.head_radius, self.z]
    }

    pub fn chest(&self) -> [f64; 3] {
        [self.x, self.y + (self.top() - self.y) * 0.6, self.z]
    }
}

// Head is a sphere on top of a vertical cylinder; anything under the knees counts as legs.
pub fn hit_pose(origin: [f64; 3], dir: [f64; 3], pose: &Pose) -> Option<(f64, Zone)> {
    let player = &rules().player;
    let head = pose.head_center();
    let head_hit = ray_sphere(origin, dir, head, player.head_radius);
    let body_top = head[1] - player.head_radius;
    let body_hit = ray_cylinder(origin, dir, pose, player.radius, body_top);
    match (head_hit, body_hit) {
        (Some(h), Some(b)) if b < h => Some((b, body_zone(origin, dir, b, pose))),
        (Some(h), _) => Some((h, Zone::Head)),
        (None, Some(b)) => Some((b, body_zone(origin, dir, b, pose))),
        (None, None) => None,
    }
}

fn body_zone(origin: [f64; 3], dir: [f64; 3], t: f64, pose: &Pose) -> Zone {
    let y = origin[1] + dir[1] * t;
    if y < pose.y + rules().player.legs_top {
        Zone::Legs
    } else {
        Zone::Body
    }
}

fn ray_sphere(origin: [f64; 3], dir: [f64; 3], center: [f64; 3], radius: f64) -> Option<f64> {
    let oc = [
        origin[0] - center[0],
        origin[1] - center[1],
        origin[2] - center[2],
    ];
    let b = oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2];
    let c = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - radius * radius;
    let disc = b * b - c;
    if disc < 0.0 {
        return None;
    }
    let t = -b - disc.sqrt();
    (t >= 0.0).then_some(t)
}

fn ray_cylinder(
    origin: [f64; 3],
    dir: [f64; 3],
    pose: &Pose,
    radius: f64,
    top: f64,
) -> Option<f64> {
    let (ox, oz) = (origin[0] - pose.x, origin[2] - pose.z);
    let a = dir[0] * dir[0] + dir[2] * dir[2];
    if a < 1e-12 {
        return None;
    }
    let b = ox * dir[0] + oz * dir[2];
    let c = ox * ox + oz * oz - radius * radius;
    let disc = b * b - a * c;
    if disc < 0.0 {
        return None;
    }
    let root = disc.sqrt();
    [(-b - root) / a, (-b + root) / a]
        .into_iter()
        .filter(|t| *t >= 0.0)
        .find(|t| {
            let y = origin[1] + dir[1] * t;
            y >= pose.y && y <= top
        })
}

pub struct Damage {
    pub health: i32,
    pub armor: i32,
}

// Armor soaks part of a body or (with a helmet) head hit; what it soaks wears it down by half.
pub fn damage(weapon: &WeaponSpec, zone: Zone, distance: f64, armor: i32, helmet: bool) -> Damage {
    let combat = &rules().combat;
    let mut amount = weapon.damage * weapon.falloff.powf(distance / 10.0);
    amount *= match zone {
        Zone::Head => weapon.head_multiplier,
        Zone::Body => 1.0,
        Zone::Legs => combat.leg_multiplier,
    };
    let protected = armor > 0 && (zone == Zone::Body || (zone == Zone::Head && helmet));
    if !protected {
        return Damage {
            health: amount.round() as i32,
            armor: 0,
        };
    }
    let dealt = amount * weapon.armor_penetration;
    let soaked = ((amount - dealt) / 2.0).round() as i32;
    let soaked = soaked.min(armor);
    Damage {
        health: dealt.round() as i32,
        armor: soaked,
    }
}

// Degrees of upward kick and sideways drift after `shots` rounds of a burst.
pub fn recoil(weapon: &WeaponSpec, shots: usize) -> (f64, f64) {
    let pattern = &weapon.recoil;
    let mut pitch = 0.0;
    let mut yaw = 0.0;
    for i in 0..shots {
        let [p, y] = pattern[i % pattern.len()];
        pitch += p;
        yaw += y;
    }
    (pitch.min(12.0), yaw.clamp(-5.0, 5.0))
}

pub fn spread(
    weapon: &WeaponSpec,
    speed: f64,
    airborne: bool,
    crouched: bool,
    scoped: bool,
) -> f64 {
    let run = rules().movement.run_speed;
    let s = &weapon.spread;
    let base = match (scoped, s.scoped) {
        (true, Some(scoped)) => scoped,
        _ => s.base,
    };
    let mut cone = base + s.moving * (speed / run).min(1.0);
    if airborne {
        cone += s.air;
    }
    if crouched {
        cone *= s.crouch;
    }
    cone
}

#[cfg(test)]
mod tests {
    use super::super::data::arsenal;
    use super::*;

    fn standing() -> Pose {
        Pose {
            x: 0.0,
            y: 0.0,
            z: 10.0,
            crouched: false,
            alive: true,
        }
    }

    #[test]
    fn zones_follow_height() {
        let pose = standing();
        let head = pose.head_center();
        let hit = hit_pose([0.0, head[1], 0.0], [0.0, 0.0, 1.0], &pose).unwrap();
        assert_eq!(hit.1, Zone::Head);
        let hit = hit_pose([0.0, 1.2, 0.0], [0.0, 0.0, 1.0], &pose).unwrap();
        assert_eq!(hit.1, Zone::Body);
        assert!((hit.0 - (10.0 - rules().player.radius)).abs() < 1e-9);
        let hit = hit_pose([0.0, 0.3, 0.0], [0.0, 0.0, 1.0], &pose).unwrap();
        assert_eq!(hit.1, Zone::Legs);
        assert!(hit_pose([0.0, 2.5, 0.0], [0.0, 0.0, 1.0], &pose).is_none());
        assert!(hit_pose([1.0, 1.2, 0.0], [0.0, 0.0, 1.0], &pose).is_none());
    }

    #[test]
    fn crouching_lowers_the_head() {
        let mut pose = standing();
        let standing_head = pose.head_center()[1];
        pose.crouched = true;
        assert!(pose.head_center()[1] < standing_head - 0.4);
        assert!(hit_pose([0.0, standing_head, 0.0], [0.0, 0.0, 1.0], &pose).is_none());
    }

    #[test]
    fn armor_and_headshots() {
        let rifle = arsenal().weapon("rifle").unwrap();
        let bare = damage(rifle, Zone::Head, 0.0, 0, false);
        assert!(
            bare.health >= 100,
            "a rifle headshot kills without a helmet"
        );
        let helmeted = damage(rifle, Zone::Head, 0.0, 100, true);
        assert!(helmeted.health < bare.health && helmeted.armor > 0);
        let legs = damage(rifle, Zone::Legs, 0.0, 100, true);
        assert_eq!(legs.armor, 0, "armor does not cover legs");
        let far = damage(rifle, Zone::Body, 60.0, 0, false);
        assert!(far.health < rifle.damage as i32);
    }

    #[test]
    fn recoil_climbs_then_caps() {
        let rifle = arsenal().weapon("rifle").unwrap();
        assert_eq!(recoil(rifle, 0), (0.0, 0.0));
        let (three, _) = recoil(rifle, 3);
        let (thirty, _) = recoil(rifle, 30);
        assert!(three > 0.0 && thirty <= 12.0 && thirty >= three);
    }
}
