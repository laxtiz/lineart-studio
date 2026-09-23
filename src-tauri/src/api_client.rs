use std::time::Duration;

use reqwest::{Client, Response, StatusCode};
use serde_json::{json, Map, Value};

use crate::error::{image_limit_error, invalid_request, ApiError, ApiResult};
use crate::image::{asset_from_validated, decode_api_image, validate_edit_images, ValidatedImage};
use crate::types::{
    EditImageRequest, GenerateImageRequest, ImageResult, OptimizePromptRequest,
    OptimizePromptResult, Usage,
};
use crate::validation::{
    validate_mode, validate_model, validate_preset_name, validate_prompt, validate_size,
    PromptMode, DEFAULT_PROMPT_MODEL, IMAGE_MODELS,
};

pub const API_BASE_URL: &str = "https://token.sensenova.cn/v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_IMAGE_RESPONSE_BYTES: usize = 48 * 1024 * 1024;
const MAX_CHAT_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const MAX_ERROR_BODY_BYTES: usize = 64 * 1024;
const CHAT_MAX_TOKENS: u64 = 2048;
const MAX_OPTIMIZED_PROMPT_CHARS: usize = 4000;

const GENERATE_SYSTEM_PROMPT: &str = "你是线稿上色图像生成提示词优化器。可以丰富主体、构图、视角、空间层次、材质、风格、色彩和光影表达，但必须尊重用户明确的主体与约束。只输出一个合法 JSON 对象，格式为 { \"optimized_prompt\": \"优化后的提示词\" }，不要输出 Markdown、解释、前缀或任何其他字段。";
const EDIT_SYSTEM_PROMPT: &str = "你是线稿上色图像编辑提示词优化器。必须保持原图的主体、构图、线稿、视角、比例和空间关系不变，不得新增、删除或重绘主体，只能优化颜色、材质、光影和上色要求。只输出一个合法 JSON 对象，格式为 { \"optimized_prompt\": \"优化后的提示词\" }，不要输出 Markdown、解释、前缀或任何其他字段。";

#[derive(Clone)]
pub struct ApiClient {
    client: Client,
}

#[derive(Clone, Copy)]
enum Endpoint {
    Models,
    GenerateImages,
    EditImages,
    ChatCompletions,
}

impl Endpoint {
    fn path(self) -> &'static str {
        match self {
            Self::Models => "/models",
            Self::GenerateImages => "/images/generations",
            Self::EditImages => "/images/edits",
            Self::ChatCompletions => "/chat/completions",
        }
    }
}

