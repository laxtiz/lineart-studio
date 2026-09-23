use std::collections::HashMap;

use keyring_core::{Entry, Error};

use crate::error::{credential_store_error, ApiResult};

const SERVICE: &str = "com.lineartstudio.desktop";
const ACCOUNT: &str = "sensenova-api-key";

#[cfg(target_os = "linux")]
fn configure_store() -> Result<(), Error> {
    keyring::use_dbus_secret_service_store(&HashMap::new())
}

#[cfg(target_os = "macos")]
fn configure_store() -> Result<(), Error> {
    keyring::use_apple_keychain_store(&HashMap::new())
}

#[cfg(target_os = "windows")]
fn configure_store() -> Result<(), Error> {
    keyring::use_windows_native_store(&HashMap::new())
}

#[cfg(target_os = "android")]
fn configure_store() -> Result<(), Error> {
    keyring::use_android_native_store(&HashMap::new())
}

#[cfg(target_os = "ios")]
fn configure_store() -> Result<(), Error> {
    keyring::use_apple_protected_store(&HashMap::new())
}

#[cfg(any(target_os = "freebsd", target_os = "openbsd"))]
fn configure_store() -> Result<(), Error> {
    keyring::use_zbus_secret_service_store(&HashMap::new())
}

#[cfg(not(any(
    target_os = "linux",
    target_os = "macos",
    target_os = "windows",
    target_os = "android",
    target_os = "ios",
    target_os = "freebsd",
    target_os = "openbsd"
)))]
fn configure_store() -> Result<(), Error> {
    Err(Error::NotSupportedByStore(
        "当前平台没有可用的系统凭据库。".to_owned(),
    ))
}

fn entry() -> Result<Entry, Error> {
    configure_store()?;
    Entry::new(SERVICE, ACCOUNT)
}

pub fn get() -> ApiResult<Option<String>> {
    let entry = entry().map_err(|_| credential_store_error())?;
    match entry.get_password() {
        Ok(value) if value.is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(_) => Err(credential_store_error()),
    }
}

pub fn set(value: &str) -> ApiResult<()> {
    if value.is_empty() {
        return Err(crate::error::invalid_request("API Key 不能为空。"));
    }
    let entry = entry().map_err(|_| credential_store_error())?;
    entry
        .set_password(value)
        .map_err(|_| credential_store_error())
}

pub fn clear() -> ApiResult<()> {
    let entry = entry().map_err(|_| credential_store_error())?;
    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(_) => Err(credential_store_error()),
    }
}

pub fn backend_name() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "Secret Service (D-Bus, vendored, encrypted)"
    }
    #[cfg(target_os = "macos")]
    {
        "macOS Keychain"
    }
    #[cfg(target_os = "windows")]
    {
        "Windows Credential Manager"
    }
    #[cfg(target_os = "android")]
    {
        "Android Keystore"
    }
    #[cfg(target_os = "ios")]
    {
        "Apple Keychain"
    }
    #[cfg(any(target_os = "freebsd", target_os = "openbsd"))]
    {
        "Secret Service (Zbus, encrypted)"
    }
    #[cfg(not(any(
        target_os = "linux",
        target_os = "macos",
        target_os = "windows",
        target_os = "android",
        target_os = "ios",
        target_os = "freebsd",
        target_os = "openbsd"
    )))]
    {
        "Unavailable"
    }
}
