use std::time::Duration;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationMail<'a> {
    pub to: &'a str,
    pub first_name: &'a str,
    pub code: &'a str,
    pub locale: &'a str,
    pub valid_minutes: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum MailError {
    #[error("mailer unreachable: {0}")]
    Http(#[from] reqwest::Error),
    #[error("mailer answered {0}")]
    Status(u16),
}

/// Client for the mailer service. It holds the delivery credentials and is the only
/// container with a route out, so the api itself stays on internal networks.
pub struct Mailer {
    http: reqwest::Client,
    endpoint: String,
}

impl Mailer {
    pub fn new(base_url: &str) -> Result<Self, reqwest::Error> {
        Ok(Self {
            // Covers a token refresh plus the send on the mailer side.
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(35))
                .build()?,
            endpoint: format!("{}/v1/verification-mails", base_url.trim_end_matches('/')),
        })
    }

    pub async fn send_verification(&self, mail: VerificationMail<'_>) -> Result<(), MailError> {
        let response = self.http.post(&self.endpoint).json(&mail).send().await?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(MailError::Status(response.status().as_u16()))
        }
    }
}
