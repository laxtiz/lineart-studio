import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useEffect } from "react";
import type { ToastMessage } from "../types";

interface ToastRegionProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  useEffect(() => {
    if (!toasts.length) {
      return;
    }
    const timers = toasts.map((toast) =>
      window.setTimeout(() => onDismiss(toast.id), toast.kind === "error" ? 7000 : 4200),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [onDismiss, toasts]);

  return (
    <div className="toast-region" aria-label="通知">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <span className="toast-icon" aria-hidden="true">
            {toast.kind === "success" ? (
              <CircleCheck size={17} />
            ) : toast.kind === "error" ? (
              <CircleAlert size={17} />
            ) : (
              <Info size={17} />
            )}
          </span>
          <span className="toast-copy">{toast.text}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="关闭通知"
            title="关闭通知"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
