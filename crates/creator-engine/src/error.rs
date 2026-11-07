use serde::Serialize;

/// Codes double as i18n keys in the editor, so renaming one is a UI change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    TooLarge,
    Malformed,
    UnsupportedVersion,
    TooMany,
    DuplicateId,
    DuplicateName,
    InvalidName,
    TextTooLong,
    InvalidNumber,
    OutOfRange,
    InvalidColor,
    InvalidPolygon,
    UnknownVariable,
    UnknownList,
    UnknownFunction,
    UnknownPrefab,
    UnknownSound,
    WrongArgumentCount,
    NestingTooDeep,
    ShapeNotInDimension,
    BehaviorNeedsMovingBody,
    EventNotForStage,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentError {
    pub code: ErrorCode,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl DocumentError {
    pub fn new(code: ErrorCode, path: impl Into<String>) -> Self {
        Self {
            code,
            path: path.into(),
            block: None,
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn at_block(mut self, block: Option<&String>) -> Self {
        self.block = block.cloned();
        self
    }
}
