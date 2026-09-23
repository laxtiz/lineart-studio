use std::sync::Mutex;

use crate::api_client::ApiClient;
use crate::error::{internal_error, ApiResult};
use crate::types::ApiKeyStatus;

pub struct AppState {
    pub(crate) client: ApiClient,
    session_key: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(client: ApiClient) -> Self {
        Self {
            client,
            session_key: Mutex::new(None),
        }
    }

    pub fn session_key(&self) -> ApiResult<Option<String>> {
        self.session_key
            .lock()
            .map(|value| value.clone())
            .map_err(|_| internal_error())
    }

    pub fn set_session_key(&self, key: Option<String>) -> ApiResult<()> {
        let mut value = self.session_key.lock().map_err(|_| internal_error())?;
        *value = key;
        Ok(())
    }
}

pub fn api_key_status_from_lookup(
    session_configured: bool,
    persistent_result: ApiResult<Option<String>>,
    backend: String,
) -> ApiKeyStatus {
    let persistent = persistent_result.ok().flatten().is_some();
    ApiKeyStatus {
        configured: session_configured || persistent,
        persistent,
        backend,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_status_uses_unconfigured_on_credential_error() {
        let status = api_key_status_from_lookup(
            false,
            Err(crate::error::credential_store_error()),
            "test".to_owned(),
        );
        assert!(!status.configured);
        assert!(!status.persistent);
        assert_eq!(status.backend, "test");
    }

    #[test]
    fn key_status_preserves_session_when_credential_error() {
        let status = api_key_status_from_lookup(
            true,
            Err(crate::error::credential_store_error()),
            "test".to_owned(),
        );
        assert!(status.configured);
        assert!(!status.persistent);
    }

    #[test]
    fn key_status_reports_persistent_entry() {
        let status =
            api_key_status_from_lookup(false, Ok(Some("secret".to_owned())), "test".to_owned());
        assert!(status.configured);
        assert!(status.persistent);
    }
}
