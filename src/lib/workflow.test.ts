import { describe, expect, it } from "vitest";
import { getPresetsForMode } from "../data/presets";
import { buildCharacterDiff, mergePresetPrompt, switchMode } from "./workflow";

const editPreset = getPresetsForMode("edit")[0];
const waterPreset = getPresetsForMode("edit")[1];

describe("workflow prompt flow", () => {
  it("preserves the handwritten prompt when switching modes", () => {
    const next = switchMode(
      "edit",
      "generate",
      "保留角色的蓝色眼睛",
      { edit: editPreset.id, generate: "generate-japanese-animation" },
    );

    expect(next.mode).toBe("generate");
    expect(next.prompt).toBe("保留角色的蓝色眼睛");
    expect(next.notice).toContain("完整保留");
  });

  it("merges a new preset before existing handwritten requirements", () => {
    const merged = mergePresetPrompt("请让背景更安静", editPreset, waterPreset);

    expect(merged.merged).toBe(true);
    expect(merged.prompt).toContain(waterPreset.prompt);
    expect(merged.prompt).toContain("请让背景更安静");
  });

  it("replaces the active preset without accumulating older preset text", () => {
    const first = mergePresetPrompt(`${editPreset.prompt}\n\n补充要求：\n眼睛保持蓝色`, editPreset, waterPreset);
    const second = mergePresetPrompt(first.prompt, waterPreset, editPreset);

    expect(second.prompt).toContain(editPreset.prompt);
    expect(second.prompt).not.toContain(waterPreset.prompt);
    expect(second.prompt).toContain("眼睛保持蓝色");
  });

  it("does nothing when the active preset is selected again", () => {
    const result = mergePresetPrompt(editPreset.prompt, editPreset, editPreset);

    expect(result.changed).toBe(false);
    expect(result.prompt).toBe(editPreset.prompt);
  });

  it("builds a bounded diff for long prompts", () => {
    const before = `${"a".repeat(4000)}旧`;
    const after = `${"a".repeat(4000)}新`;
    const diff = buildCharacterDiff(before, after);

    expect(diff).toHaveLength(3);
    expect(diff.map((part) => part.kind)).toEqual(["same", "removed", "added"]);
  });
});
