use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use rand::{Rng, RngExt};
use serde::Deserialize;
use sha2::Sha256;

const TOKEN_TTL_SECS: u64 = 12 * 60 * 60;
const NICKNAME_MIN: usize = 2;
const NICKNAME_MAX: usize = 16;

type HmacSha256 = Hmac<Sha256>;

// Guest identity only: the token lets a reconnecting tab reclaim its seat. It
// carries no account and grants nothing beyond that.
pub struct TokenSigner {
    key: Vec<u8>,
}

impl TokenSigner {
    pub fn new(key: Vec<u8>) -> Self {
        Self { key }
    }

    pub fn random() -> Self {
        let mut key = vec![0u8; 32];
        rand::rng().fill_bytes(&mut key);
        Self { key }
    }

    pub fn issue(&self, player_id: &str, now_secs: u64) -> String {
        let body = format!("{player_id}.{}", now_secs + TOKEN_TTL_SECS);
        let tag = self.sign(body.as_bytes());
        format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(body),
            URL_SAFE_NO_PAD.encode(tag)
        )
    }

    pub fn verify(&self, token: &str, now_secs: u64) -> Option<String> {
        let (body, tag) = token.split_once('.')?;
        let body = URL_SAFE_NO_PAD.decode(body).ok()?;
        let tag = URL_SAFE_NO_PAD.decode(tag).ok()?;

        let mut mac = self.mac();
        mac.update(&body);
        mac.verify_slice(&tag).ok()?;

        let body = String::from_utf8(body).ok()?;
        let (player_id, expires) = body.rsplit_once('.')?;
        let expires: u64 = expires.parse().ok()?;
        (expires > now_secs && is_player_id(player_id)).then(|| player_id.to_owned())
    }

    fn sign(&self, body: &[u8]) -> Vec<u8> {
        let mut mac = self.mac();
        mac.update(body);
        mac.finalize().into_bytes().to_vec()
    }

    fn mac(&self) -> HmacSha256 {
        // HMAC accepts keys of any length, so this cannot fail.
        HmacSha256::new_from_slice(&self.key).expect("hmac key")
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AccountClaim {
    #[serde(rename = "uid")]
    pub id: String,
    #[serde(rename = "name")]
    pub username: String,
    #[serde(default)]
    pub skin: Option<String>,
    #[serde(default)]
    pub outfit: Option<String>,
    exp: u64,
}

// Short-lived tickets minted by the API for a signed-in player. Only the API and this
// service hold the key, so a valid ticket proves the account behind the socket.
pub struct TicketVerifier {
    key: Vec<u8>,
}

impl TicketVerifier {
    pub fn new(key: Vec<u8>) -> Self {
        Self { key }
    }

    pub fn verify(&self, ticket: &str, now_secs: u64) -> Option<AccountClaim> {
        let (body, tag) = ticket.split_once('.')?;
        let body = URL_SAFE_NO_PAD.decode(body).ok()?;
        let tag = URL_SAFE_NO_PAD.decode(tag).ok()?;
        let mut mac = HmacSha256::new_from_slice(&self.key).ok()?;
        mac.update(&body);
        mac.verify_slice(&tag).ok()?;
        let claim: AccountClaim = serde_json::from_slice(&body).ok()?;
        (claim.exp > now_secs).then_some(claim)
    }

    #[cfg(test)]
    pub fn sign(&self, body: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(&self.key).expect("hmac key");
        mac.update(body.as_bytes());
        format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(body),
            URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
        )
    }
}

pub fn new_player_id() -> String {
    let bytes: [u8; 8] = rand::rng().random();
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn is_player_id(value: &str) -> bool {
    value.len() == 16 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Debug, PartialEq, Eq)]
pub enum NicknameError {
    Length,
    Characters,
}

pub fn normalize_nickname(raw: &str) -> Result<String, NicknameError> {
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed
        .chars()
        .any(|ch| ch.is_control() || matches!(ch, '<' | '>' | '\u{200b}'..='\u{200f}'))
    {
        return Err(NicknameError::Characters);
    }
    let length = collapsed.chars().count();
    if !(NICKNAME_MIN..=NICKNAME_MAX).contains(&length) {
        return Err(NicknameError::Length);
    }
    Ok(collapsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_round_trip_and_expiry() {
        let signer = TokenSigner::new(b"test-key".to_vec());
        let id = new_player_id();
        let token = signer.issue(&id, 1_000);
        assert_eq!(signer.verify(&token, 1_001), Some(id));
        assert_eq!(signer.verify(&token, 1_000 + TOKEN_TTL_SECS + 1), None);
    }

    #[test]
    fn rejects_tampered_or_foreign_tokens() {
        let signer = TokenSigner::new(b"test-key".to_vec());
        let token = signer.issue(&new_player_id(), 1_000);
        let other = TokenSigner::new(b"other-key".to_vec());
        assert_eq!(other.verify(&token, 1_001), None);

        let forged_body = URL_SAFE_NO_PAD.encode("ffffffffffffffff.99999999999");
        let tag = token.split_once('.').unwrap().1;
        assert_eq!(signer.verify(&format!("{forged_body}.{tag}"), 1_001), None);
    }

    #[test]
    fn tickets_carry_the_account_until_they_expire() {
        let verifier = TicketVerifier::new(b"ticket-key".to_vec());
        let ticket = verifier.sign(r#"{"uid":"u-1","name":"ece","exp":2000,"skin":"tiger"}"#);
        let claim = verifier.verify(&ticket, 1_000).unwrap();
        assert_eq!(claim.username, "ece");
        assert_eq!(claim.skin.as_deref(), Some("tiger"));
        assert_eq!(verifier.verify(&ticket, 2_001), None);
        let other = TicketVerifier::new(b"other".to_vec());
        assert_eq!(other.verify(&ticket, 1_000), None);
    }

    #[test]
    fn nicknames_are_trimmed_and_bounded() {
        assert_eq!(normalize_nickname("  Ece   K "), Ok("Ece K".to_owned()));
        assert_eq!(normalize_nickname("a"), Err(NicknameError::Length));
        assert_eq!(
            normalize_nickname("abcdefghijklmnopq"),
            Err(NicknameError::Length)
        );
        assert_eq!(normalize_nickname("a<b>"), Err(NicknameError::Characters));
    }
}
