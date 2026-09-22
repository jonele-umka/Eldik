import { useState } from "react";
import { fmtM, PAGE } from "../utils/index.js";

export function NavItem({ icon, label, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 12px",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13.5,
        marginBottom: 2,
        color: active
          ? "var(--accent)"
          : hover
            ? "var(--text)"
            : "var(--muted)",
        background: active
          ? "rgba(88,166,255,.1)"
          : hover
            ? "var(--s2)"
            : "transparent",
        transition: "all .15s",
      }}
    >
      <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>
        {icon}
      </span>
      {label}
    </div>
  );
}

export function KPI({ label, value, color = "var(--accent)", compact }) {
  return (
    <div
      style={{
        background: "var(--s1)",
        border: "1px solid var(--b1)",
        borderRadius: 10,
        padding: compact ? "12px 12px" : "16px 18px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          background: color,
          borderRadius: "3px 0 0 3px",
        }}
      />
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
      <div
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: compact ? 15 : 20,
          fontWeight: 500,
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function Badge({ status }) {
  const map = {
    Новый: ["rgba(88,166,255,.15)", "var(--accent)"],
    Выполнен: ["rgba(63,185,80,.15)", "var(--green)"],
    Доставлен: ["rgba(63,185,80,.15)", "var(--green)"],
    Отменён: ["rgba(248,81,73,.15)", "var(--red)"],
    Отменен: ["rgba(248,81,73,.15)", "var(--red)"],
  };
  const [bg, clr] = map[status] || ["rgba(139,148,158,.15)", "var(--muted)"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 500,
        background: bg,
        color: clr,
        whiteSpace: "nowrap",
      }}
    >
      {status || "—"}
    </span>
  );
}

export function MoneyCell({ n, pos }) {
  if (n === null || n === undefined) return <span>—</span>;
  const clr =
    pos === true
      ? "var(--green)"
      : pos === false
        ? "var(--red)"
        : "var(--text)";
  return (
    <span
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 12.5,
        color: clr,
      }}
    >
      {fmtM(n)}
    </span>
  );
}

export function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "var(--s2)",
        border: "1px solid var(--b1)",
        borderRadius: 8,
        padding: "7px 12px",
        color: "var(--text)",
        fontSize: 13,
        outline: "none",
        fontFamily: "Inter, sans-serif",
        cursor: "pointer",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Pagination({ total, page, onPage }) {
  const pages = Math.ceil(total / PAGE);
  if (pages <= 1) return null;
  const range = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++)
    range.push(p);
  const btn = (active, disabled, onClick, label) => (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active ? "var(--accent)" : "var(--s2)",
        border: "1px solid " + (active ? "var(--accent)" : "var(--b1)"),
        borderRadius: 6,
        padding: "4px 10px",
        color: active ? "#fff" : "var(--text)",
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "Inter, sans-serif",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 5,
        padding: "12px 18px",
        borderTop: "1px solid var(--b1)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 4 }}>
        Стр. {page} из {pages}
      </span>
      {btn(false, page === 1, () => onPage(page - 1), "‹")}
      {range.map((p) => btn(p === page, false, () => onPage(p), p))}
      {btn(false, page === pages, () => onPage(page + 1), "›")}
    </div>
  );
}

export function TableWrap({ title, count, children, pagination }) {
  return (
    <div
      style={{
        background: "var(--s1)",
        border: "1px solid var(--b1)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          padding: "13px 18px",
          borderBottom: "1px solid var(--b1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{count}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          {children}
        </table>
      </div>
      {pagination}
    </div>
  );
}

// ИСПРАВЛЕНО: теперь принимает onClick и вешает его на <tr>,
// плюс курсор "pointer", если строка кликабельна.
export function TR({ children, bgColor, onClick }) {
  const [hover, setHover] = useState(false);
  const base = bgColor || "transparent";
  return (
    <tr
      onClick={onClick}
      style={{
        background: hover
          ? bgColor
            ? bgColor.replace("0.10", "0.18").replace("0.12", "0.20")
            : "var(--s2)"
          : base,
        transition: "background .1s",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </tr>
  );
}

export const TD = ({ children, style = {} }) => (
  <td
    style={{
      padding: "9px 13px",
      whiteSpace: "nowrap",
      verticalAlign: "middle",
      ...style,
    }}
  >
    {children}
  </td>
);

export function SortTh({ col, sortState, onSort, children }) {
  const active = sortState?.col === col;
  const arrow = active ? (sortState.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        padding: "9px 13px",
        textAlign: "left",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: ".07em",
        color: active ? "var(--accent)" : "var(--muted)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {children}
      {active && <span style={{ color: "var(--accent)" }}>{arrow}</span>}
    </th>
  );
}

export const TH = ({ children }) => (
  <th
    style={{
      padding: "9px 13px",
      textAlign: "left",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: ".07em",
      color: "var(--muted)",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </th>
);

// Ссылки вида .../file/d/FILE_ID/view?usp=sharing или .../uc?id=FILE_ID
// открываются в браузере, но не работают в теге <img>. Конвертируем их в
// прямой формат картинки, чтобы изображение товара показывалось везде,
// где есть список товаров (заказы, производство, развозка, каталог).
export function toDriveDirectUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  let m = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) m = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return `https://lh3.googleusercontent.com/d/${m[1]}=w300`;
  return trimmed;
}

// Миниатюра товара. Если картинки нет (или не загрузилась) — плейсхолдер.
export function ProductThumb({ src, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const url = toDriveDirectUrl(src);

  if (!url || broken) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: "var(--s2)",
          border: "1px solid var(--b1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.5,
          flexShrink: 0,
        }}
      >
        📦
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: "cover",
        border: "1px solid var(--b1)",
        flexShrink: 0,
        background: "var(--s2)",
      }}
    />
  );
}

export function Spinner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
        gap: 12,
        color: "var(--muted)",
        fontSize: 14,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          border: "2px solid var(--b1)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "spin .7s linear infinite",
        }}
      />
      Загрузка данных...
    </div>
  );
}
