use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use crate::error::ApiError;

// Buckets live in process memory: the API runs as a single instance behind the web app.
// Moving to several replicas means moving these counters to Valkey.
const PRUNE_ABOVE: usize = 10_000;

#[derive(Default)]
pub struct RateLimiter {
    windows: Mutex<HashMap<String, (Instant, u32)>>,
}

impl RateLimiter {
    pub fn check(
        &self,
        action: &str,
        client: &str,
        limit: u32,
        window: Duration,
    ) -> Result<(), ApiError> {
        let now = Instant::now();
        let mut windows = self
            .windows
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        if windows.len() > PRUNE_ABOVE {
            windows.retain(|_, (started, _)| now.duration_since(*started) < window);
        }

        let entry = windows
            .entry(format!("{action}:{client}"))
            .or_insert((now, 0));
        if now.duration_since(entry.0) >= window {
            *entry = (now, 0);
        }
        if entry.1 >= limit {
            let retry_after = window.saturating_sub(now.duration_since(entry.0));
            return Err(ApiError::RateLimited {
                retry_after_secs: retry_after.as_secs().max(1),
            });
        }
        entry.1 += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_the_limit_within_a_window() {
        let limiter = RateLimiter::default();
        let window = Duration::from_secs(60);
        assert!(limiter.check("login", "10.0.0.1", 2, window).is_ok());
        assert!(limiter.check("login", "10.0.0.1", 2, window).is_ok());
        assert!(matches!(
            limiter.check("login", "10.0.0.1", 2, window),
            Err(ApiError::RateLimited { .. })
        ));
        assert!(limiter.check("login", "10.0.0.2", 2, window).is_ok());
    }
}
