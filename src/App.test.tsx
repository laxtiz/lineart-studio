import { fireEvent, render } from "@testing-library/react";
import { screen, waitFor } from "@testing-library/dom";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { ImageResult } from "./types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

function configureTauriRuntime(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
}

describe("studio workflow", () => {
  beforeEach(() => {
    configureTauriRuntime();
    mockedInvoke.mockImplementation(async (command: string, args?: unknown) => {
      if (command === "get_api_key_status") {
        return { configured: true, persistent: true, backend: "系统凭据库" };
      }
      if (command === "optimize_prompt") {
        const request = (args as { request?: { prompt?: string } } | undefined)?.request;
        return {
          original_prompt: request?.prompt ?? "原始描述",
          optimized_prompt: "更清晰、更有层次的主体描述",
          model: "sensenova-6.8-flash-lite",
        };
      }
      if (command === "choose_and_import_image" || command === "choose_and_save_image") {
        return null;
      }
      return undefined;
    });
  });

  it("preserves manual text while switching modes, then adopts and undoes optimization", async () => {
    render(<App />);
    const prompt = await screen.findByRole("textbox", { name: "提示词" });
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledWith("get_api_key_status"));

    fireEvent.change(prompt, { target: { value: "请保留手写要求" } });
    fireEvent.click(screen.getByRole("button", { name: "生图" }));
    expect((prompt as HTMLTextAreaElement).value).toContain("请保留手写要求");

    fireEvent.click(screen.getByRole("button", { name: "优化提示词" }));
    expect(await screen.findByText("优化前后差异")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "采用" }));
    expect((prompt as HTMLTextAreaElement).value).toBe("更清晰、更有层次的主体描述");
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect((prompt as HTMLTextAreaElement).value).toBe("请保留手写要求");
  });

  it("does not fail when the native file dialog is cancelled", async () => {
    render(<App />);
    const importButton = await screen.findByRole("button", { name: "导入图片" });
    fireEvent.click(importButton);

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledWith("choose_and_import_image"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the documented image result shape when generation completes", async () => {
    const imageResult: ImageResult = {
      asset: {
        id: "result-1",
        name: "result.png",
        mime_type: "image/png",
        width: 1024,
        height: 1024,
        bytes: 12,
        data_url: "data:image/png;base64,AA==",
      },
      model: "sensenova-u1.5-lite",
      usage: { images_count: 1 },
    };
    mockedInvoke.mockImplementation(async (command: string) => {
      if (command === "get_api_key_status") {
        return { configured: true, persistent: true, backend: "系统凭据库" };
      }
      if (command === "choose_and_import_image") {
        return {
          id: "input-1",
          name: "lineart.png",
          mime_type: "image/png",
          width: 1024,
          height: 1024,
          bytes: 10,
          data_url: "data:image/png;base64,AA==",
        };
      }
      if (command === "edit_image") {
        return imageResult;
      }
      return undefined;
    });

    render(<App />);
    const prompt = await screen.findByRole("textbox", { name: "提示词" });
    fireEvent.change(prompt, { target: { value: "自然上色" } });
    fireEvent.click(screen.getByRole("button", { name: "导入图片" }));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledWith("choose_and_import_image"));
    fireEvent.click(screen.getByRole("button", { name: /开始上色/ }));
    expect(await screen.findByText("结果就绪")).toBeInTheDocument();
  });

  it("invalidates an optimization when the prompt is edited again", async () => {
    render(<App />);
    const prompt = await screen.findByRole("textbox", { name: "提示词" });
    fireEvent.click(screen.getByRole("button", { name: "生图" }));
    fireEvent.change(prompt, { target: { value: "蓝色眼睛" } });
    fireEvent.click(screen.getByRole("button", { name: "优化提示词" }));
    expect(await screen.findByText("优化前后差异")).toBeInTheDocument();

    fireEvent.change(prompt, { target: { value: "绿色眼睛，保留手写要求" } });
    expect(screen.getByText("提示词已变化")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "采用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled();
  });
});
