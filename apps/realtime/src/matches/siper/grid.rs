use super::data::{MapFile, Rules};

// Anything outside the map counts as an endless wall.
const OUTSIDE: f64 = 1_000.0;

// Maps are height fields: each cell is a column of solid ground up to its
// height. Rects paint cell kinds in order, later ones over earlier ones.
pub struct Grid {
    pub id: String,
    pub width: usize,
    pub depth: usize,
    pub cell: f64,
    kinds: Vec<u8>,
    heights: Vec<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Cell {
    pub x: i64,
    pub z: i64,
}

impl Grid {
    pub fn build(file: &MapFile, rules: &Rules) -> Self {
        let mut kinds = vec![b'.'; file.width * file.height];
        for (kind, x, z, w, d) in &file.rects {
            let byte = kind.as_bytes().first().copied().unwrap_or(b'.');
            for cz in *z..z + d {
                for cx in *x..x + w {
                    if (0..file.width as i64).contains(&cx) && (0..file.height as i64).contains(&cz)
                    {
                        kinds[cz as usize * file.width + cx as usize] = byte;
                    }
                }
            }
        }
        let heights = kinds
            .iter()
            .map(|kind| {
                rules
                    .cells
                    .get(&char::from(*kind).to_string())
                    .map_or(0.0, |spec| spec.height)
            })
            .collect();
        Self {
            id: file.id.clone(),
            width: file.width,
            depth: file.height,
            cell: rules.cell_size,
            kinds,
            heights,
        }
    }

    fn index(&self, cell: Cell) -> Option<usize> {
        let inside =
            (0..self.width as i64).contains(&cell.x) && (0..self.depth as i64).contains(&cell.z);
        inside.then(|| cell.z as usize * self.width + cell.x as usize)
    }

    pub fn height(&self, cell: Cell) -> f64 {
        self.index(cell).map_or(OUTSIDE, |i| self.heights[i])
    }

    pub fn kind(&self, cell: Cell) -> u8 {
        self.index(cell).map_or(b'#', |i| self.kinds[i])
    }

    pub fn cell_at(&self, x: f64, z: f64) -> Cell {
        Cell {
            x: (x / self.cell).floor() as i64,
            z: (z / self.cell).floor() as i64,
        }
    }

    pub fn center(&self, cell: Cell) -> (f64, f64) {
        (
            (cell.x as f64 + 0.5) * self.cell,
            (cell.z as f64 + 0.5) * self.cell,
        )
    }

    // Highest ground under a square footprint of half-size `radius`.
    pub fn support(&self, x: f64, z: f64, radius: f64) -> f64 {
        let min = self.cell_at(x - radius, z - radius);
        let max = self.cell_at(x + radius - 1e-9, z + radius - 1e-9);
        let mut top = f64::NEG_INFINITY;
        for cz in min.z..=max.z {
            for cx in min.x..=max.x {
                top = top.max(self.height(Cell { x: cx, z: cz }));
            }
        }
        top
    }

    pub fn cells_of(&self, kind: u8) -> Vec<Cell> {
        (0..self.kinds.len())
            .filter(|&i| self.kinds[i] == kind)
            .map(|i| Cell {
                x: (i % self.width) as i64,
                z: (i / self.width) as i64,
            })
            .collect()
    }

    // Distance along `dir` (unit length) to the first solid surface, if within `max`.
    pub fn raycast(&self, origin: [f64; 3], dir: [f64; 3], max: f64) -> Option<f64> {
        let mut cell = self.cell_at(origin[0], origin[2]);
        let step_x = if dir[0] > 0.0 { 1 } else { -1 };
        let step_z = if dir[2] > 0.0 { 1 } else { -1 };
        let delta_x = if dir[0].abs() < 1e-12 {
            f64::INFINITY
        } else {
            self.cell / dir[0].abs()
        };
        let delta_z = if dir[2].abs() < 1e-12 {
            f64::INFINITY
        } else {
            self.cell / dir[2].abs()
        };
        let boundary = |c: i64, step: i64, o: f64, d: f64| {
            if d.abs() < 1e-12 {
                f64::INFINITY
            } else {
                let edge = if step > 0 { c + 1 } else { c } as f64 * self.cell;
                (edge - o) / d
            }
        };
        let mut next_x = boundary(cell.x, step_x, origin[0], dir[0]);
        let mut next_z = boundary(cell.z, step_z, origin[2], dir[2]);
        let mut t = 0.0;
        loop {
            let exit = next_x.min(next_z).min(max);
            let top = self.height(cell);
            if origin[1] + dir[1] * t <= top {
                return Some(t);
            }
            if origin[1] + dir[1] * exit <= top {
                return Some((top - origin[1]) / dir[1]);
            }
            if exit >= max {
                return None;
            }
            t = exit;
            if next_x < next_z {
                cell.x += step_x;
                next_x += delta_x;
            } else {
                cell.z += step_z;
                next_z += delta_z;
            }
        }
    }

    pub fn clear_line(&self, from: [f64; 3], to: [f64; 3]) -> bool {
        let d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
        let length = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        if length < 1e-9 {
            return true;
        }
        let dir = [d[0] / length, d[1] / length, d[2] / length];
        self.raycast(from, dir, length).is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::super::data::{map, maps, rules};
    use super::*;

    #[test]
    fn every_map_has_spawns_sites_and_closed_walls() {
        for grid in maps() {
            assert!(
                !grid.cells_of(b'a').is_empty(),
                "{} attacker spawn",
                grid.id
            );
            assert!(
                !grid.cells_of(b'b').is_empty(),
                "{} defender spawn",
                grid.id
            );
            assert!(!grid.cells_of(b'A').is_empty(), "{} site A", grid.id);
            assert!(!grid.cells_of(b'B').is_empty(), "{} site B", grid.id);
            for x in 0..grid.width as i64 {
                assert_eq!(grid.kind(Cell { x, z: 0 }), b'#');
                assert_eq!(
                    grid.kind(Cell {
                        x,
                        z: grid.depth as i64 - 1
                    }),
                    b'#'
                );
            }
        }
        assert_eq!(rules().maps.len(), maps().len());
    }

    #[test]
    fn raycast_stops_at_walls_and_floor() {
        let grid = map("liman").unwrap();
        // From inside the attacker spawn straight down hits the floor.
        let (x, z) = grid.center(grid.cells_of(b'a')[0]);
        let hit = grid.raycast([x, 1.6, z], [0.0, -1.0, 0.0], 10.0).unwrap();
        assert!((hit - 1.6).abs() < 1e-9);
        // Straight towards the south wall along +z.
        let hit = grid.raycast([x, 1.6, z], [0.0, 0.0, 1.0], 100.0).unwrap();
        assert!(z + hit <= grid.depth as f64 * grid.cell);
        // Looking up into the sky hits nothing.
        assert!(grid.raycast([x, 1.6, z], [0.0, 1.0, 0.0], 100.0).is_none());
    }
}
