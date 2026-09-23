use std::fs::{self, File};
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use image::{ImageError, ImageFormat, ImageReader, Limits};
use uuid::Uuid;

use crate::error::{file_error, image_limit_error, invalid_request, ApiError, ApiResult};
use crate::types::ImageAsset;

pub const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
pub const MAX_EDIT_IMAGES: usize = 5;
pub const MAX_EDIT_TOTAL_BYTES: usize = 40 * 1024 * 1024;
pub const MAX_IMAGE_DIMENSION: u32 = 8192;
pub const MAX_IMAGE_PIXELS: u64 = 32_000_000;
pub const MAX_DECODE_ALLOC: u64 = 128 * 1024 * 1024;
const MAX_ENCODED_IMAGE_BYTES: usize = MAX_IMAGE_BYTES.div_ceil(3) * 4 + 256;

#[derive(Debug, Clone)]
pub struct ValidatedImage {
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
    pub data_url: String,
}

fn invalid_image(message: impl Into<String>) -> ApiError {
    ApiError::new("invalid_image", message)
}

fn unsupported_image_type() -> ApiError {
    ApiError::new("unsupported_image_type", "仅支持 PNG、JPEG 和 WebP 图像。")
}

fn image_limits_error() -> ApiError {
    ApiError::new(
        "image_limits_exceeded",
        "应用限制：图像尺寸、像素数量或解码内存超过限制。",
    )
}

fn image_budget_error() -> ApiError {
    ApiError::new(
        "image_budget_exceeded",
        "应用限制：图像编辑原始字节总量不能超过 40 MiB。",
    )
}

fn canonical_mime(value: &str) -> Option<&'static str> {
    match value.to_ascii_lowercase().as_str() {
        "image/png" => Some("image/png"),
        "image/jpeg" | "image/jpg" => Some("image/jpeg"),
        "image/webp" => Some("image/webp"),
        _ => None,
    }
}

fn mime_for_format(format: ImageFormat) -> Option<&'static str> {
    match format {
        ImageFormat::Png => Some("image/png"),
        ImageFormat::Jpeg => Some("image/jpeg"),
        ImageFormat::WebP => Some("image/webp"),
        _ => None,
    }
}

fn image_limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    limits
}

fn map_image_error(error: ImageError) -> ApiError {
    if matches!(error, ImageError::Limits(_)) {
        image_limits_error()
    } else {
        invalid_image("图像内容无法解码。")
    }
}

fn check_dimensions(width: u32, height: u32) -> ApiResult<()> {
    if width == 0 || height == 0 {
        return Err(invalid_image("图像尺寸无效。"));
    }
    if width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION {
        return Err(image_limits_error());
    }
    if u64::from(width)
        .checked_mul(u64::from(height))
        .is_none_or(|pixels| pixels > MAX_IMAGE_PIXELS)
    {
        return Err(image_limits_error());
    }
    Ok(())
}

pub fn validate_bytes(bytes: &[u8], declared_mime: Option<&str>) -> ApiResult<ValidatedImage> {
    if bytes.is_empty() {
        return Err(invalid_image("图像内容为空。"));
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(image_limit_error());
    }
    let mut format_reader = ImageReader::new(Cursor::new(bytes));
    format_reader.limits(image_limits());
    let format_reader = format_reader
        .with_guessed_format()
        .map_err(|_| invalid_image("图像内容无法识别。"))?;
    let format = format_reader
        .format()
        .ok_or_else(|| invalid_image("图像内容无法识别。"))?;
    let actual_mime = mime_for_format(format).ok_or_else(unsupported_image_type)?;
    if let Some(declared_mime) = declared_mime {
        let declared_mime = canonical_mime(declared_mime).ok_or_else(unsupported_image_type)?;
        if declared_mime != actual_mime {
            return Err(invalid_image("图像 MIME 类型与实际内容不一致。"));
        }
    }
    let limits = image_limits();
    let mut dimension_reader = ImageReader::with_format(Cursor::new(bytes), format);
    dimension_reader.limits(limits.clone());
    let (width, height) = dimension_reader
        .into_dimensions()
        .map_err(map_image_error)?;
    check_dimensions(width, height)?;
    let mut decoder = ImageReader::with_format(Cursor::new(bytes), format);
    decoder.limits(limits);
    let _decoded = decoder.decode().map_err(map_image_error)?;
    Ok(ValidatedImage {
        mime_type: actual_mime.to_owned(),
        width,
        height,
        bytes: bytes.to_vec(),
        data_url: encode_data_url(actual_mime, bytes),
    })
}