impl ApiClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .use_rustls_tls()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("failed to build HTTP client");
        Self { client }
    }

    pub async fn generate_image(
        &self,
        api_key: &str,
        request: &GenerateImageRequest,
    ) -> ApiResult<ImageResult> {
        let model = validate_model(&request.model)?;
        let prompt = validate_prompt(&request.prompt)?;
        let size = request.size.trim();
        validate_size(size)?;
        let size = if size.eq_ignore_ascii_case("auto") {
            "auto"
        } else {
            size
        };
        let body = build_generate_body(
            &model,
            &prompt,
            size,
            request.watermark,
            request.prompt_extend,
        );
        let response = self
            .post_json(Endpoint::GenerateImages, api_key, body)
            .await?;
        parse_image_result(&response, &model)
    }

    pub async fn edit_image(
        &self,
        api_key: &str,
        request: &EditImageRequest,
    ) -> ApiResult<ImageResult> {
        let model = validate_model(&request.model)?;
        let prompt = validate_prompt(&request.prompt)?;
        let size = request.size.trim();
        validate_size(size)?;
        let size = if size.eq_ignore_ascii_case("auto") {
            "auto"
        } else {
            size
        };
        let images = validate_edit_images(&request.images)?;
        let body = build_edit_body(
            &model,
            &prompt,
            size,
            request.watermark,
            request.prompt_extend,
            &images,
        );
        let response = self.post_json(Endpoint::EditImages, api_key, body).await?;
        parse_image_result(&response, &model)
    }

    pub async fn optimize_prompt(
        &self,
        api_key: &str,
        request: &OptimizePromptRequest,
    ) -> ApiResult<OptimizePromptResult> {
        let prompt = validate_prompt(&request.prompt)?;
        let mode = validate_mode(&request.mode)?;
        let preset_name = validate_preset_name(&request.preset_name)?;
        let source_image = request
            .source_image
            .as_ref()
            .map(crate::image::validate_asset)
            .transpose()?;
        if mode == PromptMode::Edit && source_image.is_none() {
            return Err(invalid_request("编辑模式需要提供原图。"));
        }
        let body = build_chat_body(&prompt, mode, &preset_name, source_image.as_ref());
        let response = self
            .post_json(Endpoint::ChatCompletions, api_key, body)
            .await?;
        if response.get("error").is_some() {
            return Err(content_filter_or_invalid_response(&response));
        }
        let finish_reason = response
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("finish_reason"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_ascii_lowercase();
        if finish_reason.contains("content_filter") || finish_reason.contains("safety") {
            return Err(ApiError::new(
                "content_filtered",
                "请求被内容安全策略拦截，请调整提示词或图片。",
            ));
        }
        let content = extract_chat_content(&response)?;
        let optimized_prompt = ensure_prompt_limit(parse_optimized_prompt(&content)?)?;
        Ok(OptimizePromptResult {
            original_prompt: request.prompt.clone(),
            optimized_prompt,
            model: DEFAULT_PROMPT_MODEL.to_owned(),
        })
    }

    pub async fn test_connection(&self, api_key: &str) -> ApiResult<u32> {
        let response = self.get_json(Endpoint::Models, api_key).await?;
        validate_required_models(&response)
    }

    async fn post_json(&self, endpoint: Endpoint, api_key: &str, body: Value) -> ApiResult<Value> {
        let response = self
            .client
            .post(endpoint_url(endpoint))
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await
            .map_err(map_reqwest_error)?;
        if response.status().is_success() {
            let max_bytes = match endpoint {
                Endpoint::GenerateImages | Endpoint::EditImages => MAX_IMAGE_RESPONSE_BYTES,
                Endpoint::Models | Endpoint::ChatCompletions => MAX_CHAT_RESPONSE_BYTES,
            };
            decode_success(response, max_bytes).await
        } else {
            Err(map_error_response(response).await)
        }
    }

    async fn get_json(&self, endpoint: Endpoint, api_key: &str) -> ApiResult<Value> {
        let response = self
            .client
            .get(endpoint_url(endpoint))
            .bearer_auth(api_key)
            .send()
            .await
            .map_err(map_reqwest_error)?;
        if response.status().is_success() {
            decode_success(response, MAX_CHAT_RESPONSE_BYTES).await
        } else {
            Err(map_error_response(response).await)
        }
    }
}

fn build_generate_body(
    model: &str,
    prompt: &str,
    size: &str,
    watermark: bool,
    prompt_extend: bool,
) -> Value {
    json!({
        "model": model,
        "prompt": prompt,
        "size": size,
        "watermark": watermark,
        "prompt_extend": prompt_extend,
        "response_format": "b64_json",
        "output_format": "png",
        "n": 1
    })
}

fn build_edit_body(
    model: &str,
    prompt: &str,
    size: &str,
    watermark: bool,
    prompt_extend: bool,
    images: &[ValidatedImage],
) -> Value {
    let image_values = images
        .iter()
        .map(|image| json!({ "image_url": image.data_url }))
        .collect::<Vec<_>>();
    json!({
        "model": model,
        "images": image_values,
        "prompt": prompt,
        "size": size,
        "watermark": watermark,
        "prompt_extend": prompt_extend,
        "response_format": "b64_json",
        "output_format": "png",
        "n": 1
    })
}

