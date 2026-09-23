import { Brush, Check, Keyboard, Palette, Sparkles } from "lucide-react";
import { getPresetsForMode } from "../data/presets";
import type { StudioMode } from "../types";

interface ModeSidebarProps {
  mode: StudioMode;
  selectedPresetId: string;
  promptLength: number;
  busy: boolean;
  onModeChange: (mode: StudioMode) => void;
  onPresetSelect: (presetId: string) => void;
}

export function ModeSidebar({
  mode,
  selectedPresetId,
  promptLength,
  busy,
  onModeChange,
  onPresetSelect,
}: ModeSidebarProps) {
  const presets = getPresetsForMode(mode);

  return (
    <aside className="mode-sidebar" aria-label="创作模式与预设">
      <div className="sidebar-section mode-section">
        <div className="section-heading">
          <span>创作模式</span>
          <span className="muted-label">两栏切换</span>
        </div>
        <div className="mode-switch" role="group" aria-label="选择创作模式">
          <button
            type="button"
            className={mode === "generate" ? "is-active" : ""}
            aria-pressed={mode === "generate"}
            disabled={busy}
            onClick={() => onModeChange("generate")}
          >
            <Sparkles size={15} />
            <span>生图</span>
          </button>
          <button
            type="button"
            className={mode === "edit" ? "is-active" : ""}
            aria-pressed={mode === "edit"}
            disabled={busy}
            onClick={() => onModeChange("edit")}
          >
            <Brush size={15} />
            <span>改图</span>
          </button>
        </div>
        <p className="mode-hint">切换模式会完整保留提示词，不会自动覆盖当前内容。</p>
      </div>

      <div className="sidebar-section preset-section">
        <div className="section-heading preset-heading">
          <span>{mode === "edit" ? "上色预设" : "生图预设"}</span>
          <span className="count-badge">{presets.length}</span>
        </div>
        <div className="preset-list">
          {presets.map((preset, index) => {
            const selected = preset.id === selectedPresetId;
            return (
              <button
                type="button"
                key={preset.id}
                className={`preset-card ${selected ? "is-selected" : ""} ${index === 0 && mode === "edit" ? "is-primary-entry" : ""}`}
                aria-pressed={selected}
                disabled={busy}
                onClick={() => onPresetSelect(preset.id)}
              >
                <span className="preset-icon" aria-hidden="true">
                  {index === 0 && mode === "edit" ? <Palette size={16} /> : <Brush size={15} />}
                </span>
                <span className="preset-copy">
                  <span className="preset-name-row">
                    <strong>{preset.name}</strong>
                    {selected ? <Check size={14} /> : null}
                  </span>
                  <span>{preset.summary}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="prompt-mini-status">
          <span>当前提示词</span>
          <strong>{promptLength}</strong>
        </div>
        <div className="shortcut-line">
          <Keyboard size={14} />
          <span>Ctrl / ⌘ + Enter 执行</span>
        </div>
      </div>
    </aside>
  );
}
