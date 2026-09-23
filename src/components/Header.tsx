import { KeyRound, LoaderCircle, Palette, PlugZap, Settings, TriangleAlert } from "lucide-react";
import type { ApiKeyStatus } from "../types";

interface HeaderProps {
  apiStatus: ApiKeyStatus;
  checkingKey: boolean;
  busy: boolean;
  testing: boolean;
  onTest: () => void;
  onSettings: () => void;
}

export function Header({
  apiStatus,
  checkingKey,
  busy,
  testing,
  onTest,
  onSettings,
}: HeaderProps) {
  const statusText = checkingKey
    ? "检查密钥"
    : apiStatus.configured
      ? apiStatus.persistent
        ? "密钥已保存"
        : "仅本次会话"
      : "未配置密钥";
  const statusTitle = checkingKey
    ? "正在读取密钥状态"
    : apiStatus.configured
      ? apiStatus.persistent
        ? `已保存到${apiStatus.backend}`
        : "密钥仅保留在本次应用会话中"
      : "尚未配置 API Key";

  return (
    <header className="app-header">
      <div className="brand-lockup" aria-label="线稿上色工作室">
        <span className="brand-mark" aria-hidden="true">
          <Palette size={18} />
        </span>
        <div>
          <h1>线稿上色工作室</h1>
          <p>生图与线稿上色工作台</p>
        </div>
      </div>

      <div className="header-actions">
        <div
          className={`key-status ${apiStatus.configured ? "is-configured" : "is-missing"}`}
          title={statusTitle}
        >
          {apiStatus.configured ? <KeyRound size={14} /> : <TriangleAlert size={14} />}
          <span>{statusText}</span>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onTest}
          disabled={busy || checkingKey}
          aria-label="测试 API 可达性"
          title="测试 API 可达性"
        >
          {testing ? <LoaderCircle className="spin" size={17} /> : <PlugZap size={17} />}
        </button>
        <button className="button button-secondary" type="button" onClick={onSettings} disabled={busy}>
          <Settings size={16} />
          <span>设置</span>
        </button>
      </div>
    </header>
  );
}
