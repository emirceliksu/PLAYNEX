use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u8 = 1;
pub const MAX_FRAME_BYTES: usize = 16 * 1024;

// The envelope is parsed in two steps so that an unknown `type` produces a
// precise error instead of a generic serde failure.
#[derive(Debug, Deserialize)]
pub struct ClientEnvelope {
    pub v: u8,
    #[serde(default)]
    pub seq: u64,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug)]
pub enum ClientMessage {
    Hello(Hello),
    RoomCreate(RoomCreate),
    RoomJoin(RoomJoin),
    RoomLeave,
    MatchReady(MatchReady),
    MatchStart,
    Input(Value),
    Ping(Ping),
    RoomList(RoomList),
    MatchQuick(MatchQuick),
    RoomTeam(RoomTeam),
    Chat(Chat),
    PartyCreate,
    PartyJoin(PartyJoin),
    PartyLeave,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    pub nickname: String,
    #[serde(default)]
    pub resume_token: Option<String>,
    // Minted by the API for signed-in players; guests leave it out.
    #[serde(default)]
    pub ticket: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RoomCreate {
    pub game: String,
    #[serde(default)]
    pub options: Value,
}

#[derive(Debug, Deserialize)]
pub struct RoomJoin {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct MatchReady {
    pub ready: bool,
}

#[derive(Debug, Deserialize)]
pub struct Ping {
    pub t: f64,
}

#[derive(Debug, Deserialize)]
pub struct RoomList {
    pub game: String,
}

#[derive(Debug, Deserialize)]
pub struct MatchQuick {
    pub game: String,
    pub mode: String,
}

#[derive(Debug, Deserialize)]
pub struct RoomTeam {
    pub team: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct Chat {
    pub text: String,
    #[serde(default)]
    pub team: bool,
}

#[derive(Debug, Deserialize)]
pub struct PartyJoin {
    pub code: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameError {
    BadFrame,
    UnsupportedVersion,
    UnknownType,
    BadPayload,
}

impl FrameError {
    pub fn code(self) -> &'static str {
        match self {
            FrameError::BadFrame => "bad_frame",
            FrameError::UnsupportedVersion => "unsupported_version",
            FrameError::UnknownType => "unknown_type",
            FrameError::BadPayload => "bad_payload",
        }
    }
}

pub fn parse_frame(text: &str) -> Result<(u64, ClientMessage), FrameError> {
    let envelope: ClientEnvelope = serde_json::from_str(text).map_err(|_| FrameError::BadFrame)?;
    if envelope.v != PROTOCOL_VERSION {
        return Err(FrameError::UnsupportedVersion);
    }
    let payload = envelope.payload;
    let message = match envelope.kind.as_str() {
        "hello" => ClientMessage::Hello(from_payload(payload)?),
        "room.create" => ClientMessage::RoomCreate(from_payload(payload)?),
        "room.join" => ClientMessage::RoomJoin(from_payload(payload)?),
        "room.leave" => ClientMessage::RoomLeave,
        "match.ready" => ClientMessage::MatchReady(from_payload(payload)?),
        "match.start" => ClientMessage::MatchStart,
        "input" => ClientMessage::Input(payload),
        "ping" => ClientMessage::Ping(from_payload(payload)?),
        "room.list" => ClientMessage::RoomList(from_payload(payload)?),
        "match.quick" => ClientMessage::MatchQuick(from_payload(payload)?),
        "room.team" => ClientMessage::RoomTeam(from_payload(payload)?),
        "chat" => ClientMessage::Chat(from_payload(payload)?),
        "party.create" => ClientMessage::PartyCreate,
        "party.join" => ClientMessage::PartyJoin(from_payload(payload)?),
        "party.leave" => ClientMessage::PartyLeave,
        _ => return Err(FrameError::UnknownType),
    };
    Ok((envelope.seq, message))
}

fn from_payload<T: for<'de> Deserialize<'de>>(payload: Value) -> Result<T, FrameError> {
    serde_json::from_value(payload).map_err(|_| FrameError::BadPayload)
}

#[derive(Debug, Clone)]
pub struct ServerMessage {
    pub kind: &'static str,
    pub payload: Value,
}

impl ServerMessage {
    pub fn new(kind: &'static str, payload: impl Serialize) -> Self {
        Self {
            kind,
            payload: serde_json::to_value(payload).unwrap_or(Value::Null),
        }
    }

    pub fn error(code: &str) -> Self {
        Self::new("error", serde_json::json!({ "code": code }))
    }

    pub fn encode(&self, seq: u64) -> String {
        serde_json::json!({
            "v": PROTOCOL_VERSION,
            "seq": seq,
            "type": self.kind,
            "payload": self.payload,
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_messages() {
        let (seq, message) =
            parse_frame(r#"{"v":1,"seq":4,"type":"room.join","payload":{"code":"ABCDEF"}}"#)
                .unwrap();
        assert_eq!(seq, 4);
        assert!(matches!(message, ClientMessage::RoomJoin(RoomJoin { code }) if code == "ABCDEF"));

        let (_, message) = parse_frame(r#"{"v":1,"type":"room.leave"}"#).unwrap();
        assert!(matches!(message, ClientMessage::RoomLeave));
    }

    #[test]
    fn rejects_bad_frames() {
        assert_eq!(parse_frame("not json").unwrap_err(), FrameError::BadFrame);
        assert_eq!(
            parse_frame(r#"{"v":2,"type":"ping","payload":{"t":1}}"#).unwrap_err(),
            FrameError::UnsupportedVersion
        );
        assert_eq!(
            parse_frame(r#"{"v":1,"type":"shout","payload":{}}"#).unwrap_err(),
            FrameError::UnknownType
        );
        assert_eq!(
            parse_frame(r#"{"v":1,"type":"room.join","payload":{"room":1}}"#).unwrap_err(),
            FrameError::BadPayload
        );
    }
}
