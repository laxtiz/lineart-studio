use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    pub status: Option<u16>,
}

impl ApiError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            status: None,
        }
    }

    pub fn with_status(code: impl Into<String>, message: impl Into<String>, status: u16) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            status: Some(status),
        }
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

pub fn invalid_request(message: impl Into<String>) -> ApiError {
    ApiError::new("invalid_request", message)
}

pub fn internal_error() -> ApiError {
    ApiError::new("internal_error", "内部操作失败，请稍后重试。")
}

pub fn image_limit_error() -> ApiError {
    ApiError::new("image_too_large", "应用限制：单个图像不能超过 25 MiB。")
}

pub fn credential_store_error() -> ApiError {
    ApiError::new(
        "credential_store_error",
        "系统凭据库操作失败，请检查系统凭据服务后重试。",
    )
}

pub fn file_error() -> ApiError {
    ApiError::new("file_error", "图像文件操作失败，请检查路径和文件权限。")
}
