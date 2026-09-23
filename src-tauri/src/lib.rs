mod api_client;
mod commands;
mod credential_store;
mod error;
mod image;
mod state;
mod types;
mod validation;

pub use error::ApiError;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = api_client::ApiClient::new();
    tauri::Builder::default()
        .manage(AppState::new(client))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_api_key_status,
            commands::set_api_key,
            commands::clear_api_key,
            commands::test_api_connection,
            commands::choose_and_import_image,
            commands::choose_and_save_image,
            commands::generate_image,
            commands::edit_image,
            commands::optimize_prompt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
