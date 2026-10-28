use std::env;

use thiserror::Error;

const DEFAULT_PORT: u16 = 8080;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("{0} is not set")]
    Missing(&'static str),
    #[error("{name} has an invalid value: {value}")]
    Invalid { name: &'static str, value: String },
}

#[derive(Clone, Copy, Debug)]
pub enum SmtpSecurity {
    None,
    StartTls,
    Tls,
}

#[derive(Clone, Debug)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub security: SmtpSecurity,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Clone, Debug)]
pub enum MailTransport {
    Smtp(SmtpConfig),
    /// Service account key file (JSON or base64 of it) with domain-wide delegation.
    Gmail {
        service_account: String,
    },
}

#[derive(Clone, Debug)]
pub struct MailConfig {
    pub transport: MailTransport,
    pub from: String,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub mail: MailConfig,
}

fn required(name: &'static str) -> Result<String, ConfigError> {
    env::var(name)
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or(ConfigError::Missing(name))
}

fn optional(name: &'static str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.is_empty())
}

fn parse_port(name: &'static str, fallback: u16) -> Result<u16, ConfigError> {
    match optional(name) {
        None => Ok(fallback),
        Some(value) => value
            .parse()
            .map_err(|_| ConfigError::Invalid { name, value }),
    }
}

fn smtp_from_env() -> Result<SmtpConfig, ConfigError> {
    let security = match optional("SMTP_SECURITY").as_deref() {
        None | Some("starttls") => SmtpSecurity::StartTls,
        Some("tls") => SmtpSecurity::Tls,
        Some("none") => SmtpSecurity::None,
        Some(other) => {
            return Err(ConfigError::Invalid {
                name: "SMTP_SECURITY",
                value: other.to_owned(),
            });
        }
    };
    let default_smtp_port = match security {
        SmtpSecurity::None => 25,
        SmtpSecurity::StartTls => 587,
        SmtpSecurity::Tls => 465,
    };

    Ok(SmtpConfig {
        host: required("SMTP_HOST")?,
        port: parse_port("SMTP_PORT", default_smtp_port)?,
        security,
        username: optional("SMTP_USERNAME"),
        password: optional("SMTP_PASSWORD"),
    })
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let transport = match optional("GMAIL_SERVICE_ACCOUNT") {
            Some(service_account) => MailTransport::Gmail { service_account },
            None => MailTransport::Smtp(smtp_from_env()?),
        };

        Ok(Self {
            port: parse_port("PORT", DEFAULT_PORT)?,
            database_url: required("DATABASE_URL")?,
            mail: MailConfig {
                transport,
                from: required("MAIL_FROM")?,
            },
        })
    }
}