fn build_chat_body(
    prompt: &str,
    mode: PromptMode,
    preset_name: &str,
    source_image: Option<&ValidatedImage>,
) -> Value {
    let (system_prompt, user_prompt) = match mode {
        PromptMode::Generate => (
            GENERATE_SYSTEM_PROMPT,
            format!(
                "请优化用于生成线稿上色图像的提示词。模式：generate。预设：{}。可以丰富主体、构图、风格、材质、色彩和光影，但必须尊重原始意图。原始提示词：\n{}",
                preset_name, prompt
            ),
        ),
        PromptMode::Edit => (
            EDIT_SYSTEM_PROMPT,
            format!(
                "请基于原图优化线稿上色编辑提示词。模式：edit。预设：{}。必须保持原图主体、构图、线稿、视角和比例不变，只描述颜色、材质、光影和上色要求。原始提示词：\n{}",
                preset_name, prompt
            ),
        ),
    };
    let mut content = vec![json!({
        "type": "text",
        "text": user_prompt
    })];
    if let Some(source_image) = source_image {
        content.push(json!({
            "type": "image_url",
            "image_url": { "url": source_image.data_url }
        }));
    }
    json!({
        "model": DEFAULT_PROMPT_MODEL,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": content
            }
        ],
        "response_format": { "type": "json_object" },
        "max_tokens": CHAT_MAX_TOKENS,
        "stream": false
    })
}

fn endpoint_url(endpoint: Endpoint) -> String {
    format!("{API_BASE_URL}{}", endpoint.path())
}

async fn decode_success(mut response: Response, max_bytes: usize) -> ApiResult<Value> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(invalid_response("API 响应超过应用允许的大小。"));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(map_reqwest_error)? {
        if body.len().saturating_add(chunk.len()) > max_bytes {
            return Err(invalid_response("API 响应超过应用允许的大小。"));
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| invalid_response("API 返回了无效的 JSON 响应。"))
}

async fn map_error_response(mut response: Response) -> ApiError {
    let status = response.status();
    let body = read_error_body(&mut response).await;
    let body_text = String::from_utf8_lossy(&body).to_ascii_lowercase();
    let filtered = body_text.contains("content_filter")
        || body_text.contains("content policy")
        || body_text.contains("safety")
        || body_text.contains("敏感")
        || body_text.contains("过滤");
    let code = if filtered && status.is_client_error() {
        "content_filtered"
    } else {
        match status {
            StatusCode::BAD_REQUEST => "bad_request",
            StatusCode::UNAUTHORIZED => "unauthorized",
            StatusCode::FORBIDDEN => "forbidden",
            StatusCode::REQUEST_TIMEOUT => "timeout",
            StatusCode::TOO_MANY_REQUESTS => "rate_limited",
            StatusCode::NOT_FOUND => "not_found",
            StatusCode::PAYLOAD_TOO_LARGE => "image_too_large",
            _ if status.is_server_error() => "server_error",
            _ => "upstream_error",
        }
    };
    let message = match code {
        "content_filtered" => "请求被内容安全策略拦截，请调整提示词或图片。",
        "bad_request" => "请求参数无效，请检查模型、提示词和图像尺寸。",
        "unauthorized" => "API Key 无效或已过期。",
        "forbidden" => "当前 API Key 没有执行此操作的权限。",
        "timeout" => "请求超时，请稍后重试。",
        "rate_limited" => "请求过于频繁，请稍后重试。",
        "not_found" => "请求的服务接口不可用。",
        "image_too_large" => "应用限制：单个图像不能超过 25 MiB。",
        "server_error" => "服务暂时不可用，请稍后重试。",
        _ => "上游服务返回了无法处理的响应。",
    };
    ApiError::with_status(code, message, status.as_u16())
}

async fn read_error_body(response: &mut Response) -> Vec<u8> {
    let mut body = Vec::new();
    while body.len() < MAX_ERROR_BODY_BYTES {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                let remaining = MAX_ERROR_BODY_BYTES - body.len();
                if chunk.len() > remaining {
                    body.extend_from_slice(&chunk[..remaining]);
                } else {
                    body.extend_from_slice(&chunk);
                }
            }
            Ok(None) | Err(_) => break,
        }
    }
    body
}

