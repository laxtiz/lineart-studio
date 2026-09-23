use std::path::Path;

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::credential_store;
use crate::error::{internal_error, invalid_request, ApiError, ApiResult};
use crate::image;
use crate::state::{api_key_status_from_lookup, AppState};
use crate::types::{
    ApiKeyStatus, ConnectionTestResult, EditImageRequest, GenerateImageRequest, ImageAsset,
    ImageResult, OptimizePromptRequest, OptimizePromptResult,
};

const IMAGE_FILTERS: &[&str] = &["png", "jpg", "jpeg", "webp"];

#[tauri::command]
pub async fn get_api_key_status(state: State<'_, AppState>) -> ApiResult<ApiKeyStatus> {
    let session_configured = state.session_key()?.is_some();
    let persistent_result = run_blocking(credential_store::get).await;
    Ok(api_key_status_from_lookup(
        session_configured,
        persistent_result,
        credential_store::backend_name().to_owned(),
    ))
}

#[tauri::command]
pub async fn set_api_key(
    state: State<'_, AppState>,
    api_key: String,
    remember: bool,
) -> ApiResult<ApiKeyStatus> {
    let key = api_key.trim().to_owned();
    if key.is_empty() {
        return Err(invalid_request("API Key 不能为空。"));
    }
    if key.len() > 16 * 1024 {
        return Err(invalid_request("API Key 长度超过应用限制。"));
    }
    if remember {
        let stored_key = key.clone();
        run_blocking(move || credential_store::set(&stored_key)).await?;
    } else {
        run_blocking(credential_store::clear).await?;
    }
    state.set_session_key(Some(key))?;
    Ok(ApiKeyStatus {
        configured: true,
        persistent: remember,
        backend: credential_store::backend_name().to_owned(),
    })
}

#[tauri::command]
pub async fn clear_api_key(state: State<'_, AppState>) -> ApiResult<ApiKeyStatus> {
    run_blocking(credential_store::clear).await?;
    state.set_session_key(None)?;
    Ok(ApiKeyStatus {
        configured: false,
        persistent: false,
        backend: credential_store::backend_name().to_owned(),
    })
}

#[tauri::command]
pub async fn test_api_connection(state: State<'_, AppState>) -> ApiResult<ConnectionTestResult> {
    let api_key = resolve_api_key(&state).await?;
    match state.client.test_connection(&api_key).await {
        Ok(model_count) => Ok(ConnectionTestResult {
            ok: true,
            message: "连接成功，所需模型均可用。".to_owned(),
            model_count,
        }),
        Err(error) => Ok(ConnectionTestResult {
            ok: false,
            message: error.message,
            model_count: 0,
        }),
    }
}

#[tauri::command]
pub async fn choose_and_import_image<R: Runtime>(
    app: AppHandle<R>,
) -> ApiResult<Option<ImageAsset>> {
    run_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .add_filter("图片", IMAGE_FILTERS)
            .blocking_pick_file()
            .map(|file| file.into_path())
            .transpose()
            .map_err(|_| invalid_request("文件对话框返回了无效路径。"))?;
        match selected {
            Some(path) => image::import_image(path.to_string_lossy().into_owned()).map(Some),
            None => Ok(None),
        }
    })
    .await
}

#[tauri::command]
pub async fn choose_and_save_image<R: Runtime>(
    app: AppHandle<R>,
    data_url: String,
    suggested_name: String,
) -> ApiResult<Option<String>> {
    run_blocking(move || {
        let image_value = image::decode_data_url(&data_url)?;
        let suggested = sanitize_suggested_name(&suggested_name, &image_value.mime_type);
        let selected = app
            .dialog()
            .file()
            .add_filter("图片", IMAGE_FILTERS)
            .set_file_name(suggested)
            .blocking_save_file()
            .map(|file| file.into_path())
            .transpose()
            .map_err(|_| invalid_request("保存对话框返回了无效路径。"))?;
        match selected {
            Some(path) => image::save_validated_image(path, &image_value).map(Some),
            None => Ok(None),
        }
    })
    .await
}

#[tauri::command]
pub async fn generate_image(
    state: State<'_, AppState>,
    request: GenerateImageRequest,
) -> ApiResult<ImageResult> {
    let api_key = resolve_api_key(&state).await?;
    state.client.generate_image(&api_key, &request).await
}

#[tauri::command]
pub async fn edit_image(
    state: State<'_, AppState>,
    request: EditImageRequest,
) -> ApiResult<ImageResult> {
    let api_key = resolve_api_key(&state).await?;
    state.client.edit_image(&api_key, &request).await
}

#[tauri::command]
pub async fn optimize_prompt(
    state: State<'_, AppState>,
    request: OptimizePromptRequest,
) -> ApiResult<OptimizePromptResult> {
    let api_key = resolve_api_key(&state).await?;
    state.client.optimize_prompt(&api_key, &request).await
}

fn sanitize_suggested_name(value: &str, mime: &str) -> String {
    let raw = value.trim();
    let base = Path::new(raw)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image");
    let mut name = base
        .chars()
        .map(|character| match character {
            '/' | '\\' | '\0' => '_',
            _ => character,
        })
        .take(120)
        .collect::<String>();
    if name.is_empty() {
        name.push_str("image");
    }
    if Path::new(&name).extension().is_none() {
        name.push_str(image::extension_for_mime(mime));
    }
    name
}

async fn resolve_api_key(state: &AppState) -> ApiResult<String> {
    if let Some(key) = state.session_key()? {
        if !key.is_empty() {
            return Ok(key);
        }
    }
    let key = run_blocking(credential_store::get)
        .await?
        .ok_or_else(|| ApiError::new("missing_api_key", "尚未配置 API Key。"))?;
    if key.is_empty() {
        return Err(ApiError::new("missing_api_key", "尚未配置 API Key。"));
    }
    Ok(key)
}

async fn run_blocking<T, F>(operation: F) -> ApiResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> ApiResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| internal_error())?
}
