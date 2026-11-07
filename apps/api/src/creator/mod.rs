mod community;
mod projects;
mod publish;
mod runs;

pub use runs::replay_slots;

use axum::Router;
use playnex_creator_engine::{
    DocumentError, GameDocument, document::Dimension, limits::MAX_DOCUMENT_BYTES,
};
use serde::Serialize;
use serde_json::Value;

use crate::{AppState, error::ApiError};

const TITLE_LIMIT: usize = 60;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(projects::router())
        .merge(publish::router())
        .merge(community::router())
        .merge(runs::router())
}

fn dimension_name(dimension: Dimension) -> &'static str {
    match dimension {
        Dimension::Flat => "2d",
        Dimension::Spatial => "3d",
    }
}

/// Drafts are stored even when they do not compile yet (a block may point at
/// a variable the player has not created), but they must have the document's
/// shape and stay under the size limit.
fn parse_draft(document: &Value) -> Result<GameDocument, ApiError> {
    let encoded = serde_json::to_vec(document)?;
    if encoded.len() > MAX_DOCUMENT_BYTES {
        return Err(ApiError::field("document", "too_large"));
    }
    serde_json::from_value(document.clone()).map_err(|_| ApiError::field("document", "malformed"))
}

fn clean_title(title: &str) -> Result<String, ApiError> {
    let title = title.trim();
    let length = title.chars().count();
    if length == 0 || length > TITLE_LIMIT || title.chars().any(char::is_control) {
        return Err(ApiError::field("title", "invalid"));
    }
    Ok(title.to_owned())
}

/// Everything a document can show to other players must pass the chat filter;
/// collecting every string covers names, labels and text blocks alike.
fn offensive_text(document: &Value) -> bool {
    fn visit(value: &Value, found: &mut bool) {
        match value {
            Value::String(text) => {
                if playnex_chat_filter::censor(text) != *text {
                    *found = true;
                }
            }
            Value::Array(items) => items.iter().for_each(|item| visit(item, found)),
            Value::Object(fields) => fields.values().for_each(|item| visit(item, found)),
            _ => {}
        }
    }
    let mut found = false;
    visit(document, &mut found);
    found
}

#[derive(Serialize)]
struct InvalidDocument<'a> {
    error: &'static str,
    errors: &'a [DocumentError],
}
