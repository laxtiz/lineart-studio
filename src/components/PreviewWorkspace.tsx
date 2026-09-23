import {
  ArrowRight,
  Columns2,
  FileImage,
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  Save,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState } from "react";
import type { BusyAction, ImageAsset, ImageResult, StudioMode } from "../types";

export type ComparisonView = "split" | "result";

interface PreviewWorkspaceProps {
  mode: StudioMode;
  images: ImageAsset[];
  result: ImageResult | null;
  busy: BusyAction;
  comparison: ComparisonView;
  zoom: number;
  onComparisonChange: (view: ComparisonView) => void;
  onZoomChange: (zoom: number) => void;
  onImport: () => void;
  onSave: () => void;
  onUseResult: () => void;
  onPromptFocus: () => void;
}

interface CanvasImageProps {
  asset: ImageAsset;
  alt: string;
  zoom: number;
}

function CanvasImage({ asset, alt, zoom }: CanvasImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="image-load-error" role="status">
        <FileImage size={28} />
        <strong>无法显示这张图片</strong>
        <span>请检查图片格式或重新导入。</span>
      </div>
    );
  }

  return (
    <div className="image-zoom-frame" style={{ width: `${zoom}%` }}>
      <img
        src={asset.data_url}
        alt={alt}
        draggable={false}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

interface EmptyCanvasProps {
  mode: StudioMode;
  hasResult: boolean;
  resultOnly?: boolean;
  onImport?: () => void;
  onPromptFocus?: () => void;
}

function EmptyCanvas({ mode, hasResult, resultOnly = false, onImport, onPromptFocus }: EmptyCanvasProps) {
  const editTitle = resultOnly ? "结果会显示在这里" : "导入线稿开始上色";
  const editDescription = resultOnly
    ? "执行上色后，原图与结果会在这里并排对比。"
    : "导入主图后选择预设；最多再添加 4 张参考图。";
  return (
    <div className="preview-empty">
      <span className="empty-icon" aria-hidden="true">
        {mode === "edit" ? <ImagePlus size={25} /> : <ImageIcon size={25} />}
      </span>
      <h2>{mode === "edit" ? editTitle : hasResult ? "结果已更新" : "从一句话开始创作"}</h2>
      <p>{mode === "edit" ? editDescription : "选择预设、描述画面，然后执行生图。"}</p>
      {mode === "edit" && !resultOnly && onImport ? (
        <button type="button" className="button button-primary" onClick={onImport}>
          <Upload size={15} />
          <span>导入线稿</span>
        </button>
      ) : null}
      {mode === "generate" && onPromptFocus ? (
        <button type="button" className="button button-secondary" onClick={onPromptFocus}>
          <ArrowRight size={15} />
          <span>编写提示词</span>
        </button>
      ) : null}
    </div>
  );
}

export function PreviewWorkspace({
  mode,
  images,
  result,
  busy,
  comparison,
  zoom,
  onComparisonChange,
  onZoomChange,
  onImport,
  onSave,
  onUseResult,
  onPromptFocus,
}: PreviewWorkspaceProps) {
  const sourceAsset = images[0];
  const isBusy = busy === "generate" || busy === "edit";
  const busyText = busy === "edit" ? "正在为线稿上色" : "正在生成图片";

  return (
    <main className="preview-workspace" aria-label="图片预览工作区">
      <div className="preview-toolbar">
        <div className="preview-title">
          <strong>{mode === "edit" ? "线稿工作区" : "生成画布"}</strong>
          <span>
            {mode === "edit"
              ? sourceAsset
                ? `主图 ${sourceAsset.width} × ${sourceAsset.height}`
                : "尚未导入主图"
              : result
                ? `${result.asset.width} × ${result.asset.height}`
                : "等待生成"}
          </span>
        </div>

        <div className="preview-tools">
          {mode === "edit" ? (
            <div className="view-switch" role="group" aria-label="结果查看方式">
              <button
                type="button"
                className={comparison === "split" ? "is-active" : ""}
                aria-pressed={comparison === "split"}
                onClick={() => onComparisonChange("split")}
                title="原图与结果并排"
              >
                <Columns2 size={14} />
                <span>并排</span>
              </button>
              <button
                type="button"
                className={comparison === "result" ? "is-active" : ""}
                aria-pressed={comparison === "result"}
                onClick={() => onComparisonChange("result")}
                title="只查看结果"
                disabled={!result}
              >
                <ImageIcon size={14} />
                <span>结果</span>
              </button>
            </div>
          ) : null}

          <div className="zoom-control" role="group" aria-label="预览缩放">
            <button
              type="button"
              aria-label="缩小预览"
              title="缩小预览"
              onClick={() => onZoomChange(Math.max(50, zoom - 25))}
              disabled={zoom <= 50}
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              className="zoom-value"
              onClick={() => onZoomChange(100)}
              title="重置为 100%"
            >
              {zoom}%
            </button>
            <button
              type="button"
              aria-label="放大预览"
              title="放大预览"
              onClick={() => onZoomChange(Math.min(200, zoom + 25))}
              disabled={zoom >= 200}
            >
              <ZoomIn size={15} />
            </button>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onImport}
            disabled={Boolean(busy)}
            aria-label="导入图片"
            title="导入图片"
          >
            <Upload size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onSave}
            disabled={!result || Boolean(busy)}
            aria-label="保存结果"
            title="保存结果"
          >
            <Save size={16} />
          </button>
        </div>
      </div>

      {mode === "edit" && comparison === "split" ? (
        <div className="split-preview">
          <section className="canvas-pane" aria-label="输入线稿">
            <div className="pane-label">
              <span>输入</span>
              <small>主图</small>
            </div>
            <div className="canvas-scroll checkerboard">
              {sourceAsset ? (
                <CanvasImage key={sourceAsset.id} asset={sourceAsset} alt="输入线稿" zoom={zoom} />
              ) : (
                <EmptyCanvas mode={mode} hasResult={false} onImport={onImport} />
              )}
            </div>
          </section>
          <section className="canvas-pane" aria-label="上色结果">
            <div className="pane-label">
              <span>结果</span>
              <small>{result ? "已完成" : "等待生成"}</small>
            </div>
            <div className="canvas-scroll checkerboard">
              {result ? (
                <CanvasImage key={result.asset.id} asset={result.asset} alt="上色结果" zoom={zoom} />
              ) : (
                <EmptyCanvas mode={mode} hasResult={false} resultOnly />
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="single-canvas" aria-label={mode === "edit" ? "上色结果" : "生成结果"}>
          <div className="pane-label">
            <span>{mode === "edit" ? "结果" : "生成结果"}</span>
            <small>{result ? "已完成" : "等待生成"}</small>
          </div>
          <div className="canvas-scroll checkerboard">
            {result ? (
              <CanvasImage key={result.asset.id} asset={result.asset} alt="生成结果" zoom={zoom} />
            ) : (
              <EmptyCanvas mode={mode} hasResult={false} resultOnly={mode === "edit"} onPromptFocus={onPromptFocus} />
            )}
          </div>
        </section>
      )}

      {isBusy ? (
        <div className="busy-overlay" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={23} />
          <strong>{busyText}</strong>
          <span>请求已发送，完成后会自动更新画布。</span>
        </div>
      ) : null}

      <div className="preview-statusbar">
        <div className="result-summary">
          {result ? (
            <>
              <span className="status-dot" />
              <strong>结果就绪</strong>
              <span className="model-id">{result.model}</span>
              {result.usage?.total_tokens ? <span>{result.usage.total_tokens} tokens</span> : null}
            </>
          ) : (
            <span>提示词与图片仅保留在当前工作区</span>
          )}
        </div>
        {result ? (
          <button
            type="button"
            className="text-command"
            onClick={onUseResult}
            disabled={Boolean(busy)}
          >
            <span>作为下一次输入</span>
            <ArrowRight size={14} />
          </button>
        ) : null}
      </div>
    </main>
  );
}
