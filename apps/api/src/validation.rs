use std::str::FromStr;

use lettre::Address;

use crate::error::FieldErrors;

pub const PASSWORD_MIN: usize = 10;
pub const PASSWORD_MAX: usize = 128;
const NAME_MAX: usize = 50;
const EMAIL_MAX: usize = 254;

pub fn normalize_username(raw: &str) -> String {
    raw.trim().to_lowercase()
}

pub fn normalize_email(raw: &str) -> String {
    raw.trim().to_lowercase()
}

pub fn normalize_name(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn check_username(username: &str, errors: &mut FieldErrors) {
    let length = username.chars().count();
    if !(3..=20).contains(&length) {
        errors.insert("username", "length");
        return;
    }
    let mut chars = username.chars();
    let starts_well = chars
        .next()
        .is_some_and(|first| first.is_ascii_lowercase() || first.is_ascii_digit());
    let rest_ok =
        chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '.');
    if !starts_well || !rest_ok {
        errors.insert("username", "format");
    }
}

pub fn check_email(email: &str, errors: &mut FieldErrors) {
    let has_domain_dot = email
        .rsplit_once('@')
        .is_some_and(|(_, domain)| domain.contains('.') && !domain.ends_with('.'));
    if email.len() > EMAIL_MAX || !has_domain_dot || Address::from_str(email).is_err() {
        errors.insert("email", "format");
    }
}

pub fn check_name(field: &'static str, name: &str, errors: &mut FieldErrors) {
    let length = name.chars().count();
    if length == 0 || length > NAME_MAX {
        errors.insert(field, "length");
    } else if name.chars().any(char::is_control) {
        errors.insert(field, "format");
    }
}

pub fn check_password(password: &str, errors: &mut FieldErrors) {
    let length = password.chars().count();
    if !(PASSWORD_MIN..=PASSWORD_MAX).contains(&length) {
        errors.insert("password", "length");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn username_error(value: &str) -> Option<&'static str> {
        let mut errors = FieldErrors::new();
        check_username(value, &mut errors);
        errors.get("username").copied()
    }

    #[test]
    fn usernames_follow_the_schema_rule() {
        assert_eq!(username_error("emir_c"), None);
        assert_eq!(username_error("kaan.d"), None);
        assert_eq!(username_error("ab"), Some("length"));
        assert_eq!(username_error("_emir"), Some("format"));
        assert_eq!(username_error("emir-c"), Some("format"));
        assert_eq!(username_error("çelik"), Some("format"));
    }

    #[test]
    fn emails_need_a_dotted_domain() {
        let mut errors = FieldErrors::new();
        check_email("oyuncu@meccode.com", &mut errors);
        assert!(errors.is_empty());
        check_email("oyuncu@localhost", &mut errors);
        assert_eq!(errors.get("email"), Some(&"format"));
    }

    #[test]
    fn names_collapse_inner_whitespace() {
        assert_eq!(normalize_name("  Ayşe   Nur "), "Ayşe Nur");
    }
}
