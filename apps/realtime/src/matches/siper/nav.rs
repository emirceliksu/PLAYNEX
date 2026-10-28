use std::{
    cmp::Reverse,
    collections::{BinaryHeap, HashMap},
};

use super::{
    data::rules,
    grid::{Cell, Grid},
};

// Bots stay off anything they would have to jump onto.
const MAX_STANDABLE: f64 = 2.0;

fn passable(grid: &Grid, from: Cell, to: Cell) -> bool {
    let (a, b) = (grid.height(from), grid.height(to));
    b <= MAX_STANDABLE && b - a <= rules().movement.step_height
}

pub fn walkable(grid: &Grid, cell: Cell) -> bool {
    grid.height(cell) <= MAX_STANDABLE
        && [(1, 0), (-1, 0), (0, 1), (0, -1)].iter().any(|(dx, dz)| {
            let near = Cell {
                x: cell.x + dx,
                z: cell.z + dz,
            };
            passable(grid, near, cell)
        })
}

// A* over cells with 8-way moves; diagonals need both side cells open so bots do not clip corners.
pub fn path(grid: &Grid, start: Cell, goal: Cell) -> Option<Vec<Cell>> {
    if start == goal {
        return Some(Vec::new());
    }
    let heuristic = |c: Cell| {
        let (dx, dz) = ((c.x - goal.x).abs(), (c.z - goal.z).abs());
        (dx.max(dz) * 10 + dx.min(dz) * 4) as u32
    };
    let mut open = BinaryHeap::new();
    let mut cost: HashMap<Cell, u32> = HashMap::new();
    let mut came: HashMap<Cell, Cell> = HashMap::new();
    cost.insert(start, 0);
    open.push(Reverse((heuristic(start), start)));
    while let Some(Reverse((_, current))) = open.pop() {
        if current == goal {
            let mut route = vec![current];
            let mut at = current;
            while let Some(previous) = came.get(&at) {
                if *previous == start {
                    break;
                }
                route.push(*previous);
                at = *previous;
            }
            route.reverse();
            return Some(route);
        }
        let here = cost[&current];
        for (dx, dz) in [
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ] {
            let next = Cell {
                x: current.x + dx,
                z: current.z + dz,
            };
            if !passable(grid, current, next) {
                continue;
            }
            let diagonal = dx != 0 && dz != 0;
            if diagonal {
                let side_a = Cell {
                    x: current.x + dx,
                    z: current.z,
                };
                let side_b = Cell {
                    x: current.x,
                    z: current.z + dz,
                };
                if !passable(grid, current, side_a) || !passable(grid, current, side_b) {
                    continue;
                }
            }
            let step = if diagonal { 14 } else { 10 };
            let total = here + step;
            if cost.get(&next).is_none_or(|known| total < *known) {
                cost.insert(next, total);
                came.insert(next, current);
                open.push(Reverse((total + heuristic(next), next)));
            }
        }
        if cost.len() > grid.width * grid.depth {
            break;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::super::data::maps;
    use super::*;

    #[test]
    fn both_spawns_reach_both_sites_on_every_map() {
        for grid in maps() {
            for spawn in *b"ab" {
                let from = grid.cells_of(spawn)[0];
                for site in *b"AB" {
                    let to = *grid
                        .cells_of(site)
                        .iter()
                        .find(|cell| walkable(grid, **cell))
                        .unwrap();
                    assert!(
                        path(grid, from, to).is_some(),
                        "{}: {} cannot reach {}",
                        grid.id,
                        spawn as char,
                        site as char
                    );
                }
            }
        }
    }
}
