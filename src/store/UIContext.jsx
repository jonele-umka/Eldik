// Тосты и модалка подтверждения — вместо alert/confirm браузера.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Modal, Btn } from "../components/Form.jsx";

const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const toast = useCallback((text, kind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, text, kind }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3800);
  }, []);

  const confirm = useCallback((opts) => setConfirmState(opts), []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  const colorOf = (k) =>
    k === "err" ? "var(--red)" : k === "ok" ? "var(--green)" : "var(--accent)";

  return (
    <UIContext.Provider value={value}>
      {children}

      <div
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 78,
          zIndex: 400,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "min(420px, calc(100vw - 24px))",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "var(--s1)",
              border: `1px solid ${colorOf(t.kind)}`,
              borderLeft: `4px solid ${colorOf(t.kind)}`,
              borderRadius: 10,
              padding: "11px 14px",
              fontSize: 13.5,
              color: "var(--text)",
              boxShadow: "0 12px 32px rgba(0,0,0,.45)",
            }}
          >
            {t.kind === "err" ? "⚠️ " : t.kind === "ok" ? "✅ " : "ℹ️ "}
            {t.text}
          </div>
        ))}
      </div>

      <Modal
        open={!!confirmState}
        title={confirmState?.title || "Подтвердите действие"}
        onClose={() => setConfirmState(null)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmState(null)}>
              Отмена
            </Btn>
            <Btn
              variant={confirmState?.danger ? "danger" : "primary"}
              onClick={() => {
                const fn = confirmState?.onConfirm;
                setConfirmState(null);
                if (fn) fn();
              }}
            >
              {confirmState?.confirmText || "Удалить"}
            </Btn>
          </>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
          {confirmState?.text}
        </div>
      </Modal>
    </UIContext.Provider>
  );
}
