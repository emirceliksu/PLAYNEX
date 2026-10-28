use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, MultiPart},
    transport::smtp::authentication::Credentials,
};
use serde::Deserialize;

use crate::config::{SmtpConfig, SmtpSecurity};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerificationCopy {
    verification_subject: String,
    verification_greeting: String,
    verification_intro: String,
    verification_expiry: String,
    verification_signature: String,
}

pub struct Mailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    tr: VerificationCopy,
    en: VerificationCopy,
}

pub struct VerificationMail<'a> {
    pub to: &'a str,
    pub first_name: &'a str,
    pub code: &'a str,
    pub locale: &'a str,
    pub valid_minutes: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum MailError {
    #[error("invalid address: {0}")]
    Address(#[from] lettre::address::AddressError),
    #[error("could not build message: {0}")]
    Build(#[from] lettre::error::Error),
    #[error("smtp: {0}")]
    Smtp(#[from] lettre::transport::smtp::Error),
    #[error("message catalog: {0}")]
    Catalog(#[from] serde_json::Error),
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

impl Mailer {
    pub fn new(config: &SmtpConfig) -> Result<Self, MailError> {
        let builder = match config.security {
            SmtpSecurity::None => {
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
            }
            SmtpSecurity::StartTls => {
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)?
            }
            SmtpSecurity::Tls => AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)?,
        }
        .port(config.port);
        let builder = match (&config.username, &config.password) {
            (Some(username), Some(password)) => {
                builder.credentials(Credentials::new(username.clone(), password.clone()))
            }
            _ => builder,
        };

        Ok(Self {
            transport: builder.build(),
            from: config.from.parse()?,
            tr: serde_json::from_str(include_str!("../messages/tr.json"))?,
            en: serde_json::from_str(include_str!("../messages/en.json"))?,
        })
    }

    pub async fn send_verification(&self, mail: VerificationMail<'_>) -> Result<(), MailError> {
        let copy = if mail.locale == "en" {
            &self.en
        } else {
            &self.tr
        };
        let minutes = mail.valid_minutes.to_string();
        let subject = copy.verification_subject.replace("{code}", mail.code);
        let greeting = copy
            .verification_greeting
            .replace("{name}", mail.first_name);
        let expiry = copy.verification_expiry.replace("{minutes}", &minutes);

        let text = format!(
            "{greeting}\n\n{intro}\n\n    {code}\n\n{expiry}\n\n{signature}\n",
            intro = copy.verification_intro,
            code = mail.code,
            signature = copy.verification_signature,
        );
        // Mail clients ignore the token stylesheet, so the colors are written out here;
        // they mirror ink.950, ink.50 and brand.500 from packages/design-tokens.
        let html = format!(
            r#"<!doctype html>
<html lang="{lang}">
<body style="margin:0;padding:32px 16px;background:#14121f;color:#eeedf5;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;">
    <tr><td style="font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.02em;padding-bottom:24px;">PLAYNEX</td></tr>
    <tr><td style="font-size:16px;line-height:1.5;padding-bottom:8px;">{greeting}</td></tr>
    <tr><td style="font-size:16px;line-height:1.5;padding-bottom:24px;">{intro}</td></tr>
    <tr><td style="padding-bottom:24px;">
      <div style="display:inline-block;padding:16px 24px;border:2px solid #eeedf5;border-radius:12px;box-shadow:4px 4px 0 #6d5cf5;font-family:'Space Grotesk',Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:0.3em;">{code}</div>
    </td></tr>
    <tr><td style="font-size:14px;line-height:1.5;color:#b5b2c9;">{expiry}</td></tr>
  </table>
</body>
</html>"#,
            lang = if mail.locale == "en" { "en" } else { "tr" },
            greeting = escape_html(&greeting),
            intro = escape_html(&copy.verification_intro),
            code = mail.code,
            expiry = escape_html(&expiry),
        );

        let message = Message::builder()
            .from(self.from.clone())
            .to(mail.to.parse()?)
            .subject(subject)
            .multipart(MultiPart::alternative_plain_html(text, html))?;
        self.transport.send(message).await?;
        Ok(())
    }
}