fn map_reqwest_error(error: reqwest::Error) -> ApiError {
    if error.is_timeout() {
        ApiError::new("timeout", "请求超时，请稍后重试。")
    } else {
        ApiError::new("network_error", "网络请求失败，请检查网络连接后重试。")
    }
}

fn invalid_response(message: impl Into<String>) -> ApiError {
    ApiError::new("invalid_response", message)
}

fn parse_image_result(response: &Value, model: &str) -> ApiResult<ImageResult> {
    if response.get("error").is_some() {
        return Err(content_filter_or_invalid_response(response));
    }
    let data = response
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid_response("图像响应缺少 data 数组。"))?;
    let first = data
        .first()
        .ok_or_else(|| invalid_response("API 没有返回图像。"))?;
    let encoded = first
        .get("b64_json")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_response("图像响应缺少 b64_json。"))?;
    let image = decode_api_image(encoded).map_err(map_output_image_error)?;
    let asset = asset_from_validated("generated.png", image, None);
    let usage = parse_usage(response.get("usage"))?;
    Ok(ImageResult {
        asset,
        model: model.to_owned(),
        usage,
    })
}

fn map_output_image_error(error: ApiError) -> ApiError {
    if error.code == "image_too_large" {
        image_limit_error()
    } else {
        invalid_response("API 返回的图像格式无效。")
    }
}

fn content_filter_or_invalid_response(response: &Value) -> ApiError {
    let error_text = response
        .get("error")
        .map(|value| value.to_string().to_ascii_lowercase())
        .unwrap_or_default();
    if error_text.contains("content_filter")
        || error_text.contains("content policy")
        || error_text.contains("safety")
        || error_text.contains("敏感")
        || error_text.contains("过滤")
    {
        ApiError::new(
            "content_filtered",
            "请求被内容安全策略拦截，请调整提示词或图片。",
        )
    } else {
        invalid_response("API 返回了错误响应。")
    }
}

fn parse_usage(value: Option<&Value>) -> ApiResult<Option<Usage>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let object = value
        .as_object()
        .ok_or_else(|| invalid_response("API usage 响应格式无效。"))?;
    Ok(Some(Usage {
        input_tokens: optional_u64(object, "input_tokens")?,
        output_tokens: optional_u64(object, "output_tokens")?,
        total_tokens: optional_u64(object, "total_tokens")?,
        images_count: optional_u64(object, "images_count")?
            .or(optional_u64(object, "image_count")?),
    }))
}

fn optional_u64(object: &Map<String, Value>, key: &str) -> ApiResult<Option<u64>> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    value
        .as_u64()
        .map(Some)
        .ok_or_else(|| invalid_response("API usage 响应格式无效。"))
}

fn parse_model_ids(response: &Value) -> ApiResult<Vec<String>> {
    let data = response
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid_response("模型列表响应格式无效。"))?;
    Ok(data
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str))
        .map(str::to_owned)
        .collect())
}

fn validate_required_models(response: &Value) -> ApiResult<u32> {
    let ids = parse_model_ids(response)?;
    let has_image_model = IMAGE_MODELS
        .iter()
        .any(|required| ids.iter().any(|id| id == required));
    let has_optimizer = ids.iter().any(|id| id == DEFAULT_PROMPT_MODEL);
    if !has_image_model || !has_optimizer {
        let mut missing = Vec::new();
        if !has_image_model {
            missing.push(IMAGE_MODELS.join(" 或 "));
        }
        if !has_optimizer {
            missing.push(DEFAULT_PROMPT_MODEL.to_owned());
        }
        return Err(ApiError::new(
            "required_models_missing",
            format!("模型列表缺少：{}。", missing.join("、")),
        ));
    }
    Ok(ids.len() as u32)
}

