import { KeyRound, MonitorCog } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { ModeSidebar } from "./components/ModeSidebar";
import { PreviewWorkspace, type ComparisonView } from "./components/PreviewWorkspace";
import { PromptPanel } from "./components/PromptPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { ToastRegion } from "./components/ToastRegion";
import { getDefaultPresetId, getPresetsForMode } from "./data/presets";
import {
  clearApiKey,
  editImage,
  errorMessage,
  generateImage,
  getApiKeyStatus,
  importImage,
  isTauriRuntime,
  optimizePrompt,
  saveImage,
  setApiKey,
  testApiConnection,
} from "./lib/tauri";
import { mergePresetPrompt, switchMode } from "./lib/workflow";
import type {
  ApiKeyStatus,
  BusyAction,
  ImageAsset,
  ImageSize,
  ModelId,
  OptimizationState,
  Preset,
  StudioMode,
  ToastKind,
  ToastMessage,
} from "./types";
import "./App.css";

const initialEditPreset = getPresetsForMode("edit")[0];
const initialGeneratePreset = getPresetsForMode("generate")[0];

function createInitialStatus(): ApiKeyStatus {
  return {
    configured: false,
    persistent: false,
    backend: "检查中",
  };
}

function App() {
  const [runtimeAvailable] = useState(() => isTauriRuntime());
  const [mode, setMode] = useState<StudioMode>("edit");
  const [selectedPresetIds, setSelectedPresetIds] = useState<Record<StudioMode, string>>({
    generate: initialGeneratePreset?.id ?? getDefaultPresetId("generate"),
    edit: initialEditPreset?.id ?? getDefaultPresetId("edit"),
  });
  const [prompt, setPrompt] = useState(initialEditPreset?.prompt ?? "");
  const [model, setModel] = useState<ModelId>("sensenova-u1.5-lite");
  const [size, setSize] = useState<ImageSize>("auto");
  const [noWatermark, setNoWatermark] = useState(true);
  const [promptExtend, setPromptExtend] = useState(false);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [result, setResult] = useState<Awaited<ReturnType<typeof generateImage>> | null>(null);
  const [optimization, setOptimization] = useState<OptimizationState | null>(null);
  const [comparison, setComparison] = useState<ComparisonView>("split");
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [apiStatus, setApiStatus] = useState<ApiKeyStatus>(createInitialStatus);
  const [checkingKey, setCheckingKey] = useState(runtimeAvailable);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const selectedPreset = useMemo<Preset | undefined>(() => {
    const presets = getPresetsForMode(mode);
    return presets.find((preset) => preset.id === selectedPresetIds[mode]) ?? presets[0];
  }, [mode, selectedPresetIds]);

  const pushToast = useCallback((kind: ToastKind, text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { id, kind, text }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!runtimeAvailable) {
      setCheckingKey(false);
      return;
    }
    let active = true;
    setCheckingKey(true);
    void getApiKeyStatus()
      .then((status) => {
        if (active) {
          setApiStatus(status);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setApiStatus({ configured: false, persistent: false, backend: "状态不可用" });
          pushToast("error", `读取密钥状态失败：${errorMessage(error)}`);
        }
      })
      .finally(() => {
        if (active) {
          setCheckingKey(false);
        }
      });
    return () => {
      active = false;
    };
  }, [pushToast, runtimeAvailable]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleModeChange = useCallback(
    (nextMode: StudioMode) => {
      if (busy) {
        return;
      }
      const next = switchMode(mode, nextMode, prompt, selectedPresetIds);
      setMode(next.mode);
      setSelectedPresetIds(next.selectedPresetIds);
      setPrompt(next.prompt);
      if (mode !== nextMode) {
        setOptimization(null);
        setResult(null);
        setComparison("split");
        pushToast("info", next.notice);
      }
    },
    [busy, mode, prompt, pushToast, selectedPresetIds],
  );

  const handlePresetSelect = useCallback(
    (presetId: string) => {
      if (busy) {
        return;
      }
      const nextPreset = getPresetsForMode(mode).find((preset) => preset.id === presetId);
      if (!nextPreset) {
        return;
      }
      const merged = mergePresetPrompt(prompt, selectedPreset, nextPreset);
      if (!merged.changed) {
        pushToast("info", `「${nextPreset.name}」已经启用。`);
        return;
      }
      setSelectedPresetIds((current) => ({ ...current, [mode]: presetId }));
      setPrompt(merged.prompt);
      setOptimization(null);
      setResult(null);
      pushToast(
        "success",
        merged.merged
          ? `已合并「${nextPreset.name}」，手写提示词已保留。`
          : `已应用「${nextPreset.name}」，可继续编辑提示词。`,
      );
    },
    [busy, mode, prompt, pushToast, selectedPreset],
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      if (busy) {
        return;
      }
      setPrompt(value);
      setResult(null);
      setOptimization((current) => {
        if (!current) {
          return null;
        }
        if (value === current.original) {
          return { ...current, status: "suggested" };
        }
        if (value === current.optimized) {
          return { ...current, status: "adopted" };
        }
        return { ...current, status: "stale" };
      });
    },
    [busy],
  );

  const canRunAction = useCallback(
    (action: string): boolean => {
      if (!runtimeAvailable) {
        pushToast("error", "当前是浏览器预览，请在 Tauri 桌面应用中执行此操作。");
        return false;
      }
      if (!apiStatus.configured) {
        pushToast("info", `请先配置 API Key，再${action}。`);
        openSettings();
        return false;
      }
      return true;
    },
    [apiStatus.configured, openSettings, pushToast, runtimeAvailable],
  );

  const handleOptimize = useCallback(async () => {
    if (!prompt.trim() || busy || (mode === "edit" && images.length === 0)) {
      return;
    }
    if (!canRunAction("优化提示词")) {
      return;
    }
    setBusy("optimize");
    try {
      const response = await optimizePrompt({
        prompt,
        mode,
        preset_name: selectedPreset?.name ?? "",
        source_image: mode === "edit" ? images[0] ?? null : null,
      });
      if (!response.optimized_prompt?.trim()) {
        throw new Error("优化结果为空，请重试。");
      }
      setOptimization({
        original: response.original_prompt || prompt,
        optimized: response.optimized_prompt,
        model: response.model || "sensenova-6.8-flash-lite",
        status: "suggested",
      });
      pushToast("success", "提示词优化完成，确认差异后即可采用。");
    } catch (error) {
      pushToast("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [apiStatus.configured, busy, canRunAction, images, mode, prompt, pushToast, selectedPreset?.name]);

  const handleGenerate = useCallback(async () => {
    if (busy) {
      return;
    }
    if (!prompt.trim()) {
      pushToast("info", mode === "edit" ? "请先写下上色要求。" : "请先描述想生成的画面。");
      return;
    }
    if (mode === "edit" && images.length === 0) {
      pushToast("info", "请先导入一张线稿主图。");
      return;
    }
    if (!canRunAction(mode === "edit" ? "开始上色" : "开始生图")) {
      return;
    }

    setBusy(mode);
    try {
      const baseRequest = {
        model,
        prompt: prompt.trim(),
        size,
        watermark: !noWatermark,
        prompt_extend: promptExtend,
      };
      const nextResult =
        mode === "generate"
          ? await generateImage(baseRequest)
          : await editImage({ ...baseRequest, images });
      if (!nextResult?.asset?.id || !nextResult.asset.data_url) {
        throw new Error("后端返回了无效图片结果，请重试。");
      }
      setResult(nextResult);
      pushToast("success", mode === "edit" ? "上色完成，可以对比或继续编辑。" : "图片生成完成。");
    } catch (error) {
      pushToast("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [
    apiStatus.configured,
    busy,
    canRunAction,
    images,
    mode,
    model,
    noWatermark,
    prompt,
    promptExtend,
    pushToast,
    size,
  ]);

  const handleImport = useCallback(async () => {
    if (busy) {
      return;
    }
    if (!runtimeAvailable) {
      pushToast("error", "当前是浏览器预览，请在 Tauri 桌面应用中导入图片。");
      return;
    }
    setBusy("import");
    try {
      const asset = await importImage();
      if (!asset) {
        return;
      }
      if (!asset.id || !asset.data_url) {
        throw new Error("后端返回了无效图片，请重新导入。");
      }
      setImages((current) => [asset, ...current.slice(1)]);
      setOptimization(null);
      setResult(null);
      if (mode === "generate") {
        const next = switchMode(mode, "edit", prompt, selectedPresetIds);
        setMode(next.mode);
        setSelectedPresetIds(next.selectedPresetIds);
        setPrompt(next.prompt);
        setOptimization(null);
        setResult(null);
        setComparison("split");
        pushToast("info", "已切换到改图模式，提示词已保留。");
      }
      pushToast("success", `已导入 ${asset.name}`);
    } catch (error) {
      pushToast("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [busy, mode, prompt, pushToast, runtimeAvailable, selectedPresetIds]);

  const handleAddReference = useCallback(async () => {
    if (busy || images.length === 0 || images.length >= 5) {
      return;
    }
    if (!runtimeAvailable) {
      pushToast("error", "当前是浏览器预览，请在 Tauri 桌面应用中导入参考图。");
      return;
    }
    setBusy("import");
    try {
      const asset = await importImage();
      if (!asset) {
        return;
      }
      if (!asset.id || !asset.data_url) {
        throw new Error("后端返回了无效参考图，请重新导入。");
      }
      setImages((current) => [...current, asset]);
      setOptimization(null);
      setResult(null);
      pushToast("success", `已添加参考图 ${asset.name}`);
    } catch (error) {
      pushToast("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [busy, images.length, pushToast, runtimeAvailable]);

  const handleRemoveImage = useCallback(
    (index: number) => {
      if (busy) {
        return;
      }
      if (index === 0 && images.length > 1) {
        pushToast("info", "请先移除其他参考图，再替换主图。");
        return;
      }
      setImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
      setOptimization(null);
      setResult(null);
    },
    [busy, images.length, pushToast],
  );

  const handleSave = useCallback(async () => {
    if (!result || busy) {
      return;
    }
    if (!runtimeAvailable) {
      pushToast("error", "当前是浏览器预览，请在 Tauri 桌面应用中保存图片。");
      return;
    }
    setBusy("save");
    try {
      const savedPath = await saveImage(result.asset.data_url, result.asset.name);
      if (!savedPath) {
        return;
      }
      pushToast("success", `结果已保存：${savedPath.split(/[\\/]/).pop() || "图片"}`);
    } catch (error) {
      pushToast("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, [busy, pushToast, result, runtimeAvailable]);

  const handleUseResult = useCallback(() => {
    if (!result || busy) {
      return;
    }
    const next = switchMode(mode, "edit", prompt, selectedPresetIds);
    setMode(next.mode);
    setSelectedPresetIds(next.selectedPresetIds);
    setPrompt(next.prompt);
    setImages([result.asset]);
    setResult(null);
    setOptimization(null);
    setComparison("split");
    pushToast("success", "结果已作为下一次改图输入的主图。");
  }, [busy, mode, prompt, pushToast, result, selectedPresetIds]);

  const handlePromptFocus = useCallback(() => {
    document.querySelector<HTMLTextAreaElement>(".prompt-textarea")?.focus();
  }, []);

  const handleTest = useCallback(async (): Promise<boolean> => {
    if (busy || checkingKey) {
      return false;
    }
    if (!runtimeAvailable) {
      pushToast("error", "当前是浏览器预览，请在 Tauri 桌面应用中测试连接。");
      return false;
    }
    if (!apiStatus.configured) {
      pushToast("info", "请先保存 API Key，再测试连接。");
      openSettings();
      return false;
    }
    setBusy("test");
    try {
      const response = await testApiConnection();
      setConnectionMessage(response.message || (response.ok ? "API 可达。" : "API 不可达。"));
      if (response.ok) {
        pushToast("success", response.message || "API 可达，所需模型均可用。");
        return true;
      }
      pushToast("error", response.message || "API 不可达。");
      return false;
    } catch (error) {
      const message = errorMessage(error);
      setConnectionMessage(message);
      pushToast("error", message);
      return false;
    } finally {
      setBusy(null);
    }
  }, [apiStatus.configured, busy, checkingKey, openSettings, pushToast, runtimeAvailable]);

  const handleSaveKey = useCallback(
    async (apiKey: string, remember: boolean) => {
      if (busy || checkingKey) {
        return false;
      }
      setBusy("save-key");
      try {
        const status = await setApiKey(apiKey, remember);
        setApiStatus(status);
        setConnectionMessage("");
        pushToast(
          "success",
          status.persistent
            ? "密钥已保存到系统凭据库。"
            : "密钥已配置，仅在本次会话使用。",
        );
        return true;
      } catch (error) {
        pushToast("error", errorMessage(error));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [busy, checkingKey, pushToast],
  );

  const handleClearKey = useCallback(async () => {
    if (busy || checkingKey || !apiStatus.configured) {
      return false;
    }
    setBusy("clear-key");
    try {
      const status = await clearApiKey();
      setApiStatus(status);
      setConnectionMessage("");
      pushToast("success", "API Key 已清除。");
      return true;
    } catch (error) {
      pushToast("error", errorMessage(error));
      return false;
    } finally {
      setBusy(null);
    }
  }, [apiStatus.configured, busy, checkingKey, pushToast]);

  const handleAdoptOptimization = useCallback(() => {
    if (!optimization || optimization.status !== "suggested" || prompt !== optimization.original) {
      return;
    }
    setPrompt(optimization.optimized);
    setResult(null);
    setOptimization({ ...optimization, status: "adopted" });
  }, [optimization, prompt]);

  const handleUndoOptimization = useCallback(() => {
    if (!optimization || optimization.status !== "adopted" || prompt !== optimization.optimized) {
      return;
    }
    setPrompt(optimization.original);
    setResult(null);
    setOptimization({ ...optimization, status: "undone" });
  }, [optimization, prompt]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        return;
      }
      const key = event.key.toLowerCase();
      if (settingsOpen) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (key === "enter") {
        event.preventDefault();
        void handleGenerate();
        return;
      }
      const isTextInput = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if (isTextInput) {
        return;
      }
      if (key === "s") {
        event.preventDefault();
        void handleSave();
      }
      if (key === "o") {
        event.preventDefault();
        void handleImport();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleGenerate, handleImport, handleSave, settingsOpen]);

  return (
    <div className="app-shell">
      <Header
        apiStatus={apiStatus}
        checkingKey={checkingKey}
        busy={Boolean(busy)}
        testing={busy === "test"}
        onTest={() => void handleTest()}
        onSettings={openSettings}
      />

      {!runtimeAvailable ? (
        <div className="global-banner runtime-banner" role="status">
          <MonitorCog size={16} />
          <span>浏览器预览模式：未检测到 Tauri 运行时，设置与图片操作已停用，界面仍可浏览。</span>
        </div>
      ) : !apiStatus.configured && !checkingKey ? (
        <div className="global-banner key-banner" role="status">
          <KeyRound size={16} />
          <span>尚未配置 API Key。添加后即可使用 LLM 优化、生图和改图。</span>
          <button type="button" onClick={openSettings}>
            打开设置
          </button>
        </div>
      ) : null}

      <div className="app-grid">
        <ModeSidebar
          mode={mode}
          selectedPresetId={selectedPreset?.id ?? ""}
          promptLength={prompt.length}
          busy={Boolean(busy)}
          onModeChange={handleModeChange}
          onPresetSelect={handlePresetSelect}
        />
        <PreviewWorkspace
          mode={mode}
          images={images}
          result={result}
          busy={busy}
          comparison={comparison}
          zoom={zoom}
          onComparisonChange={setComparison}
          onZoomChange={setZoom}
          onImport={() => void handleImport()}
          onSave={() => void handleSave()}
          onUseResult={handleUseResult}
          onPromptFocus={handlePromptFocus}
        />
        <PromptPanel
          mode={mode}
          prompt={prompt}
          onPromptChange={handlePromptChange}
          selectedPreset={selectedPreset}
          model={model}
          size={size}
          noWatermark={noWatermark}
          promptExtend={promptExtend}
          images={images}
          optimization={optimization}
          busy={busy}
          runtimeAvailable={runtimeAvailable}
          hasKey={apiStatus.configured}
          onModelChange={setModel}
          onSizeChange={setSize}
          onNoWatermarkChange={setNoWatermark}
          onPromptExtendChange={setPromptExtend}
          onAddReference={() => void handleAddReference()}
          onRemoveImage={handleRemoveImage}
          onOptimize={() => void handleOptimize()}
          onAdoptOptimization={handleAdoptOptimization}
          onUndoOptimization={handleUndoOptimization}
          onSubmit={() => void handleGenerate()}
          onOpenSettings={openSettings}
        />
      </div>

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      <SettingsDialog
        open={settingsOpen}
        apiStatus={apiStatus}
        busy={busy}
        checkingKey={checkingKey}
        connectionMessage={connectionMessage}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveKey}
        onClear={handleClearKey}
        onTest={handleTest}
      />
    </div>
  );
}

export default App;
