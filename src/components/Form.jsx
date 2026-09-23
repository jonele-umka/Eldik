// Базовые элементы форм в тёмной теме проекта: модалка, поля, кнопки.
import { useEffect, useRef } from "react";

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  loading,
  size = "md",
  style = {},
  title,
  type = "button",
}) {
  const palette = {
    primary: ["var(--accent)", "#fff", "var(--accent)"],
    green: ["var(--green)", "#0d1117", "var(--green)"],
    danger: ["rgba(248,81,73,.15)", "var(--red)", "rgba(248,81,73,.5)"],
    warn: ["rgba(210,153,34,.15)", "var(--yellow)", "rgba(210,153,34,.5)"],
    purple: ["rgba(163,113,247,.15)", "#a371f7", "rgba(163,113,247,.5)"],
    ghost: ["var(--s2)", "var(--text)", "var(--b1)"],
  };
  const [bg, color, border] = palette[variant] || palette.primary;
  const pad = size === "sm" ? "5px 10px" : "8px 14px";

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: bg,
        color,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: pad,
        fontSize: size === "sm" ? 12 : 13,
        fontWeight: 600,
        cursor: disabled || loading ? "default" : "pointer",
        opacity: disabled || loading ? 0.55 : 1,
        fontFamily: "Inter, sans-serif",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        transition: "opacity .15s",
        ...style,
      }}
    >
      {loading && (
        <span
          style={{
            width: 12,
            height: 12,
            border: "2px solid rgba(255,255,255,.35)",
            borderTopColor: "currentColor",
            borderRadius: "50%",
            animation: "spin .7s linear infinite",
            display: "inline-block",
          }}
        />
      )}
      {children}
    </button>
  );
}

export function IconBtn({ children, onClick, title, disabled, color }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{
        background: "var(--s2)",
        border: "1px solid var(--b1)",
        borderRadius: 7,
        width: 30,
        height: 28,
        color: color || "var(--text)",
        fontSize: 13,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

const inputStyle = {
  background: "var(--s2)",
  border: "1px solid var(--b1)",
  borderRadius: 8,
  padding: "9px 11px",
  color: "var(--text)",
  fontSize: 13.5,
  outline: "none",
  width: "100%",
  fontFamily: "Inter, sans-serif",
};

export function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            marginBottom: 5,
          }}
        >
          {label}
        </div>
      )}
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        ...inputStyle,
        minHeight: 90,
        resize: "vertical",
        ...(props.style || {}),
      }}
    />
  );
}

// value приходит/уходит в формате дд.мм.гггг — как в таблицах
export function DateField({ value, onChange, disabled }) {
  const toISO = (s) => {
    const p = String(s || "")
      .split(" ")[0]
      .split(".");
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : "";
  };
  const fromISO = (s) => {
    const p = String(s || "").split("-");
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "";
  };
  return (
    <input
      type="date"
      disabled={disabled}
      value={toISO(value)}
      onChange={(e) => onChange(fromISO(e.target.value))}
      style={inputStyle}
    />
  );
}

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, cursor: "pointer" }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Общий стек открытых модалок (на весь модуль, не на компонент).
//
// Почему это нужно: на экране может быть открыто НЕСКОЛЬКО модалок сразу —
// например, диалог подтверждения "Удалить?" поверх уже открытой карточки
// заказа. Раньше каждая модалка сама слушала window "popstate" и сама
// вызывала history.back() при закрытии. Из-за этого закрытие ВЕРХНЕЙ
// модалки (например, подтверждения удаления) вызывало popstate-событие,
// которое ловили ВСЕ остальные открытые модалки одновременно — и нижняя
// (например, карточка заказа) закрывалась сама собой вместе с диалогом.
// Именно поэтому баг проявлялся "где-то есть, где-то нет": он срабатывал
// только там, где одна модалка открывается поверх другой (что как раз
// часто происходит в карточке заказа — удаление позиции/оплаты и т.д.).
//
// Теперь: один-единственный глобальный слушатель popstate на весь сайт;
// он закрывает только САМУЮ ВЕРХНЮЮ модалку (последнюю открытую), как и
// должно быть при нажатии "назад". Если модалка закрывается сама (кнопкой
// в интерфейсе), она обязана снять СВОЮ запись из истории — на этот момент
// глобальный слушатель предупреждён (suppressPopCount) не трогать стек,
// потому что запись уже убрана явно, программно, а не жестом "назад".
let modalStack = [];
let suppressPopCount = 0;
let bodyLockCount = 0;
let globalPopstateBound = false;

function ensureGlobalPopstateListener() {
  if (globalPopstateBound) return;
  globalPopstateBound = true;
  window.addEventListener("popstate", () => {
    if (suppressPopCount > 0) {
      suppressPopCount -= 1;
      return;
    }
    const top = modalStack.pop();
    if (top) {
      top.closedByPop.value = true;
      top.onCloseRef.current?.();
    }
  });
}

// Модалка сохраняет введённые данные при случайном закрытии:
// - на мобильных back-жест/кнопка "назад" (в т.ч. при закрытии клавиатуры)
//   гасится через history — закрывается только верхняя модалка, а не
//   улетает со страницы и не теряет состояние формы (SPA не перезагружается);
// - высота считается через dvh (динамическая высота вьюпорта), поэтому
//   когда открыта клавиатура, кнопки в футере (Отмена/Сохранить) остаются
//   на экране, а не уезжают за пределы видимой области.
export function Modal({
  open,
  title,
  subtitle,
  children,
  footer,
  onClose,
  width = 520,
}) {
  // onClose обычно приходит как новая инлайн-функция при каждом рендере
  // родителя (например, при каждом нажатии клавиши в поле формы). Держим
  // последнюю версию в ref и НЕ кладём onClose в зависимости эффекта —
  // иначе история/попстейт переинициализировались бы на каждый ре-рендер
  // (в т.ч. при вводе текста) и модалка закрывалась бы сама собой.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const entry = { closedByPop: { value: false }, onCloseRef };

    // Escape закрывает только САМУЮ ВЕРХНЮЮ модалку, а не все разом.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (modalStack[modalStack.length - 1] !== entry) return;
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey);

    bodyLockCount += 1;
    document.body.style.overflow = "hidden";

    ensureGlobalPopstateListener();
    modalStack.push(entry);
    try {
      window.history.pushState({ modal: true }, "");
    } catch (_) {}

    return () => {
      document.removeEventListener("keydown", onKey);

      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount === 0) document.body.style.overflow = "";

      const idx = modalStack.indexOf(entry);
      if (idx !== -1) modalStack.splice(idx, 1);

      if (!entry.closedByPop.value) {
        try {
          if (window.history.state && window.history.state.modal) {
            suppressPopCount += 1;
            window.history.back();
          }
        } catch (_) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(1,4,9,.72)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="modal-panel"
        style={{
          background: "var(--s1)",
          border: "1px solid var(--b1)",
          borderRadius: 14,
          width: "100%",
          maxWidth: width,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,.6)",
        }}
      >
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--b1)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          {subtitle && (
            <div
              style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}
            >
              {subtitle}
            </div>
          )}
        </div>
        <div
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "12px 20px 16px",
              borderTop: "1px solid var(--b1)",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Toolbar({ children, style = {} }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export const todayString = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

export const tomorrowString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};
