import { describe, expect, it } from "vitest";
import { getPresetsForMode } from "./presets";

describe("getPresetsForMode", () => {
  it("returns the six edit presets with natural flat coloring first", () => {
    const presets = getPresetsForMode("edit");

    expect(presets).toHaveLength(6);
    expect(presets.every((preset) => preset.mode === "edit")).toBe(true);
    expect(presets[0].name).toBe("自然平涂上色");
    expect(presets[0].summary).toContain("首选");
  });

  it("keeps generate presets separate from edit presets", () => {
    const presets = getPresetsForMode("generate");

    expect(presets).toHaveLength(6);
    expect(presets.every((preset) => preset.mode === "generate")).toBe(true);
    expect(presets.map((preset) => preset.name)).toContain("角色设定");
  });
});
