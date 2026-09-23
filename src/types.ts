export type StudioMode = "generate" | "edit";
export type ModelId = "sensenova-u1.5-lite" | "sensenova-u1.5-fast";
export type ImageSize = "auto" | "1024x1024" | "2048x2048" | "1536x2720" | "2720x1536";

export interface ImageAsset {
  id: string;
  name: string;
  mime_type: string;
  width: number;
  height: number;
  bytes: number;
  data_url: string;
  source_path?: string | null;
}

export interface GenerateImageRequest {
  model: ModelId;
  prompt: string;
  size: ImageSize;
  watermark: boolean;
  prompt_extend: boolean;
}

export interface EditImageRequest {
  model: ModelId;
  prompt: string;
  size: ImageSize;
  watermark: boolean;
  prompt_extend: boolean;
  images: ImageAsset[];
}

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  images_count?: number | null;
}

export interface ImageResult {
  asset: ImageAsset;
  model: string;
  usage: Usage | null;
}

export interface OptimizePromptRequest {
  prompt: string;
  mode: StudioMode;
  preset_name: string;
  source_image: ImageAsset | null;
}

export interface OptimizePromptResult {
  original_prompt: string;
  optimized_prompt: string;
  model: string;
}

export interface ApiKeyStatus {
  configured: boolean;
  persistent: boolean;
  backend: string;
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
  model_count: number;
}

export interface Preset {
  id: string;
  mode: StudioMode;
  name: string;
  summary: string;
  prompt: string;
}

export type OptimizationState = {
  original: string;
  optimized: string;
  model: string;
  status: "suggested" | "adopted" | "undone" | "stale";
};

export type BusyAction =
  | "generate"
  | "edit"
  | "optimize"
  | "import"
  | "save"
  | "test"
  | "save-key"
  | "clear-key"
  | null;

export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  text: string;
}
