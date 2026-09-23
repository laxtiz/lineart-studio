import { getDefaultPresetId } from "../data/presets";
import type { Preset, StudioMode } from "../types";

export interface ModeSwitchState {
  mode: StudioMode;
  selectedPresetIds: Record<StudioMode, string>;
  prompt: string;
  notice: string;
}

export function switchMode(
  currentMode: StudioMode,
  nextMode: StudioMode,
  prompt: string,
  selectedPresetIds: Record<StudioMode, string>,
): ModeSwitchState {
  const nextPresetId = selectedPresetIds[nextMode] || getDefaultPresetId(nextMode);
  return {
    mode: nextMode,
    selectedPresetIds: {
      ...selectedPresetIds,
      [nextMode]: nextPresetId,
    },
    prompt,
    notice:
      currentMode === nextMode
        ? "当前模式未变化。"
        : "模式已切换，提示词已完整保留，预设不会自动覆盖。",
  };
}

export interface PresetMergeResult {
  prompt: string;
  merged: boolean;
  changed: boolean;
}

const SUPPLEMENT_MARKER = "\n\n补充要求：\n";

export function mergePresetPrompt(
  currentPrompt: string,
  currentPreset: Preset | undefined,
  nextPreset: Preset,
): PresetMergeResult {
  const current = currentPrompt.trim();
  if (currentPreset?.id === nextPreset.id) {
    return { prompt: currentPrompt, merged: false, changed: false };
  }
  if (!current) {
    return { prompt: nextPreset.prompt, merged: false, changed: true };
  }
  if (current.includes(nextPreset.prompt.trim())) {
    return { prompt: currentPrompt, merged: false, changed: false };
  }
  const currentBase = currentPreset?.prompt.trim();
  if (currentBase && current.startsWith(currentBase)) {
    const remainder = current.slice(currentBase.length).trim();
    return {
      prompt: remainder ? `${nextPreset.prompt}${SUPPLEMENT_MARKER}${remainder}` : nextPreset.prompt,
      merged: Boolean(remainder),
      changed: true,
    };
  }
  return {
    prompt: `${nextPreset.prompt}${SUPPLEMENT_MARKER}${current}`,
    merged: true,
    changed: true,
  };
}

export type DiffPart = {
  kind: "same" | "removed" | "added";
  text: string;
};

function appendPart(parts: DiffPart[], kind: DiffPart["kind"], value: string): void {
  const last = parts[parts.length - 1];
  if (last?.kind === kind) {
    last.text += value;
    return;
  }
  parts.push({ kind, text: value });
}

export function buildCharacterDiff(before: string, after: string): DiffPart[] {
  if (before === after) {
    return before ? [{ kind: "same", text: before }] : [];
  }
  if (!before) {
    return [{ kind: "added", text: after }];
  }
  if (!after) {
    return [{ kind: "removed", text: before }];
  }

  const beforeChars = Array.from(before);
  const afterChars = Array.from(after);
  let prefixLength = 0;
  const sharedLength = Math.min(beforeChars.length, afterChars.length);
  while (
    prefixLength < sharedLength &&
    beforeChars[prefixLength] === afterChars[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < sharedLength - prefixLength &&
    beforeChars[beforeChars.length - suffixLength - 1] ===
      afterChars[afterChars.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const parts: DiffPart[] = [];
  if (prefixLength) {
    appendPart(parts, "same", beforeChars.slice(0, prefixLength).join(""));
  }
  const removed = beforeChars.slice(prefixLength, beforeChars.length - suffixLength).join("");
  const added = afterChars.slice(prefixLength, afterChars.length - suffixLength).join("");
  if (removed) {
    appendPart(parts, "removed", removed);
  }
  if (added) {
    appendPart(parts, "added", added);
  }
  if (suffixLength) {
    appendPart(parts, "same", beforeChars.slice(beforeChars.length - suffixLength).join(""));
  }
  return parts;
}