pub fn decode_data_url(data_url: &str) -> ApiResult<ValidatedImage> {
    if data_url.len() > MAX_ENCODED_IMAGE_BYTES {
        return Err(image_limit_error());
    }
    let value = data_url
        .strip_prefix("data:")
        .ok_or_else(|| invalid_image("图像必须使用 base64 Data URL。"))?;
    let (metadata, payload) = value
        .split_once(',')
        .ok_or_else(|| invalid_image("图像 Data URL 格式无效。"))?;
    let (mime, encoding) = metadata
        .split_once(';')
        .ok_or_else(|| invalid_image("图像 Data URL 缺少 base64 标记。"))?;
    if encoding != "base64" || canonical_mime(mime).is_none() {
        return Err(unsupported_image_type());
    }
    if payload.is_empty() {
        return Err(invalid_image("图像 Data URL 内容为空。"));
    }
    let bytes = STANDARD
        .decode(payload)
        .map_err(|_| invalid_image("图像 base64 内容无效。"))?;
    validate_bytes(&bytes, Some(mime))
}

pub fn decode_api_image(encoded: &str) -> ApiResult<ValidatedImage> {
    let value = if encoded.starts_with("data:") {
        decode_data_url(encoded)?
    } else {
        if encoded.len() > MAX_ENCODED_IMAGE_BYTES {
            return Err(image_limit_error());
        }
        let bytes = STANDARD
            .decode(encoded.trim())
            .map_err(|_| invalid_image("API 返回的图像 base64 内容无效。"))?;
        validate_bytes(&bytes, Some("image/png"))?
    };
    if value.mime_type != "image/png" {
        return Err(invalid_image("API 返回的图像不是 PNG。"));
    }
    Ok(value)
}

pub fn validate_asset(asset: &ImageAsset) -> ApiResult<ValidatedImage> {
    let value = decode_data_url(&asset.data_url)?;
    let asset_mime = canonical_mime(&asset.mime_type).ok_or_else(unsupported_image_type)?;
    if asset_mime != value.mime_type
        || asset.width != value.width
        || asset.height != value.height
        || asset.bytes != value.bytes.len()
    {
        return Err(invalid_image("图像资产元数据与实际内容不一致。"));
    }
    Ok(value)
}

pub fn validate_edit_budget(count: usize, total_bytes: usize) -> ApiResult<()> {
    if count == 0 {
        return Err(invalid_request("图像编辑至少需要一张图片。"));
    }
    if count > MAX_EDIT_IMAGES {
        return Err(ApiError::new(
            "too_many_images",
            "应用限制：图像编辑最多支持 5 张图片，且第一张为主图。",
        ));
    }
    if total_bytes > MAX_EDIT_TOTAL_BYTES {
        return Err(image_budget_error());
    }
    Ok(())
}

pub fn validate_edit_images(images: &[ImageAsset]) -> ApiResult<Vec<ValidatedImage>> {
    validate_edit_budget(images.len(), 0)?;
    let mut total_bytes = 0usize;
    let mut validated = Vec::with_capacity(images.len());
    for asset in images {
        let image = validate_asset(asset)?;
        total_bytes = total_bytes
            .checked_add(image.bytes.len())
            .ok_or_else(image_budget_error)?;
        if total_bytes > MAX_EDIT_TOTAL_BYTES {
            return Err(image_budget_error());
        }
        validated.push(image);
    }
    Ok(validated)
}

pub fn asset_from_validated(
    name: impl Into<String>,
    image: ValidatedImage,
    source_path: Option<String>,
) -> ImageAsset {
    ImageAsset {
        id: Uuid::new_v4().to_string(),
        name: name.into(),
        mime_type: image.mime_type,
        width: image.width,
        height: image.height,
        bytes: image.bytes.len(),
        data_url: image.data_url,
        source_path,
    }
}

pub fn make_asset(
    name: impl Into<String>,
    bytes: &[u8],
    source_path: Option<String>,
) -> ApiResult<ImageAsset> {
    let image = validate_bytes(bytes, None)?;
    Ok(asset_from_validated(name, image, source_path))
}

pub(crate) fn import_image(path: String) -> ApiResult<ImageAsset> {
    if path.trim().is_empty() || path.contains('\0') {
        return Err(invalid_request("图像路径不能为空。"));
    }
    let file_path = PathBuf::from(path);
    let mut file = File::open(&file_path).map_err(|_| file_error())?;
    let metadata = file.metadata().map_err(|_| file_error())?;
    if !metadata.is_file() {
        return Err(file_error());
    }
    if metadata.len() > MAX_IMAGE_BYTES as u64 {
        return Err(image_limit_error());
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| file_error())?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(image_limit_error());
    }
    let name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("image")
        .to_owned();
    make_asset(name, &bytes, Some(file_path.to_string_lossy().into_owned()))
}

pub(crate) fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => ".jpg",
        "image/webp" => ".webp",
        _ => ".png",
    }
}

