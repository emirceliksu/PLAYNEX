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

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub mailer_url: String,
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
        Ok(Self {
            port: parse_port("PORT", DEFAULT_PORT)?,
            database_url: required("DATABASE_URL")?,
            mailer_url: required("MAILER_URL")?,
        })
    }
}
