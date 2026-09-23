import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importImage, normalizeTauriError, saveImage } from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  mockedInvoke.mockReset();
});

describe("normalizeTauriError", () => {
  it("turns a Tauri status error into a readable Error", () => {
    const error = normalizeTauriError({
      code: "rate_limited",
      message: "请求过于频繁，请稍后再试",
      status: 429,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("请求失败（429）：请求过于频繁，请稍后再试");
  });

  it("keeps string and Error responses readable", () => {
    expect(normalizeTauriError("连接被拒绝").message).toBe("连接被拒绝");
    expect(normalizeTauriError(new Error("网络暂时不可用")).message).toBe("网络暂时不可用");
    expect(normalizeTauriError('{"status":401,"message":"密钥已失效"}').message).toBe(
      "请求失败（401）：密钥已失效",
    );
  });
});

describe("native file commands", () => {
  it("delegates file selection to the Rust backend", async () => {
    mockedInvoke.mockResolvedValueOnce(null).mockResolvedValueOnce("/tmp/result.png");

    await expect(importImage()).resolves.toBeNull();
    await expect(saveImage("data:image/png;base64,AA==", "result.png")).resolves.toBe(
      "/tmp/result.png",
    );
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "choose_and_import_image");
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "choose_and_save_image", {
      dataUrl: "data:image/png;base64,AA==",
      suggestedName: "result.png",
    });
  });
});
