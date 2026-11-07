use crate::world::TickInput;

/// Inputs are stored only when they change: a varint tick delta followed by
/// the button mask and both analog axes. A ten minute run with a key change
/// every few frames stays in the tens of kilobytes.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct InputLog {
    entries: Vec<(u32, TickInput)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecodeError;

pub const MAX_LOG_BYTES: usize = 256 * 1024;

impl InputLog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&mut self, tick: u32, input: TickInput) {
        let unchanged = self
            .entries
            .last()
            .map_or(input == TickInput::default(), |(_, last)| *last == input);
        if !unchanged {
            self.entries.push((tick, input));
        }
    }

    /// Input that applies on `tick`, given entries are visited in order.
    pub fn cursor(&self) -> LogCursor<'_> {
        LogCursor {
            log: self,
            next: 0,
            current: TickInput::default(),
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.entries.len() * 5);
        let mut previous = 0u32;
        for (tick, input) in &self.entries {
            write_varint(&mut bytes, tick - previous);
            bytes.push(input.buttons);
            bytes.push(input.axis_x as u8);
            bytes.push(input.axis_y as u8);
            previous = *tick;
        }
        bytes
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, DecodeError> {
        if bytes.len() > MAX_LOG_BYTES {
            return Err(DecodeError);
        }
        let mut entries = Vec::new();
        let mut position = 0;
        let mut tick = 0u32;
        while position < bytes.len() {
            let delta = read_varint(bytes, &mut position)?;
            if delta == 0 && !entries.is_empty() {
                return Err(DecodeError);
            }
            tick = tick.checked_add(delta).ok_or(DecodeError)?;
            let chunk = bytes.get(position..position + 3).ok_or(DecodeError)?;
            entries.push((
                tick,
                TickInput {
                    buttons: chunk[0],
                    axis_x: chunk[1] as i8,
                    axis_y: chunk[2] as i8,
                },
            ));
            position += 3;
        }
        Ok(Self { entries })
    }
}

pub struct LogCursor<'a> {
    log: &'a InputLog,
    next: usize,
    current: TickInput,
}

impl LogCursor<'_> {
    pub fn at(&mut self, tick: u32) -> TickInput {
        while let Some((at, input)) = self.log.entries.get(self.next) {
            if *at > tick {
                break;
            }
            self.current = *input;
            self.next += 1;
        }
        self.current
    }
}

fn write_varint(bytes: &mut Vec<u8>, mut value: u32) {
    loop {
        let byte = (value & 0x7F) as u8;
        value >>= 7;
        if value == 0 {
            bytes.push(byte);
            return;
        }
        bytes.push(byte | 0x80);
    }
}

fn read_varint(bytes: &[u8], position: &mut usize) -> Result<u32, DecodeError> {
    let mut value = 0u32;
    for shift in [0, 7, 14, 21, 28] {
        let byte = *bytes.get(*position).ok_or(DecodeError)?;
        *position += 1;
        value |= u32::from(byte & 0x7F)
            .checked_shl(shift)
            .ok_or(DecodeError)?;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err(DecodeError)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_replays_changes() {
        let mut log = InputLog::new();
        log.record(1, TickInput::default());
        log.record(
            5,
            TickInput {
                buttons: 3,
                axis_x: -40,
                axis_y: 0,
            },
        );
        log.record(
            6,
            TickInput {
                buttons: 3,
                axis_x: -40,
                axis_y: 0,
            },
        );
        log.record(300, TickInput::default());
        let decoded = InputLog::decode(&log.encode()).unwrap();
        assert_eq!(decoded, log);

        let mut cursor = decoded.cursor();
        assert_eq!(cursor.at(4).buttons, 0);
        assert_eq!(cursor.at(5).axis_x, -40);
        assert_eq!(cursor.at(299).buttons, 3);
        assert_eq!(cursor.at(300).buttons, 0);
    }

    #[test]
    fn rejects_truncated_logs() {
        assert_eq!(InputLog::decode(&[2, 1]), Err(DecodeError));
        assert_eq!(
            InputLog::decode(&[0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01]),
            Err(DecodeError)
        );
    }
}
