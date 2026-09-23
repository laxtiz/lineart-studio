import type { ImageSize, ModelId, Preset, StudioMode } from "../types";

export const MODEL_OPTIONS: ReadonlyArray<{ value: ModelId; label: string; detail: string }> = [
  {
    value: "sensenova-u1.5-lite",
    label: "U1.5 Lite",
    detail: "轻量图像模型，适合先快速验证构图与配色",
  },
  {
    value: "sensenova-u1.5-fast",
    label: "U1.5 Fast",
    detail: "加速图像模型，支持参考图、局部修改和全局风格调整",
  },
];

export const SIZE_OPTIONS: ReadonlyArray<{ value: ImageSize; label: string }> = [
  { value: "auto", label: "自动（跟随输入）" },
  { value: "1024x1024", label: "1024 × 1024 · 方图" },
  { value: "2048x2048", label: "2048 × 2048 · 高清方图" },
  { value: "1536x2720", label: "1536 × 2720 · 竖版" },
  { value: "2720x1536", label: "2720 × 1536 · 横版" },
];

export const OPTIMIZER_MODEL = "sensenova-6.8-flash-lite";

export const PRESETS = [
  {
    id: "edit-natural-flat",
    mode: "edit",
    name: "自然平涂上色",
    summary: "线稿上色的首选入口",
    prompt:
      "为原始线稿添加自然、克制、协调的平涂色彩。严格保留原线稿的构图、主体身份、姿态、轮廓、线条走向、细节层级与留白，不重绘、不裁切、不改变视角，不添加任何新主体、物体、装饰或文字。优先使用符合内容语义且层次清晰的自然色，保持干净边缘与均衡明暗，完整保留所有原始线条。",
  },
  {
    id: "edit-watercolor",
    mode: "edit",
    name: "水彩",
    summary: "透明叠色与纸张肌理",
    prompt:
      "将原始线稿处理为轻盈通透的手绘水彩上色。严格保留原线稿的构图、主体身份、姿态、轮廓、线条走向、细节层级与留白，不重绘、不裁切、不改变视角，不添加任何新主体、物体、装饰或文字。使用自然水彩颜料、柔和透明叠色、细微纸张肌理和克制晕染，让色彩停留在原始轮廓内部，同时完整保留所有线稿。",
  },
  {
    id: "edit-colored-pencil",
    mode: "edit",
    name: "彩铅",
    summary: "细腻笔触与纸张颗粒",
    prompt:
      "为原始线稿施加上乘彩色铅笔质感。严格保留原线稿的构图、主体身份、姿态、轮廓、线条走向、细节层级与留白，不重绘、不裁切、不改变视角，不添加任何新主体、物体、装饰或文字。呈现细腻交叉笔触、柔和粉感、轻微纸张颗粒与自然色差，控制整体饱和度，色彩不得遮盖原始线条。",
  },
  {
    id: "edit-marker",
    mode: "edit",
    name: "马克笔",
    summary: "清晰色块与适度高光",
    prompt:
      "将原始线稿转换为专业马克笔插画上色。严格保留原线稿的构图、主体身份、姿态、轮廓、线条走向、细节层级与留白，不重绘、不裁切、不改变视角，不添加任何新主体、物体、装饰或文字。使用边界清晰、层次明确的综合色块，合理处理叠色与少量高光，保持整体明快专业，完整保留原始轮廓与线条。",
  },
  {
    id: "edit-anime-cel",
    mode: "edit",
    name: "动漫赛璐璐",
    summary: "分层色块与明确阴影",
    prompt:
      "为原始线稿完成精致的动漫赛璐璐上色。严格保留原线稿的构图、主体身份、姿态、轮廓、线条走向、细节层级与留白，不重绘、不裁切、不改变视角，不添加任何新主体、物体、装饰或文字。使用干净的两到三层色块、明确但柔和的阴影、少量克制高光与协调的色彩设计，不改变角色特征，完整保留原始线稿。",
  },
  {
    id: "edit-vintage-print",
    mode: "edit",
    name: "复古印刷",
    summary: "有限套色与轻微套印偏差",
    prompt:
      "将原始线稿处理为克制的复古印刷作品。严格保留原线稿的构图、主体身份、姿态、轮廓、线条走向、细节层级与留白，不重绘、不裁切、不改变视角，不添加任何新主体、物体、装饰或文字。使用有限套色、低饱和配色、自然网点或纸张颗粒、极轻微套印偏差与年代感，但不要加入任何可读文字或额外元素，原始线条必须清晰完整。",
  },
  {
    id: "generate-japanese-animation",
    mode: "generate",
    name: "日系动画",
    summary: "动画背景与清透光影",
    prompt:
      "创作一幅精致的日系动画风格画面，角色表情自然，动作有明确叙事，环境细节服务于主体。使用清透而克制的色彩、柔和光影、细腻赛璐璐质感与富有空气感的背景构图。画面完整、主体明确、层次清晰，不包含文字、水印、标志或边框。",
  },
  {
    id: "generate-watercolor-storybook",
    mode: "generate",
    name: "水彩绘本",
    summary: "温暖叙事与纸张肌理",
    prompt:
      "创作一幅温柔而有故事感的水彩绘本插画，使用自然水彩、透明叠色、柔和纸纹与富有想象力的色彩。人物与环境关系清楚，保留大量呼吸感，笔触轻盈但主体明确。画面不包含文字、水印、标志或边框。",
  },
  {
    id: "generate-flat-vector",
    mode: "generate",
    name: "扁平矢量",
    summary: "几何块面与清晰信息",
    prompt:
      "创作一幅现代扁平矢量风格插画，以清晰几何块面、有限而协调的配色、简洁轮廓和稳定视觉层级构成画面。造型准确，留白有节奏，主体突出，适合高质量图标与编辑使用。画面不包含文字、水印、标志或边框。",
  },
  {
    id: "generate-clay-3d",
    mode: "generate",
    name: "3D 黏土",
    summary: "柔和塑形与棚拍光照",
    prompt:
      "创作一幅高品质 3D 黏土风格场景，造型圆润而有辨识度，材质细腻，使用柔和棚拍光照、自然环境遮蔽与干净背景。色彩克制，空间关系清楚，细节服务于整体造型。画面不包含文字、水印、标志或边框。",
  },
  {
    id: "generate-cinematic-concept",
    mode: "generate",
    name: "电影概念",
    summary: "强叙事光影与美术设计",
    prompt:
      "创作一幅电影概念艺术画面，具有明确叙事瞬间、强烈景别层次、专业美术设计、可信空间尺度与富有方向性的电影光影。色彩服务于情绪，材质和环境细节丰富但不过度杂乱，主体与视觉焦点清晰。画面不包含文字、水印、标志或边框。",
  },
  {
    id: "generate-character-sheet",
    mode: "generate",
    name: "角色设定",
    summary: "造型说明与多角度展示",
    prompt:
      "创作一张专业角色设定图，完整展示角色身份、年龄感、服装结构、材质、配饰、发型与关键细节，造型语言统一，视角清晰，背景干净并便于后续制作参考。不要添加说明文字、尺寸标注、水印、标志或边框。",
  },
] as const satisfies readonly Preset[];

export function getPresetsForMode(mode: StudioMode): Preset[] {
  return PRESETS.filter((preset) => preset.mode === mode);
}

export function getDefaultPresetId(mode: StudioMode): string {
  return getPresetsForMode(mode)[0]?.id ?? "";
}
