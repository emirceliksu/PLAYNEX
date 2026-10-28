use std::time::Duration;

use serde_json::Value;
use tokio::sync::mpsc;
use tracing::warn;

const QUEUE: usize = 256;
const ATTEMPTS: u32 = 3;

// Match results go to the API over the internal network; the API makes them idempotent
// by match id, so a retry after a timeout cannot count a match twice.
pub fn spawn(url: String, token: String) -> mpsc::Sender<Value> {
    let (tx, mut rx) = mpsc::channel::<Value>(QUEUE);
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        while let Some(report) = rx.recv().await {
            for attempt in 1..=ATTEMPTS {
                let sent = client
                    .post(&url)
                    .header("x-internal-token", &token)
                    .timeout(Duration::from_secs(5))
                    .json(&report)
                    .send()
                    .await;
                match sent {
                    Ok(response) if response.status().is_success() => break,
                    Ok(response) => {
                        warn!(status = %response.status(), attempt, "match report rejected")
                    }
                    Err(error) => warn!(%error, attempt, "match report failed"),
                }
                tokio::time::sleep(Duration::from_secs(2 * u64::from(attempt))).await;
            }
        }
    });
    tx
}
