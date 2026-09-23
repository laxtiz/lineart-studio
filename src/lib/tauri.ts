import { invoke } from "@tauri-apps/api/core";
import type {
  ApiKeyStatus,
  ConnectionResult,
  EditImageRequest,
  GenerateImageRequest,
  ImageAsset,
  ImageResult,
  OptimizePromptRequest,
  OptimizePromptResult,
} from "../types";

const runtimeMessage = "未检测到 Tauri 运行时，请在桌面应用中使用；浏览器预览不会发起请求。";

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

function ensureRuntime(): void {
  if (!isTauriRuntime()) {
    throw new Error(runtimeMessage);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeTauriError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(error.message || "请求失败，请稍后重试。");
  }
  if (typeof error === "string") {
    const text = error.trim();
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed !== error) {
          return normalizeTauriError(parsed);
        }
      } catch {
        return new Error(text);
      }
    }
    return new Error("请求失败，请稍后重试。");
  }
  if (!isRecord(error)) {
    return new Error("请求失败，请稍后重试。");
  }

  const nestedError = error.error;
  const message =
    readString(error, "message") ??
    (typeof nestedError === "string" ? nestedError : null) ??
    (isRecord(nestedError) ? readString(nestedError, "message") : null) ??
    readString(error, "detail");
  const code = readString(error, "code");
  const rawStatus = error.status;
  const status =
    typeof rawStatus === "number" || typeof rawStatus === "string"
      ? rawStatus
      : null;
  const reason = message ?? code ?? "后端未提供错误说明";
  const prefix = status !== null ? `请求失败（${status}）` : code ? `请求失败（${code}）` : "请求失败";

  return new Error(`${prefix}：${reason}`);
}

export function errorMessage(error: unknown): string {
  return normalizeTauriError(error).message;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  ensureRuntime();
  try {
    return args === undefined ? await invoke<T>(command) : await invoke<T>(command, args);
  } catch (error) {
    throw normalizeTauriError(error);
  }
}

export function getApiKeyStatus(): Promise<ApiKeyStatus> {
  return call<ApiKeyStatus>("get_api_key_status");
}

export function setApiKey(apiKey: string, remember: boolean): Promise<ApiKeyStatus> {
  return call<ApiKeyStatus>("set_api_key", { apiKey, remember });
}

export function clearApiKey(): Promise<ApiKeyStatus> {
  return call<ApiKeyStatus>("clear_api_key");
}

export function testApiConnection(): Promise<ConnectionResult> {
  return call<ConnectionResult>("test_api_connection");
}

export function importImage(): Promise<ImageAsset | null> {
  return call<ImageAsset | null>("choose_and_import_image");
}

export function saveImage(dataUrl: string, suggestedName: string): Promise<string | null> {
  return call<string | null>("choose_and_save_image", { dataUrl, suggestedName });
}

export function generateImage(request: GenerateImageRequest): Promise<ImageResult> {
  return call<ImageResult>("generate_image", { request });
}

export function editImage(request: EditImageRequest): Promise<ImageResult> {
  return call<ImageResult>("edit_image", { request });
}

export function optimizePrompt(request: OptimizePromptRequest): Promise<OptimizePromptResult> {
  return call<OptimizePromptResult>("optimize_prompt", { request });
}
