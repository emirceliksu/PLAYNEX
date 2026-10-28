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
    pub from: String,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub smtp: SmtpConfig,
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

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
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

        Ok(Self {
            port: parse_port("PORT", DEFAULT_PORT)?,
            database_url: required("DATABASE_URL")?,
            smtp: SmtpConfig {
                host: required("SMTP_HOST")?,
                port: parse_port("SMTP_PORT", default_smtp_port)?,
                security,
                username: optional("SMTP_USERNAME"),
                password: optional("SMTP_PASSWORD"),
                from: required("MAIL_FROM")?,
            },
        })
    }
}
