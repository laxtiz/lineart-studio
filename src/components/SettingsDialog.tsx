import { Eye, EyeOff, KeyRound, LoaderCircle, PlugZap, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ApiKeyStatus, BusyAction } from "../types";

interface SettingsDialogProps {
  open: boolean;
  apiStatus: ApiKeyStatus;
  busy: BusyAction;
  checkingKey: boolean;
  connectionMessage: string;
  onClose: () => void;
  onSave: (apiKey: string, remember: boolean) => Promise<boolean>;
  onClear: () => Promise<boolean>;
  onTest: () => Promise<boolean>;
}

export function SettingsDialog({
  open,
  apiStatus,
  busy,
  checkingKey,
  connectionMessage,
  onClose,
  onSave,
  onClear,
  onTest,
}: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isBusy = Boolean(busy) || checkingKey;

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setApiKey("");
    setShowKey(false);
    const focusTimer = window.setTimeout(() => passwordRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setApiKey("");
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) {
    return null;
  }

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const storageText = apiStatus.configured
    ? apiStatus.persistent
      ? "当前密钥由系统凭据库保存。"
      : "当前密钥仅保留在本次应用会话中。"
    : "保存后才会交给桌面后端。";

  const handleSave = async () => {
    const value = apiKey.trim();
    if (!value) {
      return;
    }
    const saved = await onSave(value, remember);
    if (saved) {
      setApiKey("");
      onClose();
    }
  };

  const handleClear = async () => {
    const cleared = await onClear();
    if (cleared) {
      setApiKey("");
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          setApiKey("");
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-describedby="settings-description"
        onKeyDown={trapFocus}
      >
        <div className="dialog-header">
          <div>
            <span className="eyebrow">应用设置</span>
            <h2 id="settings-title">API 连接</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭设置"
            title="关闭设置"
            disabled={isBusy}
            onClick={() => {
              setApiKey("");
              onClose();
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div className="dialog-body">
          <div className="credential-note">
            <span className="note-icon" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>密钥只通过 IPC 交给 Rust</strong>
              <p id="settings-description">前端不会写入 localStorage、持久化状态或日志。勾选记住后，由系统凭据库保存。</p>
            </div>
          </div>

          <label className="field-label" htmlFor="api-key">
            API Key
          </label>
          <div className="password-field">
            <KeyRound size={16} aria-hidden="true" />
            <input
              ref={passwordRef}
              id="api-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              placeholder={apiStatus.configured ? "已保存，输入新密钥可替换" : "输入 API Key"}
              autoComplete="new-password"
              spellCheck={false}
              disabled={isBusy}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
              title={showKey ? "隐藏 API Key" : "显示 API Key"}
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="field-help">{storageText} 已保存的密钥不会回显。</p>

          <label className="check-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.currentTarget.checked)}
              disabled={isBusy}
            />
            <span>
              <strong>记住此密钥</strong>
              <small>使用操作系统凭据库，在后续启动时恢复</small>
            </span>
          </label>

          {connectionMessage ? (
            <div className={`connection-result ${apiStatus.configured ? "" : "is-muted"}`} role="status">
              <PlugZap size={15} />
              <span>{connectionMessage}</span>
            </div>
          ) : null}
        </div>

        <div className="dialog-footer">
          <button
            type="button"
            className="button button-danger-ghost"
            disabled={isBusy || !apiStatus.configured}
            onClick={() => void handleClear()}
          >
            {busy === "clear-key" ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
            <span>清除</span>
          </button>
          <div className="dialog-footer-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isBusy || !apiStatus.configured}
              title={apiStatus.configured ? "测试已保存的密钥" : "请先保存 API Key"}
              onClick={() => void onTest()}
            >
              {busy === "test" ? <LoaderCircle className="spin" size={15} /> : <PlugZap size={15} />}
              <span>测试</span>
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={isBusy || !apiKey.trim()}
              onClick={() => void handleSave()}
            >
              {busy === "save-key" ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}
              <span>保存</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
