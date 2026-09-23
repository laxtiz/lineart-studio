use tauri_build::{AppManifest, Attributes};

const APP_COMMANDS: &[&str] = &[
    "get_api_key_status",
    "set_api_key",
    "clear_api_key",
    "test_api_connection",
    "choose_and_import_image",
    "choose_and_save_image",
    "generate_image",
    "edit_image",
    "optimize_prompt",
];

fn main() {
    tauri_build::try_build(
        Attributes::new().app_manifest(AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to build Tauri application");
}
