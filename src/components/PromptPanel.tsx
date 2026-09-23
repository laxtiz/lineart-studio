import {
  Brush,
  Check,
  ChevronDown,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { useMemo } from "react";
import { MODEL_OPTIONS, OPTIMIZER_MODEL, SIZE_OPTIONS } from "../data/presets";
import { buildCharacterDiff } from "../lib/workflow";
import type {
  BusyAction,
  ImageAsset,
  ImageSize,
  ModelId,
  OptimizationState,
  Preset,
  StudioMode,
} from "../types";

interface PromptPanelProps {
  mode: StudioMode;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  selectedPreset?: Preset;
  model: ModelId;
  size: ImageSize;
  noWatermark: boolean;
  promptExtend: boolean;
  images: ImageAsset[];
  optimization: OptimizationState | null;
  busy: BusyAction;
  runtimeAvailable: boolean;
  hasKey: boolean;
  onModelChange: (model: ModelId) => void;
  onSizeChange: (size: ImageSize) => void;
  onNoWatermarkChange: (value: boolean) => void;
  onPromptExtendChange: (value: boolean) => void;
  onAddReference: () => void;
  onRemoveImage: (index: number) => void;
  onOptimize: () => void;
  onAdoptOptimization: () => void;
  onUndoOptimization: () => void;
  onSubmit: () => void;
  onOpenSettings: () => void;
}

function OptimizationPanel({
  optimization,
  busy,
  onAdopt,
  onUndo,
}: {
  optimization: OptimizationState;
  busy: BusyAction;
  onAdopt: () => void;
  onUndo: () => void;
}) {
  const diff = useMemo(
    () => buildCharacterDiff(optimization.original, optimization.optimized),
    [optimization.optimized, optimization.original],
  );
  const adopted = optimization.status === "adopted";
  const undone = optimization.status === "undone";
  const stale = optimization.status === "stale";

  return (
    <div className={`optimization-panel status-${optimization.status}`}>
      <div className="optimization-header">
        <div>
          <span className="eyebrow">提示词优化</span>
          <strong>优化前后差异</strong>
        </div>
        <code>{optimization.model}</code>
      </div>
      <div className="diff-block" aria-label="优化前后差异">
        {diff.map((part, index) => {
          if (part.kind === "same") {
            return <span key={`${part.kind}-${index}`}>{part.text}</span>;
          }
          if (part.kind === "removed") {
            return <del key={`${part.kind}-${index}`}>{part.text}</del>;
          }
          return <ins key={`${part.kind}-${index}`}>{part.text}</ins>;
        })}
      </div>
      <div className="optimization-actions">
        <span className="optimization-state">
          {adopted ? (
            <Check size={13} />
          ) : undone ? (
            <Undo2 size={13} />
          ) : stale ? (
            <TriangleAlert size={13} />
          ) : (
            <WandSparkles size={13} />
          )}
          {adopted ? "已采用" : undone ? "已撤销" : stale ? "提示词已变化" : "建议待采用"}
        </span>
        <div>
          <button
            type="button"
            className="small-button"
            onClick={onUndo}
            disabled={Boolean(busy) || !adopted}
          >
            <Undo2 size={13} />
            <span>撤销</span>
          </button>
          <button
            type="button"
            className="small-button small-button-primary"
            onClick={onAdopt}
            disabled={Boolean(busy) || optimization.status !== "suggested"}
          >
            <Check size={13} />
            <span>采用</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptPanel({
  mode,
  prompt,
  onPromptChange,
  selectedPreset,
  model,
  size,
  noWatermark,
  promptExtend,
  images,
  optimization,
  busy,
  runtimeAvailable,
  hasKey,
  onModelChange,
  onSizeChange,
  onNoWatermarkChange,
  onPromptExtendChange,
  onAddReference,
  onRemoveImage,
  onOptimize,
  onAdoptOptimization,
  onUndoOptimization,
  onSubmit,
  onOpenSettings,
}: PromptPanelProps) {
  const referenceCount = Math.max(0, images.length - 1);
  const canAddReference = mode === "edit" && images.length > 0 && referenceCount < 4;
  const isOptimizing = busy === "optimize";
  const isSubmitting = busy === "generate" || busy === "edit";
  const submitDisabled = Boolean(busy) || !prompt.trim() || (mode === "edit" && images.length === 0);
  const optimizationDisabled =
    Boolean(busy) || !prompt.trim() || (mode === "edit" && images.length === 0);

  return (
    <aside className="prompt-panel" aria-label="提示词与生成设置">
      <div className="inspector-scroll">
        <div className="inspector-section prompt-section">
          <div className="inspector-heading">
            <div>
              <span className="eyebrow">创作描述</span>
              <h2>{mode === "edit" ? "告诉模型如何上色" : "描述你想要的画面"}</h2>
            </div>
            <span className="character-count">{prompt.length} 字</span>
          </div>
          {selectedPreset ? (
            <div className="active-preset-line">
              <span className="active-preset-dot" />
              <span>当前预设：{selectedPreset.name}</span>
              <small>可继续编辑</small>
            </div>
          ) : null}
          <textarea
            className="prompt-textarea"
            value={prompt}
            onChange={(event) => onPromptChange(event.currentTarget.value)}
            placeholder={mode === "edit" ? "例如：保留原线稿，为服装加入低饱和的暖色调…" : "例如：安静的雨后街角，柔和的电影光线…"}
            maxLength={4000}
            spellCheck={false}
            disabled={Boolean(busy)}
            aria-label="提示词"
          />
          <div className="prompt-tools">
            <span>支持中文描述与多段补充要求</span>
            <button
              type="button"
              className="small-button optimize-button"
              onClick={onOptimize}
              disabled={optimizationDisabled}
              title={mode === "edit" && images.length === 0 ? "请先导入原图" : "使用 LLM 优化当前提示词"}
            >
              {isOptimizing ? <LoaderCircle className="spin" size={14} /> : <WandSparkles size={14} />}
              <span>{isOptimizing ? "优化中" : "优化提示词"}</span>
            </button>
          </div>
          {optimization ? (
            <OptimizationPanel
              optimization={optimization}
              busy={busy}
              onAdopt={onAdoptOptimization}
              onUndo={onUndoOptimization}
            />
          ) : (
            <p className="helper-text">
              优化结果会先显示差异，确认后才会替换当前描述。默认模型：<code>{OPTIMIZER_MODEL}</code>
            </p>
          )}
        </div>

        <div className="inspector-section settings-section">
          <div className="section-heading">
            <span>生成设置</span>
            <span className="muted-label">按需调整</span>
          </div>

          <label className="field-label" htmlFor="model-select">
            模型
          </label>
          <div className="select-wrap">
            <select
              id="model-select"
              value={model}
              onChange={(event) => onModelChange(event.currentTarget.value as ModelId)}
              disabled={Boolean(busy)}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} · {option.value}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
          <p className="field-help">{MODEL_OPTIONS.find((option) => option.value === model)?.detail}</p>

          <label className="field-label" htmlFor="size-select">
            尺寸
          </label>
          <div className="select-wrap">
            <select
              id="size-select"
              value={size}
              onChange={(event) => onSizeChange(event.currentTarget.value as ImageSize)}
              disabled={Boolean(busy)}
            >
              {SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>

          <div className="switch-list">
            <label className="switch-row">
              <span>
                <strong>API 自动扩写</strong>
                <small>由模型补充必要细节</small>
              </span>
              <input
                type="checkbox"
                checked={promptExtend}
                onChange={(event) => onPromptExtendChange(event.currentTarget.checked)}
                disabled={Boolean(busy)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
            <label className="switch-row">
              <span>
                <strong>无水印</strong>
                <small>请求不添加水印</small>
              </span>
              <input
                type="checkbox"
                checked={noWatermark}
                onChange={(event) => onNoWatermarkChange(event.currentTarget.checked)}
                disabled={Boolean(busy)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>
        </div>

        {mode === "edit" ? (
          <div className="inspector-section reference-section">
            <div className="section-heading">
              <span>参考图</span>
              <span className="count-badge">{images.length}/5</span>
            </div>
            <p className="helper-text">主图固定为第一张，最多添加 4 张额外参考图。</p>
            {images.length ? (
              <div className="reference-list">
                {images.map((asset, index) => (
                  <div className={`reference-card ${index === 0 ? "is-main" : ""}`} key={asset.id}>
                    <div className="reference-thumb">
                      <img src={asset.data_url} alt={index === 0 ? "主图" : `参考图 ${index}`} />
                      {index === 0 ? <span>主图</span> : null}
                    </div>
                    <div className="reference-meta">
                      <strong>{asset.name}</strong>
                      <span>{asset.width} × {asset.height}</span>
                    </div>
                    <button
                      type="button"
                      className="reference-remove"
                      aria-label={index === 0 ? "移除主图" : `移除参考图 ${index}`}
                      title={index === 0 ? "移除主图" : "移除参考图"}
                      onClick={() => onRemoveImage(index)}
                      disabled={Boolean(busy)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="reference-empty">
                <ImagePlus size={19} />
                <span>先在画布导入主图</span>
              </div>
            )}
            <button
              type="button"
              className="add-reference-button"
              onClick={onAddReference}
              disabled={!canAddReference || Boolean(busy)}
              title={!canAddReference ? "需要先导入主图，且最多 4 张参考图" : "添加参考图"}
            >
              <Plus size={15} />
              <span>添加参考图</span>
              <small>{referenceCount}/4</small>
            </button>
          </div>
        ) : null}
      </div>

      <div className="inspector-footer">
        {!runtimeAvailable ? (
          <button type="button" className="key-reminder" onClick={onOpenSettings}>
            <KeyRound size={14} />
            <span>浏览器预览不可执行，请在桌面应用中使用</span>
          </button>
        ) : !hasKey ? (
          <button type="button" className="key-reminder" onClick={onOpenSettings}>
            <KeyRound size={14} />
            <span>尚未配置 API Key，点击打开设置</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`submit-button ${mode === "edit" ? "submit-edit" : "submit-generate"}`}
          onClick={onSubmit}
          disabled={submitDisabled}
        >
          {isSubmitting ? <LoaderCircle className="spin" size={17} /> : mode === "edit" ? <Brush size={17} /> : <Sparkles size={17} />}
          <span>{isSubmitting ? "正在处理…" : mode === "edit" ? "开始上色" : "开始生图"}</span>
          <kbd>⌘ / Ctrl ↵</kbd>
        </button>
      </div>
    </aside>
  );
}
