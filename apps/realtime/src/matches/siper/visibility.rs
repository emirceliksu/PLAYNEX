use std::time::{Duration, Instant};

use super::{bots::segment_hits_sphere, data::rules, grid::Grid, player::Player};

// Close enough to hear footsteps through a wall, so hiding the position would be pointless.
const HEARING: f64 = 11.0;
// A shot gives the shooter away for a moment, as the sound does on the client.
const MUZZLE_REVEAL: Duration = Duration::from_millis(900);
const SIGHT_RANGE: f64 = 90.0;

// `seen[w][j]`: player w personally knows where j is this tick. Enemies a team cannot see
// are left out of its snapshots, which keeps wall hacks blind and the frames small.
pub fn compute(
    players: &[Player],
    grid: &Grid,
    smokes: &[[f64; 3]],
    teams: bool,
    now: Instant,
) -> Vec<Vec<bool>> {
    let radius = rules().combat.smoke_radius;
    let n = players.len();
    let mut seen = vec![vec![false; n]; n];
    for w in 0..n {
        for j in 0..n {
            let (watcher, target) = (&players[w], &players[j]);
            let friendly = w == j || (teams && watcher.team == target.team);
            if friendly || !target.alive {
                seen[w][j] = true;
                continue;
            }
            if !watcher.alive {
                continue;
            }
            let distance = (watcher.body.x - target.body.x).hypot(watcher.body.z - target.body.z);
            if distance <= HEARING
                || target
                    .last_shot
                    .is_some_and(|at| now.duration_since(at) <= MUZZLE_REVEAL)
            {
                seen[w][j] = true;
                continue;
            }
            if distance > SIGHT_RANGE {
                continue;
            }
            let eye = watcher.eye();
            let pose = target.pose();
            seen[w][j] = [pose.head_center(), pose.chest()].iter().any(|point| {
                grid.clear_line(eye, *point)
                    && !smokes
                        .iter()
                        .any(|smoke| segment_hits_sphere(eye, *point, *smoke, radius))
            });
        }
    }
    seen
}

// What the recipient's side knows: its own eyes plus every teammate's.
pub fn known_by(
    seen: &[Vec<bool>],
    players: &[Player],
    recipient: usize,
    teams: bool,
) -> Vec<bool> {
    let n = players.len();
    (0..n)
        .map(|j| {
            (0..n).any(|w| {
                let side = w == recipient || (teams && players[w].team == players[recipient].team);
                side && seen
                    .get(w)
                    .and_then(|row| row.get(j))
                    .copied()
                    .unwrap_or(true)
            })
        })
        .collect()
}
