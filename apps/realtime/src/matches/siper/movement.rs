use serde::Deserialize;

use super::{data::rules, grid::Grid};

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Body {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub vx: f64,
    pub vy: f64,
    pub vz: f64,
    pub grounded: bool,
    pub crouched: bool,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
pub struct MoveInput {
    #[serde(default)]
    pub seq: u32,
    #[serde(default)]
    pub f: f64,
    #[serde(default)]
    pub s: f64,
    #[serde(default)]
    pub yaw: f64,
    #[serde(default)]
    pub pitch: f64,
    #[serde(default)]
    pub j: bool,
    #[serde(default)]
    pub c: bool,
    #[serde(default)]
    pub w: bool,
    #[serde(default)]
    pub u: bool,
}

impl MoveInput {
    pub fn is_finite(&self) -> bool {
        [self.f, self.s, self.yaw, self.pitch]
            .iter()
            .all(|v| v.is_finite())
    }

    pub fn moving(&self) -> bool {
        self.f != 0.0 || self.s != 0.0
    }
}

// Yaw 0 looks along +z, positive pitch looks down; the same convention as the Babylon camera.
pub fn direction(yaw: f64, pitch: f64) -> [f64; 3] {
    [
        yaw.sin() * pitch.cos(),
        -pitch.sin(),
        yaw.cos() * pitch.cos(),
    ]
}

pub fn eye_height(body: &Body) -> f64 {
    let player = &rules().player;
    if body.crouched {
        player.crouch_eye
    } else {
        player.eye
    }
}

// Mirrored by `sim/movement.ts` in the client package; keep both in step.
pub fn step(body: &mut Body, input: &MoveInput, speed_scale: f64, grid: &Grid, dt: f64) {
    let tuning = &rules().movement;
    let radius = rules().player.radius;

    let forward = (input.yaw.sin(), input.yaw.cos());
    let right = (input.yaw.cos(), -input.yaw.sin());
    let f = input.f.clamp(-1.0, 1.0);
    let s = input.s.clamp(-1.0, 1.0);
    let mut wish = (forward.0 * f + right.0 * s, forward.1 * f + right.1 * s);
    let length = wish.0.hypot(wish.1);
    if length > 1.0 {
        wish = (wish.0 / length, wish.1 / length);
    }

    body.crouched = input.c;
    let speed = if input.c {
        tuning.crouch_speed
    } else if input.w {
        tuning.walk_speed
    } else {
        tuning.run_speed
    } * speed_scale;
    let accel = if body.grounded {
        tuning.ground_accel
    } else {
        tuning.air_accel
    };
    let blend = (accel * dt).min(1.0);
    body.vx += (wish.0 * speed - body.vx) * blend;
    body.vz += (wish.1 * speed - body.vz) * blend;

    if input.j && body.grounded {
        body.vy = tuning.jump_speed;
        body.grounded = false;
    }

    let next_x = body.x + body.vx * dt;
    let floor = grid.support(next_x, body.z, radius);
    if floor <= body.y + tuning.step_height {
        body.x = next_x;
        if body.grounded {
            body.y = body.y.max(floor);
        }
    } else {
        body.vx = 0.0;
    }
    let next_z = body.z + body.vz * dt;
    let floor = grid.support(body.x, next_z, radius);
    if floor <= body.y + tuning.step_height {
        body.z = next_z;
        if body.grounded {
            body.y = body.y.max(floor);
        }
    } else {
        body.vz = 0.0;
    }

    let floor = grid.support(body.x, body.z, radius);
    if body.grounded && body.y > floor && body.y - floor <= tuning.step_height {
        // Walking down a stair keeps the feet on it instead of falling a frame at a time.
        body.y = floor;
    }
    if body.y > floor || body.vy > 0.0 {
        body.vy -= tuning.gravity * dt;
        body.y += body.vy * dt;
        body.grounded = false;
    }
    if body.y <= floor {
        body.y = floor;
        body.vy = 0.0;
        body.grounded = true;
    }
}

#[cfg(test)]
mod tests {
    use super::super::{data::map, grid::Cell};
    use super::*;

    const DT: f64 = 1.0 / 30.0;

    fn spawn_body(grid: &Grid) -> Body {
        let (x, z) = grid.center(grid.cells_of(b'a')[0]);
        Body {
            x,
            z,
            grounded: true,
            ..Body::default()
        }
    }

    #[test]
    fn runs_up_to_speed_and_stops_at_walls() {
        let grid = map("liman").unwrap();
        let mut body = spawn_body(grid);
        let input = MoveInput {
            f: 1.0,
            yaw: 0.0,
            ..MoveInput::default()
        };
        for _ in 0..300 {
            step(&mut body, &input, 1.0, grid, DT);
        }
        assert!(body.z < grid.depth as f64 * grid.cell);
        assert!(body.vz.abs() < 1e-9, "blocked by the wall");
        assert_eq!(body.y, 0.0);
    }

    #[test]
    fn jumps_and_lands() {
        let grid = map("liman").unwrap();
        let mut body = spawn_body(grid);
        let jump = MoveInput {
            j: true,
            ..MoveInput::default()
        };
        step(&mut body, &jump, 1.0, grid, DT);
        assert!(body.y > 0.0 && !body.grounded);
        let idle = MoveInput::default();
        let mut peak: f64 = 0.0;
        for _ in 0..60 {
            step(&mut body, &idle, 1.0, grid, DT);
            peak = peak.max(body.y);
        }
        assert!(
            peak > 1.0 && peak < 1.25,
            "jump clears a crate but not a low wall: {peak}"
        );
        assert!(body.grounded && body.y == 0.0);
    }

    #[test]
    fn climbs_stairs_onto_a_platform() {
        let grid = map("liman").unwrap();
        // The A-site platform ('2', 1 m) has a half-metre stair ('1') in front of it at z = 5.
        let (x, z) = grid.center(Cell { x: 9, z: 7 });
        let mut body = Body {
            x,
            z,
            grounded: true,
            ..Body::default()
        };
        let north = MoveInput {
            f: 1.0,
            yaw: std::f64::consts::PI,
            ..MoveInput::default()
        };
        for _ in 0..45 {
            step(&mut body, &north, 1.0, grid, DT);
        }
        assert!((body.y - 1.0).abs() < 1e-9, "on the platform: {}", body.y);
    }
}
