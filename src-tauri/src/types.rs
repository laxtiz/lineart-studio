use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyStatus {
    pub configured: bool,
    pub persistent: bool,
    pub backend: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub message: String,
    pub model_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAsset {
    pub id: String,
    pub name: String,
    #[serde(alias = "mimeType")]
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub bytes: usize,
    #[serde(alias = "dataUrl")]
    pub data_url: String,
    #[serde(alias = "sourcePath")]
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateImageRequest {
    pub model: String,
    pub prompt: String,
    pub size: String,
    pub watermark: bool,
    #[serde(alias = "promptExtend")]
    pub prompt_extend: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditImageRequest {
    pub model: String,
    pub prompt: String,
    pub size: String,
    pub watermark: bool,
    #[serde(alias = "promptExtend")]
    pub prompt_extend: bool,
    pub images: Vec<ImageAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageResult {
    pub asset: ImageAsset,
    pub model: String,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub images_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizePromptRequest {
    pub prompt: String,
    pub mode: String,
    #[serde(alias = "presetName")]
    pub preset_name: String,
    #[serde(alias = "sourceImage")]
    pub source_image: Option<ImageAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizePromptResult {
    pub original_prompt: String,
    pub optimized_prompt: String,
    pub model: String,
}