fn expected_extension_mime(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

pub(crate) fn save_validated_image(
    file_path: PathBuf,
    image: &ValidatedImage,
) -> ApiResult<String> {
    if file_path.as_os_str().is_empty() || file_path.to_string_lossy().contains('\0') {
        return Err(invalid_request("保存路径不能为空。"));
    }
    match fs::symlink_metadata(&file_path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(ApiError::new(
                "symlink_not_allowed",
                "保存目标不能是符号链接。",
            ));
        }
        Ok(metadata) if !metadata.is_file() => return Err(file_error()),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(file_error()),
    }
    let expected_mime = expected_extension_mime(&file_path)
        .ok_or_else(|| invalid_request("保存文件扩展名必须是 png、jpg、jpeg 或 webp。"))?;
    if expected_mime != image.mime_type {
        return Err(invalid_request("保存文件扩展名与图像 MIME 类型不一致。"));
    }
    if let Some(parent) = file_path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err(file_error());
        }
    }
    fs::write(&file_path, &image.bytes).map_err(|_| file_error())?;
    Ok(file_path.to_string_lossy().into_owned())
}

#[cfg(test)]
pub(crate) fn save_image(path: String, data_url: String) -> ApiResult<String> {
    if path.trim().is_empty() || path.contains('\0') {
        return Err(invalid_request("保存路径不能为空。"));
    }
    let image = decode_data_url(&data_url)?;
    save_validated_image(PathBuf::from(path), &image)
}

fn encode_data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    #[test]
    fn validates_png_data_url() {
        let bytes = STANDARD.decode(PNG).unwrap();
        let image = validate_bytes(&bytes, Some("image/png")).unwrap();
        assert_eq!(image.mime_type, "image/png");
        assert_eq!(image.width, 1);
        assert_eq!(image.height, 1);
    }

    #[test]
    fn accepts_jpg_mime_alias() {
        assert_eq!(canonical_mime("image/jpg"), Some("image/jpeg"));
    }

    #[test]
    fn rejects_mismatched_mime() {
        let bytes = STANDARD.decode(PNG).unwrap();
        let error = validate_bytes(&bytes, Some("image/jpeg")).unwrap_err();
        assert_eq!(error.code, "invalid_image");
    }

    #[test]
    fn rejects_oversized_data_url() {
        let data_url = format!(
            "data:image/png;base64,{}",
            "A".repeat(MAX_ENCODED_IMAGE_BYTES)
        );
        let error = decode_data_url(&data_url).unwrap_err();
        assert_eq!(error.code, "image_too_large");
    }

    #[test]
    fn rejects_dimension_and_pixel_limits() {
        assert_eq!(
            check_dimensions(MAX_IMAGE_DIMENSION + 1, 1)
                .unwrap_err()
                .code,
            "image_limits_exceeded"
        );
        assert_eq!(
            check_dimensions(6000, 6000).unwrap_err().code,
            "image_limits_exceeded"
        );
        assert!(check_dimensions(4096, 4096).is_ok());
    }

    #[test]
    fn validates_edit_budget() {
        assert!(validate_edit_budget(5, MAX_EDIT_TOTAL_BYTES).is_ok());
        assert_eq!(
            validate_edit_budget(6, 0).unwrap_err().code,
            "too_many_images"
        );
        assert_eq!(
            validate_edit_budget(1, MAX_EDIT_TOTAL_BYTES + 1)
                .unwrap_err()
                .code,
            "image_budget_exceeded"
        );
    }

    #[test]
    fn validates_asset_metadata() {
        let bytes = STANDARD.decode(PNG).unwrap();
        let asset = make_asset("test.png", &bytes, None).unwrap();
        let validated = validate_asset(&asset).unwrap();
        assert_eq!(validated.mime_type, asset.mime_type);
    }

    #[test]
    fn imports_and_saves_valid_image() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.png");
        let destination = directory.path().join("destination.png");
        let bytes = STANDARD.decode(PNG).unwrap();
        std::fs::write(&source, &bytes).unwrap();
        let asset = import_image(source.to_string_lossy().into_owned()).unwrap();
        assert_eq!(
            asset.source_path.as_deref(),
            Some(source.to_string_lossy().as_ref())
        );
        let saved = save_image(destination.to_string_lossy().into_owned(), asset.data_url).unwrap();
        assert_eq!(saved, destination.to_string_lossy());
        assert_eq!(std::fs::read(destination).unwrap(), bytes);
    }

    #[test]
    fn rejects_extension_mismatch() {
        let bytes = STANDARD.decode(PNG).unwrap();
        let image = validate_bytes(&bytes, None).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("image.jpg");
        let error = save_validated_image(destination, &image).unwrap_err();
        assert_eq!(error.code, "invalid_request");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_save_target() {
        use std::os::unix::fs::symlink;

        let bytes = STANDARD.decode(PNG).unwrap();
        let image = validate_bytes(&bytes, None).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("target.png");
        let link = directory.path().join("link.png");
        std::fs::write(&target, &bytes).unwrap();
        symlink(&target, &link).unwrap();
        let error = save_validated_image(link, &image).unwrap_err();
        assert_eq!(error.code, "symlink_not_allowed");
    }
}
