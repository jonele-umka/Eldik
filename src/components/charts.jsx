// Лёгкие SVG-графики без внешних библиотек. Цвета берутся из CSS-переменных
// темы (светлая/тёмная), поэтому отдельной "тёмной версии" не нужно.
// Каждый график: подсказка при наведении, подписи осей, сетка приглушена.
import { useEffect, useRef, useState } from "react";
import { fmt } from "../utils/index.js";

const MONO = "JetBrains Mono,monospace";

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) =>
      setW(Math.max(220, e.contentRect.width)),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// "красивый" максимум оси: 1, 2, 5 × 10^n
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const short = (n) =>
  n >= 1e6
    ? `${+(n / 1e6).toFixed(1)}М`
    : n >= 1e3
      ? `${+(n / 1e3).toFixed(1)}к`
      : String(n);

function Tip({ x, y, w, children }) {
  const flip = x > w * 0.6;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(${flip ? "calc(-100% - 10px)" : "10px"}, -50%)`,
        background: "var(--s1)",
        border: "1px solid var(--b1)",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--text)",
        boxShadow: "0 4px 14px rgba(0,0,0,.18)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 5,
      }}
    >
      {children}
    </div>
  );
}

export function Empty({ text = "Пока нет данных" }) {
  return (
    <div
      style={{
        padding: "40px 0",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

const axisText = { fontSize: 11, fill: "var(--muted)", fontFamily: MONO };

/* ── Столбцы по времени (одна серия) ─────────────────────────────────────── */
export function BarChart({
  data,
  color = "var(--accent)",
  height = 220,
  unit = "с",
}) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState(null);
  const m = { t: 10, r: 8, b: 26, l: 44 };
  const iw = w - m.l - m.r;
  const ih = height - m.t - m.b;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const step = iw / data.length;
  const bw = Math.min(28, step * 0.62);
  const y = (v) => m.t + ih - (v / max) * ih;
  const every = Math.ceil(data.length / Math.max(2, Math.floor(iw / 44)));

  return (
    <div
      ref={ref}
      style={{ position: "relative", minWidth: 0 }}
      onMouseLeave={() => setHi(null)}
    >
      <svg
        width={w}
        height={height}
        style={{ display: "block", maxWidth: "100%" }}
        role="img"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={m.l}
              x2={w - m.r}
              y1={y(max * t)}
              y2={y(max * t)}
              stroke="var(--b1)"
              strokeDasharray={t ? "3 4" : "0"}
            />
            <text x={m.l - 6} y={y(max * t) + 4} textAnchor="end" {...axisText}>
              {short(max * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.l + step * i + step / 2;
          const h = Math.max(d.value ? 2 : 0, (d.value / max) * ih);
          return (
            <g
              key={i}
              onMouseEnter={() => setHi(i)}
              onTouchStart={() => setHi(i)}
            >
              <rect
                x={cx - step / 2}
                y={m.t}
                width={step}
                height={ih + 4}
                fill="transparent"
              />
              <rect
                x={cx - bw / 2}
                y={m.t + ih - h}
                width={bw}
                height={h}
                rx={4}
                fill={color}
                opacity={hi === null || hi === i ? 1 : 0.45}
              />
              {i % every === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" {...axisText}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hi !== null && (
        <Tip x={m.l + step * hi + step / 2} y={y(data[hi].value)} w={w}>
          <div style={{ color: "var(--muted)" }}>
            {data[hi].full || data[hi].label}
          </div>
          <b style={{ fontFamily: MONO }}>
            {fmt(data[hi].value)} {unit}
          </b>
        </Tip>
      )}
    </div>
  );
}

/* ── Линии (несколько серий, общая ось) ──────────────────────────────────── */
export function LineChart({ labels, series, height = 220, unit = "с" }) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState(null);
  const m = { t: 10, r: 12, b: 26, l: 44 };
  const iw = w - m.l - m.r;
  const ih = height - m.t - m.b;
  const n = labels.length;
  const max = niceMax(
    Math.max(...series.flatMap((s) => s.values).filter((v) => v != null), 0),
  );
  const x = (i) => m.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v) => m.t + ih - (v / max) * ih;
  const every = Math.ceil(n / Math.max(2, Math.floor(iw / 44)));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setHi(
      Math.min(n - 1, Math.max(0, Math.round(((px - m.l) / iw) * (n - 1)))),
    );
  };

  return (
    <div
      ref={ref}
      style={{ position: "relative", minWidth: 0 }}
      onMouseLeave={() => setHi(null)}
    >
      <svg
        width={w}
        height={height}
        style={{ display: "block", maxWidth: "100%" }}
        role="img"
        onMouseMove={onMove}
        onTouchMove={onMove}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={m.l}
              x2={w - m.r}
              y1={y(max * t)}
              y2={y(max * t)}
              stroke="var(--b1)"
              strokeDasharray={t ? "3 4" : "0"}
            />
            <text x={m.l - 6} y={y(max * t) + 4} textAnchor="end" {...axisText}>
              {short(max * t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              {...axisText}
            >
              {l}
            </text>
          ) : null,
        )}
        {hi !== null && (
          <line
            x1={x(hi)}
            x2={x(hi)}
            y1={m.t}
            y2={m.t + ih}
            stroke="var(--muted)"
            strokeWidth={1}
            opacity={0.5}
          />
        )}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash || "0"}
              points={s.values
                .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
                .filter(Boolean)
                .join(" ")}
            />
            {hi !== null && s.values[hi] != null && (
              <circle
                cx={x(hi)}
                cy={y(s.values[hi])}
                r={4.5}
                fill={s.color}
                stroke="var(--s1)"
                strokeWidth={2}
              />
            )}
          </g>
        ))}
      </svg>
      {hi !== null && (
        <Tip x={x(hi)} y={m.t + ih / 3} w={w}>
          <div style={{ color: "var(--muted)" }}>{labels[hi]}</div>
          {series.map((s) => (
            <div key={s.name}>
              <span
                style={{
                  display: "inline-block",
                  width: 14,
                  borderTop: `2px ${s.dash ? "dashed" : "solid"} ${s.color}`,
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              {s.name}:{" "}
              <b style={{ fontFamily: MONO }}>
                {s.values[hi] == null ? "—" : `${fmt(s.values[hi])} ${unit}`}
              </b>
            </div>
          ))}
        </Tip>
      )}
      <Legend
        items={series.map((s) => ({
          name: s.name,
          color: s.color,
          dash: s.dash,
        }))}
      />
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        justifyContent: "center",
        fontSize: 12,
        color: "var(--muted)",
        marginTop: 6,
      }}
    >
      {items.map((it) => (
        <span key={it.name}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              borderTop: `3px ${it.dash ? "dashed" : "solid"} ${it.color}`,
              marginRight: 6,
              verticalAlign: "middle",
            }}
          />
          {it.name}
        </span>
      ))}
    </div>
  );
}

/* ── Горизонтальные столбцы (рейтинг по категориям) ──────────────────────── */
export function HBarChart({
  data,
  color = "var(--accent)",
  unit = "с",
  rowH = 30,
}) {
  const [hi, setHi] = useState(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div onMouseLeave={() => setHi(null)}>
      {data.map((d, i) => (
        <div
          key={d.label}
          onMouseEnter={() => setHi(i)}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(70px, 32%) 1fr auto",
            alignItems: "center",
            gap: 10,
            height: rowH,
            opacity: hi === null || hi === i ? 1 : 0.5,
            transition: "opacity .12s",
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={d.label}
          >
            {d.label}
          </span>
          <div style={{ background: "var(--s2)", borderRadius: 4, height: 12 }}>
            <div
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                height: "100%",
                background: d.color || color,
                borderRadius: 4,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12,
              minWidth: 64,
              textAlign: "right",
            }}
          >
            {fmt(d.value)} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