fn extract_chat_content(response: &Value) -> ApiResult<String> {
    let choice = response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .ok_or_else(|| invalid_response("提示词响应缺少 choices。"))?;
    let content = choice
        .get("message")
        .and_then(|message| message.get("content"))
        .ok_or_else(|| invalid_response("提示词响应缺少 message.content。"))?;
    match content {
        Value::String(value) if !value.trim().is_empty() => Ok(value.clone()),
        Value::Array(parts) => {
            let mut result = String::new();
            for part in parts {
                if part.get("type").and_then(Value::as_str) == Some("text") {
                    if let Some(value) = part.get("text").and_then(Value::as_str) {
                        result.push_str(value);
                    }
                }
            }
            if result.trim().is_empty() {
                Err(invalid_response("提示词响应内容为空。"))
            } else {
                Ok(result)
            }
        }
        _ => Err(invalid_response("提示词响应内容格式无效。")),
    }
}

fn ensure_prompt_limit(prompt: String) -> ApiResult<String> {
    if prompt.chars().count() > MAX_OPTIMIZED_PROMPT_CHARS {
        return Err(ApiError::new(
            "optimized_prompt_too_long",
            "提示词优化结果不能超过 4000 个字符。",
        ));
    }
    Ok(prompt)
}

fn parse_optimized_prompt(content: &str) -> ApiResult<String> {
    let value = content.trim();
    if value.is_empty() {
        return Err(invalid_response("提示词优化结果为空。"));
    }
    let unfenced = strip_code_fence(value);
    let fragment = extract_json_fragment(value);
    let candidates = [value, unfenced.as_str(), fragment.as_deref().unwrap_or("")];
    for candidate in candidates {
        if candidate.is_empty() {
            continue;
        }
        if let Ok(json_value) = serde_json::from_str::<Value>(candidate) {
            if let Some(prompt) = prompt_from_json(&json_value) {
                return Ok(prompt);
            }
            return Err(invalid_response("提示词优化结果不是指定 JSON 格式。"));
        }
    }
    if looks_like_json(&unfenced) {
        return Err(invalid_response("提示词优化结果不是有效 JSON。"));
    }
    let plain = if unfenced.is_empty() {
        value
    } else {
        unfenced.as_str()
    };
    if plain.trim().is_empty() {
        Err(invalid_response("提示词优化结果为空。"))
    } else {
        Ok(plain.trim().to_owned())
    }
}

fn prompt_from_json(value: &Value) -> Option<String> {
    let prompt = value.get("optimized_prompt")?.as_str()?.trim();
    if prompt.is_empty() {
        None
    } else {
        Some(prompt.to_owned())
    }
}

fn extract_json_fragment(value: &str) -> Option<String> {
    let start = value.find('{')?;
    let end = value.rfind('}')?;
    if end <= start {
        None
    } else {
        Some(value[start..=end].to_owned())
    }
}

fn looks_like_json(value: &str) -> bool {
    (value.starts_with('{') && value.ends_with('}'))
        || (value.starts_with('[') && value.ends_with(']'))
}

