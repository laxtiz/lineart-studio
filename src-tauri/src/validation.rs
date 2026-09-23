use crate::error::{invalid_request, ApiError, ApiResult};

pub const DEFAULT_PROMPT_MODEL: &str = "sensenova-6.8-flash-lite";
pub const IMAGE_MODELS: [&str; 2] = ["sensenova-u1.5-lite", "sensenova-u1.5-fast"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptMode {
    Generate,
    Edit,
}

pub fn validate_model(model: &str) -> ApiResult<String> {
    let value = model.trim();
    if value.is_empty() {
        return Err(invalid_request("图像模型不能为空。"));
    }
    if !IMAGE_MODELS.contains(&value) {
        return Err(invalid_request("不支持的图像模型。"));
    }
    Ok(value.to_owned())
}

pub fn validate_prompt(prompt: &str) -> ApiResult<String> {
    if prompt.len() > 32 * 1024 {
        return Err(invalid_request("提示词长度超过应用限制。"));
    }
    let value = prompt.trim();
    if value.is_empty() {
        return Err(invalid_request("提示词不能为空。"));
    }
    Ok(value.to_owned())
}

pub fn validate_mode(value: &str) -> ApiResult<PromptMode> {
    match value {
        "generate" => Ok(PromptMode::Generate),
        "edit" => Ok(PromptMode::Edit),
        _ => Err(invalid_request("优化模式只支持 generate 或 edit。")),
    }
}

pub fn validate_preset_name(value: &str) -> ApiResult<String> {
    if value.len() > 128 {
        return Err(invalid_request("预设名称长度超过应用限制。"));
    }
    Ok(value.trim().to_owned())
}

pub fn validate_size(size: &str) -> ApiResult<Option<(u32, u32)>> {
    let value = size.trim();
    if value.eq_ignore_ascii_case("auto") {
        return Ok(None);
    }
    let mut parts = value.split('x');
    let width_text = parts
        .next()
        .ok_or_else(|| invalid_size("图像尺寸格式必须为 WxH 或 auto。"))?;
    let height_text = parts
        .next()
        .ok_or_else(|| invalid_size("图像尺寸格式必须为 WxH 或 auto。"))?;
    if parts.next().is_some() {
        return Err(invalid_size("图像尺寸格式必须为 WxH 或 auto。"));
    }
    let width = width_text
        .parse::<u32>()
        .map_err(|_| invalid_size("图像尺寸格式必须为 WxH 或 auto。"))?;
    let height = height_text
        .parse::<u32>()
        .map_err(|_| invalid_size("图像尺寸格式必须为 WxH 或 auto。"))?;
    if !(512..=4096).contains(&width) || !(512..=4096).contains(&height) {
        return Err(invalid_size("图像宽高必须在 512..=4096 范围内。"));
    }
    if width % 32 != 0 || height % 32 != 0 {
        return Err(invalid_size("图像宽高必须是 32 的倍数。"));
    }
    if width as u64 > height as u64 * 3 || height as u64 > width as u64 * 3 {
        return Err(invalid_size("图像宽高比例不能超过 3:1。"));
    }
    Ok(Some((width, height)))
}

fn invalid_size(message: impl Into<String>) -> ApiError {
    ApiError::new("invalid_size", message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_auto_and_valid_sizes() {
        assert_eq!(validate_size("auto").unwrap(), None);
        assert_eq!(validate_size(" AUTO ").unwrap(), None);
        assert_eq!(validate_size("512x512").unwrap(), Some((512, 512)));
        assert_eq!(validate_size("4096x4096").unwrap(), Some((4096, 4096)));
        assert_eq!(validate_size("512x1536").unwrap(), Some((512, 1536)));
        assert_eq!(validate_size("1536x512").unwrap(), Some((1536, 512)));
    }

    #[test]
    fn rejects_out_of_range_sizes() {
        for value in ["511x512", "512x511", "4097x512", "512x4097"] {
            assert!(validate_size(value).is_err(), "{value}");
        }
    }

    #[test]
    fn rejects_non_multiples_and_ratio() {
        assert!(validate_size("513x512").is_err());
        assert!(validate_size("512x513").is_err());
        assert!(validate_size("512x2048").is_err());
        assert!(validate_size("2048x512").is_err());
    }

    #[test]
    fn rejects_malformed_sizes() {
        for value in ["", "1024", "1024*1024", "1024x", "x1024", "1024x1024x1"] {
            assert!(validate_size(value).is_err(), "{value}");
        }
    }

    #[test]
    fn accepts_only_generate_and_edit_modes() {
        assert_eq!(validate_mode("generate").unwrap(), PromptMode::Generate);
        assert_eq!(validate_mode("edit").unwrap(), PromptMode::Edit);
        assert!(validate_mode("other").is_err());
    }
}
