use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::mail::MailError;

const SEND_SCOPE: &str = "https://www.googleapis.com/auth/gmail.send";
const SEND_URL: &str = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
// Google issues hour-long tokens; renewing a minute early keeps a send from racing the expiry.
const RENEW_BEFORE: Duration = Duration::from_secs(60);

#[derive(Deserialize)]
struct ServiceAccount {
    client_email: String,
    private_key: String,
    token_uri: String,
}

#[derive(Serialize)]
struct Assertion<'a> {
    iss: &'a str,
    sub: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: u64,
    exp: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct AccessToken {
    value: String,
    renew_at: Instant,
}

/// Sends through the Gmail API as a Workspace user, using a service account with
/// domain-wide delegation for the gmail.send scope.
pub struct GmailTransport {
    http: reqwest::Client,
    client_email: String,
    token_uri: String,
    key: EncodingKey,
    sender: String,
    token: Mutex<Option<AccessToken>>,
}

/// Accepts the key file as JSON or base64 of it; base64 survives env files that
/// rewrite the escaped newlines inside private_key.
fn parse_service_account(raw: &str) -> Result<ServiceAccount, MailError> {
    let raw = raw.trim();
    if raw.starts_with('{') {
        return serde_json::from_str(raw)
            .map_err(|error| MailError::ServiceAccount(error.to_string()));
    }
    let decoded = STANDARD
        .decode(raw)
        .map_err(|error| MailError::ServiceAccount(error.to_string()))?;
    serde_json::from_slice(&decoded).map_err(|error| MailError::ServiceAccount(error.to_string()))
}

impl GmailTransport {
    pub fn new(service_account: &str, sender: String) -> Result<Self, MailError> {
        let account = parse_service_account(service_account)?;
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()?,
            key: EncodingKey::from_rsa_pem(account.private_key.as_bytes())?,
            client_email: account.client_email,
            token_uri: account.token_uri,
            sender,
            token: Mutex::new(None),
        })
    }

    async fn access_token(&self) -> Result<String, MailError> {
        let mut cached = self.token.lock().await;
        if let Some(token) = cached
            .as_ref()
            .filter(|token| Instant::now() < token.renew_at)
        {
            return Ok(token.value.clone());
        }

        let issued_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let assertion = jsonwebtoken::encode(
            &Header::new(Algorithm::RS256),
            &Assertion {
                iss: &self.client_email,
                sub: &self.sender,
                scope: SEND_SCOPE,
                aud: &self.token_uri,
                iat: issued_at,
                exp: issued_at + 3600,
            },
            &self.key,
        )?;

        let response = self
            .http
            .post(&self.token_uri)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", assertion.as_str()),
            ])
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(MailError::Gmail {
                status: response.status().as_u16(),
                body: response.text().await.unwrap_or_default(),
            });
        }
        let token: TokenResponse = response.json().await?;
        let lifetime = Duration::from_secs(token.expires_in).saturating_sub(RENEW_BEFORE);
        *cached = Some(AccessToken {
            value: token.access_token.clone(),
            renew_at: Instant::now() + lifetime,
        });
        Ok(token.access_token)
    }

    pub async fn send(&self, message: &[u8]) -> Result<(), MailError> {
        let token = self.access_token().await?;
        let response = self
            .http
            .post(SEND_URL)
            .bearer_auth(token)
            .json(&serde_json::json!({ "raw": URL_SAFE_NO_PAD.encode(message) }))
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(MailError::Gmail {
                status: response.status().as_u16(),
                body: response.text().await.unwrap_or_default(),
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY_FILE: &str = r#"{"client_email":"mailer@example.iam.gserviceaccount.com","private_key":"pem","token_uri":"https://oauth2.googleapis.com/token"}"#;

    #[test]
    fn reads_the_key_file_as_json_or_base64() {
        let from_json = parse_service_account(KEY_FILE).unwrap();
        let from_base64 = parse_service_account(&STANDARD.encode(KEY_FILE)).unwrap();
        assert_eq!(from_json.client_email, from_base64.client_email);
        assert!(parse_service_account("not a key").is_err());
    }
}
