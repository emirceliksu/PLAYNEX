use std::rc::Rc;

use crate::document::Literal;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Number(f64),
    Text(Rc<str>),
    Bool(bool),
}

impl Value {
    pub fn zero() -> Value {
        Value::Number(0.0)
    }

    pub fn number(&self) -> f64 {
        match self {
            Value::Number(n) => *n,
            Value::Bool(b) => f64::from(u8::from(*b)),
            Value::Text(t) => t
                .trim()
                .parse::<f64>()
                .ok()
                .filter(|n| n.is_finite())
                .unwrap_or(0.0),
        }
    }

    pub fn truthy(&self) -> bool {
        match self {
            Value::Number(n) => *n != 0.0,
            Value::Bool(b) => *b,
            Value::Text(t) => !t.is_empty() && !t.eq_ignore_ascii_case("false") && &**t != "0",
        }
    }

    pub fn text(&self) -> Rc<str> {
        match self {
            Value::Text(t) => t.clone(),
            Value::Bool(b) => Rc::from(if *b { "true" } else { "false" }),
            Value::Number(n) => Rc::from(format_number(*n)),
        }
    }

    /// Numbers compare numerically when both sides read as numbers, so "3" == 3,
    /// matching how players expect a text box holding a digit to behave.
    pub fn loosely_equals(&self, other: &Value) -> bool {
        match (self.as_number(), other.as_number()) {
            (Some(a), Some(b)) => a == b,
            _ => self.text().to_lowercase() == other.text().to_lowercase(),
        }
    }

    fn as_number(&self) -> Option<f64> {
        match self {
            Value::Number(n) => Some(*n),
            Value::Bool(b) => Some(f64::from(u8::from(*b))),
            Value::Text(t) => t.trim().parse::<f64>().ok().filter(|n| n.is_finite()),
        }
    }
}

impl From<&Literal> for Value {
    fn from(literal: &Literal) -> Self {
        match literal {
            Literal::Number(n) => Value::Number(*n),
            Literal::Bool(b) => Value::Bool(*b),
            Literal::Text(t) => Value::Text(Rc::from(t.as_str())),
        }
    }
}

/// Keeps non-finite values out of the simulation: a division by zero in a
/// player's script must not poison positions with NaN.
pub fn finite(n: f64) -> f64 {
    if n.is_finite() { n } else { 0.0 }
}

pub fn format_number(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        let rounded = libm::round(n * 1000.0) / 1000.0;
        format!("{rounded}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_digits_in_text_as_numbers() {
        assert!(Value::Text(Rc::from("3")).loosely_equals(&Value::Number(3.0)));
        assert!(Value::Text(Rc::from("Elma")).loosely_equals(&Value::Text(Rc::from("elma"))));
        assert!(!Value::Text(Rc::from("3a")).loosely_equals(&Value::Number(3.0)));
    }

    #[test]
    fn formats_whole_numbers_without_fraction() {
        assert_eq!(format_number(12.0), "12");
        assert_eq!(format_number(0.12345), "0.123");
    }
}