fn strip_code_fence(value: &str) -> String {
    if !value.starts_with("```") || !value.ends_with("```") {
        return value.to_owned();
    }
    let inner = &value[3..value.len() - 3];
    let inner = inner
        .strip_prefix("json")
        .or_else(|| inner.strip_prefix("JSON"))
        .unwrap_or(inner);
    inner.trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image::validate_bytes;
    use base64::Engine as _;

    fn image_data() -> ValidatedImage {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
            .unwrap();
        validate_bytes(&bytes, Some("image/png")).unwrap()
    }

    #[test]
    fn builds_generate_request_json() {
        let body = build_generate_body("sensenova-u1.5-lite", "柔和上色", "1024x1024", false, true);
        assert_eq!(body["response_format"], "b64_json");
        assert_eq!(body["output_format"], "png");
        assert_eq!(body["n"], 1);
        assert!(body.get("images").is_none());
        assert!(body.get("mask").is_none());
    }

    #[test]
    fn builds_edit_request_json_in_order() {
        let first = image_data();
        let second = first.clone();
        let body = build_edit_body(
            "sensenova-u1.5-lite",
            "保持线稿",
            "auto",
            false,
            true,
            &[first, second],
        );
        assert_eq!(body["images"].as_array().unwrap().len(), 2);
        assert!(body["images"][0]["image_url"].is_string());
        assert_eq!(
            body["images"][0]["image_url"],
            body["images"][1]["image_url"]
        );
        assert!(body.get("mask").is_none());
    }

    #[test]
    fn builds_chat_request_json_for_both_modes() {
        let image = image_data();
        let generate = build_chat_body("生成", PromptMode::Generate, "水彩", None);
        assert_eq!(
            generate["response_format"],
            json!({ "type": "json_object" })
        );
        assert_eq!(generate["max_tokens"], 2048);
        assert!(generate["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("丰富"));
        let edit = build_chat_body("编辑", PromptMode::Edit, "水彩", Some(&image));
        assert!(edit["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("保持原图"));
        assert_eq!(edit["messages"][1]["content"][1]["type"], "image_url");
    }

    #[test]
    fn parses_only_data_ids_for_model_check() {
        let response = json!({
            "data": [
                { "id": "sensenova-u1.5-lite" },
                { "id": "sensenova-u1.5-fast" },
                { "id": "sensenova-6.8-flash-lite" },
                { "model": "sensenova-u1.5-lite" }
            ]
        });
        assert_eq!(validate_required_models(&response).unwrap(), 3);
        let one_image_model = json!({
            "data": [
                { "id": "sensenova-u1.5-lite" },
                { "id": "sensenova-6.8-flash-lite" }
            ]
        });
        assert_eq!(validate_required_models(&one_image_model).unwrap(), 2);
        let other_image_model = json!({
            "data": [
                { "id": "sensenova-u1.5-fast" },
                { "id": "sensenova-6.8-flash-lite" }
            ]
        });
        assert_eq!(validate_required_models(&other_image_model).unwrap(), 2);
        let missing_optimizer = json!({ "data": [{ "id": "sensenova-u1.5-lite" }] });
        let error = validate_required_models(&missing_optimizer).unwrap_err();
        assert_eq!(error.code, "required_models_missing");
        assert!(error.message.contains(DEFAULT_PROMPT_MODEL));
        let missing_image_model = json!({ "data": [{ "id": DEFAULT_PROMPT_MODEL }] });
        let error = validate_required_models(&missing_image_model).unwrap_err();
        assert_eq!(error.code, "required_models_missing");
        assert!(error.message.contains(IMAGE_MODELS[0]));
        assert!(error.message.contains(IMAGE_MODELS[1]));
    }

    #[test]
    fn enforces_optimized_prompt_unicode_limit() {
        let result = ensure_prompt_limit("a".repeat(MAX_OPTIMIZED_PROMPT_CHARS)).unwrap();
        assert_eq!(result.chars().count(), MAX_OPTIMIZED_PROMPT_CHARS);
        assert_eq!(
            ensure_prompt_limit("a".repeat(MAX_OPTIMIZED_PROMPT_CHARS + 1))
                .unwrap_err()
                .code,
            "optimized_prompt_too_long"
        );
    }

    #[test]
    fn parses_json_prompt() {
        let value = r#"{"optimized_prompt":"保留线稿的柔和蓝色上色"}"#;
        assert_eq!(
            parse_optimized_prompt(value).unwrap(),
            "保留线稿的柔和蓝色上色"
        );
    }

    #[test]
    fn parses_fenced_json_prompt() {
        let value = "```json\n{\"optimized_prompt\":\"柔和配色\"}\n```";
        assert_eq!(parse_optimized_prompt(value).unwrap(), "柔和配色");
    }

    #[test]
    fn falls_back_to_plain_text() {
        assert_eq!(
            parse_optimized_prompt("柔和、自然、保持线稿").unwrap(),
            "柔和、自然、保持线稿"
        );
    }
}
