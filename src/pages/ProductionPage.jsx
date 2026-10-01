import { Fragment, useEffect, useMemo, useState } from "react";
import { buildOrderGroups, fmt, filterSearch } from "../utils/index.js";
import {
  KPI,
  Select,
  TR,
  TD,
  TH,
  ProductThumb,
  toDriveDirectUrl,
} from "../components/UI.jsx";
import { Btn } from "../components/Form.jsx";
import { S } from "../utils/styles.js";
import { useData } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { updateStatus, setStockOut, setNotFit } from "../services/api.js";

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

function parseDateStr(date) {
  const p = String(date || "").split(".");
  if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}`);
  return new Date(0);
}

function sortByDateDesc(a, b) {
  return parseDateStr(b.date) - parseDateStr(a.date);
}

// Цветовая метка даты доставки:
// прошла — зелёный (выполнено), сегодня — красный (срочно), впереди — синий.
function getDateStatus(dateStr) {
  const d = parseDateStr(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() < today.getTime()) {
    return {
      label: "Выполнено",
      color: "var(--green, #3fb950)",
      bg: "rgba(63,185,80,.12)",
    };
  }
  if (d.getTime() === today.getTime()) {
    return {
      label: "Сегодня",
      color: "var(--red, #f85149)",
      bg: "rgba(248,81,73,.12)",
    };
  }
  return {
    label: "Ожидается",
    color: "var(--accent)",
    bg: "rgba(88,166,255,.12)",
  };
}

function MarketChips({ markets }) {
  const entries = Object.entries(markets || {});
  if (entries.length === 0) {
    return <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {entries.map(([market, qty]) => (
        <span
          key={market}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 20,
            fontSize: 11,
            background: "rgba(88,166,255,.12)",
            color: "var(--accent)",
            whiteSpace: "nowrap",
          }}
        >
          {market}: <b>{qty}</b>
        </span>
      ))}
    </div>
  );
}

// Значок "не хватает N шт" — используется и в производстве, и в развозке,
// чтобы было видно везде, где этот товар заказан на эту дату.
function StockOutBadge({ qty, small }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: small ? "2px 7px" : "3px 9px",
        borderRadius: 20,
        fontSize: small ? 10.5 : 11.5,
        fontWeight: 700,
        background: "rgba(248,81,73,.14)",
        color: "var(--red)",
        whiteSpace: "nowrap",
      }}
    >
      🚫 Не хватает: {fmt(qty)}
    </span>
  );
}

// Тот же значок, но для "не поместилось" (товар был в наличии, но не
// увезли — не хватило места в развозке) — отдельная от "не хватает"
// отметка, свой цвет, чтобы не путать причину.
function NotFitBadge({ qty, small }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: small ? "2px 7px" : "3px 9px",
        borderRadius: 20,
        fontSize: small ? 10.5 : 11.5,
        fontWeight: 700,
        background: "rgba(163,113,247,.14)",
        color: "var(--purple)",
        whiteSpace: "nowrap",
      }}
    >
      📦 Не поместилось: {fmt(qty)}
    </span>
  );
}

// Общее количество за вычетом недостачи и "не поместилось" — чтобы сразу
// было видно, сколько реально есть/увезли, без путаницы с изначальным
// "всего заказано".
function TotalWithMissing({ total, missingQty, notFitQty = 0 }) {
  const deducted = (missingQty || 0) + (notFitQty || 0);
  if (!deducted) {
    return (
      <span
        style={{
          fontFamily: "JetBrains Mono,monospace",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--accent)",
        }}
      >
        {fmt(total)}
      </span>
    );
  }
  const available = Math.max(0, Number(total || 0) - deducted);
  const color = missingQty > 0 ? "var(--red)" : "var(--purple)";
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        lineHeight: 1.35,
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontFamily: "JetBrains Mono,monospace",
            fontSize: 14,
            fontWeight: 700,
            color,
          }}
        >
          {fmt(available)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textDecoration: "line-through",
          }}
        >
          {fmt(total)}
        </span>
      </span>
      {missingQty > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--red)" }}>
          −{fmt(missingQty)} нет в наличии
        </span>
      )}
      {notFitQty > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--purple)" }}>
          −{fmt(notFitQty)} не поместилось
        </span>
      )}
    </span>
  );
}

// Компактный ввод недостачи прямо в строке заказа (в Развозке) — без
// лишних кликов. Привязан к КОНКРЕТНОМУ заказу (orderId), а не к дате —
// иначе отметка у одного клиента задевала бы заказы других клиентов с тем
// же товаром на ту же дату доставки.
function StockOutEditor({ orderId, product, missingQty, busy, onSave }) {
  const [val, setVal] = useState(String(missingQty || ""));
  useEffect(() => setVal(String(missingQty || "")), [missingQty]);

  const save = () => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    onSave(orderId, product, n);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="0"
        style={{
          width: 56,
          textAlign: "center",
          background: "var(--s1)",
          border: "1px solid var(--b1)",
          borderRadius: 7,
          color: "var(--text)",
          padding: "5px 4px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 13,
        }}
      />
      <Btn
        size="sm"
        variant={missingQty > 0 ? "danger" : "ghost"}
        loading={busy}
        onClick={save}
      >
        {missingQty > 0 ? "🚫 Обновить" : "🚫 Не хватает"}
      </Btn>
    </div>
  );
}

// То же самое, но для отметки "не поместилось" — отдельный ключ в сторе
// ("notFits"), независимый от "не хватает", чтобы не портить его логику.
// Тоже привязан к конкретному заказу (orderId).
function NotFitEditor({ orderId, product, notFitQty, busy, onSave }) {
  const [val, setVal] = useState(String(notFitQty || ""));
  useEffect(() => setVal(String(notFitQty || "")), [notFitQty]);

  const save = () => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    onSave(orderId, product, n);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="0"
        style={{
          width: 56,
          textAlign: "center",
          background: "var(--s1)",
          border: "1px solid var(--b1)",
          borderRadius: 7,
          color: "var(--text)",
          padding: "5px 4px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 13,
        }}
      />
      <Btn
        size="sm"
        variant={notFitQty > 0 ? "purple" : "ghost"}
        loading={busy}
        onClick={save}
      >
        {notFitQty > 0 ? "📦 Обновить" : "📦 Не поместилось"}
      </Btn>
    </div>
  );
}

// Кто и сколько заказал этот товар на эту дату доставки —
// раскрывающаяся расшифровка строки производства. Группируем ПО ЗАКАЗУ
// (orderId), а не просто по имени клиента — так отметка "не хватает"/"не
// поместилось" однозначно ложится на конкретный заказ, даже если у одного
// клиента в этот день вдруг два заказа с этим товаром. Отмечать можно
// прямо здесь, по каждому заказу (клиенту) — так же, как и в 🚚 Развозке.
function ClientBreakdown({
  rows,
  product,
  color = "#58a6ff",
  stockOutMap,
  notFitMap,
  onSetStockOut,
  stockOutBusy,
  onSetNotFit,
  notFitBusy,
}) {
  const byOrder = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const oid = r.orderId;
      if (!oid) return;
      if (!m[oid])
        m[oid] = {
          orderId: oid,
          client: r.client || "—",
          market: r.market || "",
          qty: 0,
        };
      m[oid].qty += Number(r.paidQuantity ?? r.quantity ?? 0);
    });
    return Object.values(m).sort((a, b) => b.qty - a.qty);
  }, [rows]);

  if (byOrder.length === 0) {
    return (
      <div
        style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12.5 }}
      >
        Нет заказов с этим товаром на эту дату.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "6px 14px 12px",
        background: `${color}0d`,
        borderTop: `1px dashed ${color}59`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 0 8px",
          marginBottom: 2,
          borderBottom: `1px solid ${color}40`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color }}>
          🧾 {product}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          — по каждому заказу (клиенту)
        </span>
      </div>
      {byOrder.map((o) => {
        const markKey = `${o.orderId}::${product}`;
        const missingQty = Number(stockOutMap?.get(markKey) || 0);
        const notFitQty = Number(notFitMap?.get(markKey) || 0);
        return (
          <div
            key={o.orderId}
            style={{
              padding: "8px 0",
              borderBottom: "1px solid var(--b1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flex: 1,
                  minWidth: 140,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  👤 {o.client}
                </span>
                {o.market && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--accent)",
                      background: "rgba(88,166,255,.12)",
                      border: "1px solid rgba(88,166,255,.3)",
                      borderRadius: 6,
                      padding: "2px 7px",
                    }}
                  >
                    🏪 {o.market}
                  </span>
                )}
              </span>
              {missingQty > 0 && <StockOutBadge qty={missingQty} small />}
              {notFitQty > 0 && <NotFitBadge qty={notFitQty} small />}
              <span
                style={{
                  fontFamily: "JetBrains Mono,monospace",
                  fontWeight: 700,
                  fontSize: 13.5,
                  color: "var(--accent)",
                }}
              >
                {fmt(o.qty)}
              </span>
            </div>
            <div
              style={{
                marginTop: 6,
                padding: "7px 9px",
                background: "rgba(63,185,80,.06)",
                border: "1px dashed rgba(63,185,80,.35)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--green)",
                  marginBottom: 6,
                }}
              >
                ✏️ Отметить по заказу этого клиента:
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <StockOutEditor
                  orderId={o.orderId}
                  product={product}
                  missingQty={missingQty}
                  busy={stockOutBusy?.has(markKey)}
                  onSave={onSetStockOut}
                />
                <NotFitEditor
                  orderId={o.orderId}
                  product={product}
                  notFitQty={notFitQty}
                  busy={notFitBusy?.has(markKey)}
                  onSave={onSetNotFit}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductionView({
  data,
  orders,
  stockOutMap,
  notFitMap,
  search,
  prices,
  isMobile,
  isTablet,
  onSetStockOut,
  stockOutBusy,
  onSetNotFit,
  notFitBusy,
}) {
  const [dateFilter, setDateFilter] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const raw = data || {};
  const compact = isMobile || isTablet;

  const priceMap = useMemo(() => {
    const m = {};
    (Array.isArray(prices) ? prices : []).forEach((p) => {
      if (p.product) m[p.product] = toDriveDirectUrl(p.image || "");
    });
    return m;
  }, [prices]);

  const allItems = useMemo(() => {
    const result = [];
    Object.entries(raw).forEach(([date, products]) => {
      Object.entries(products).forEach(([product, info]) => {
        result.push({
          date,
          product,
          total: info.total,
          comment: info.comment || "",
          markets: info.markets || {},
        });
      });
    });
    return result.sort(sortByDateDesc);
  }, [raw]);

  const dates = [...new Set(allItems.map((x) => x.date))].sort().reverse();

  const filtered = useMemo(() => {
    let r = filterSearch(allItems, ["product", "comment"], search);
    if (dateFilter) r = r.filter((x) => x.date === dateFilter);
    return r;
  }, [allItems, search, dateFilter]);

  const byDate = useMemo(() => {
    const groups = {};
    filtered.forEach((r) => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return groups;
  }, [filtered]);

  const orderedDates = Object.keys(byDate).sort(
    (a, b) => parseDateStr(b) - parseDateStr(a),
  );

  // Заказы конкретного товара на конкретную дату — для раскрывающейся расшифровки.
  const ordersByDateProduct = useMemo(() => {
    const m = {};
    (orders || []).forEach((o) => {
      if (!o.deliveryDate || !o.product) return;
      const key = `${o.deliveryDate}::${o.product}`;
      if (!m[key]) m[key] = [];
      m[key].push(o);
    });
    return m;
  }, [orders]);

  // Отметки "не хватает"/"не поместилось" привязаны к КОНКРЕТНОМУ заказу
  // (orderId), а не к дате+товару — отмечать можно и здесь (в разбивке по
  // клиентам/заказам, см. ClientBreakdown), и в 🚚 Развозке. В строке
  // товара (эта функция) просто СУММИРУЕМ все отметки по дате+товару, для
  // общей картины по производству.
  const missingQtyAgg = (date, product) => {
    const key = `${date}::${product}`;
    const seen = new Set();
    let sum = 0;
    (ordersByDateProduct[key] || []).forEach((o) => {
      const oid = o.orderId;
      if (!oid || seen.has(oid)) return;
      seen.add(oid);
      sum += Number(stockOutMap.get(`${oid}::${product}`) || 0);
    });
    return sum;
  };
  const notFitQtyAgg = (date, product) => {
    const key = `${date}::${product}`;
    const seen = new Set();
    let sum = 0;
    (ordersByDateProduct[key] || []).forEach((o) => {
      const oid = o.orderId;
      if (!oid || seen.has(oid)) return;
      seen.add(oid);
      sum += Number(notFitMap?.get(`${oid}::${product}`) || 0);
    });
    return sum;
  };

  const toggleExpand = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Своя цветовая метка на каждый товар (по кругу) — чтобы соседние
  // строки не сливались, а при нескольких раскрытых списках сразу было
  // видно, какая расшифровка к какому товару относится (цвет полоски
  // слева и у строки, и у её раскрытого списка — одинаковый).
  // Порядок подобран так, чтобы соседние по очереди цвета были подальше
  // друг от друга на цветовом круге (а не просто подряд, как жёлтый и
  // красный) — иначе глазу тяжело отличить два товара рядом.
  const rowColors = [
    "#f85149", // красный
    "#58a6ff", // синий
    "#d29922", // жёлтый
    "#a371f7", // фиолетовый
    "#3fb950", // зелёный
    "#db61a2", // розовый
    "#39c5cf", // бирюзовый
    "#8b949e", // серый
  ];
  const colorForRow = (i) => rowColors[i % rowColors.length];

  return (
    <>
      <div style={S.filters}>
        <Select
          value={dateFilter}
          onChange={setDateFilter}
          options={dates}
          placeholder="Все даты"
        />
      </div>

      {orderedDates.length === 0 ? (
        <div
          style={{
            ...S.card,
            padding: 40,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          Нет данных
        </div>
      ) : (
        orderedDates.map((date) => {
          const rows = byDate[date];
          const status = getDateStatus(date);
          const dayOrdered = rows.reduce((s, r) => s + Number(r.total || 0), 0);
          const dayMissing = rows.reduce(
            (s, r) => s + missingQtyAgg(r.date, r.product),
            0,
          );
          const dayNotFit = rows.reduce(
            (s, r) => s + notFitQtyAgg(r.date, r.product),
            0,
          );
          const dayTotal = Math.max(0, dayOrdered - dayMissing - dayNotFit);
          return (
            <div
              key={date}
              style={{
                ...S.card,
                marginBottom: 16,
                borderLeft: `3px solid ${status.color}`,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: isMobile ? "10px 12px" : "12px 18px",
                  borderBottom: "1px solid var(--b1)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700 }}>
                  📅 {date}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 20,
                    background: status.bg,
                    color: status.color,
                  }}
                >
                  {status.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {rows.length} товар(ов) ·{" "}
                  {dayMissing + dayNotFit > 0 ? (
                    <>
                      <b
                        style={{
                          color:
                            dayMissing > 0 ? "var(--red)" : "var(--purple)",
                        }}
                      >
                        {fmt(dayTotal)}
                      </b>{" "}
                      <span style={{ textDecoration: "line-through" }}>
                        {fmt(dayOrdered)}
                      </span>{" "}
                      шт.
                    </>
                  ) : (
                    <>{fmt(dayTotal)} шт.</>
                  )}
                </span>
              </div>

              {isMobile ? (
                // ── Мобильный вид: карточки вместо таблицы ──
                <div>
                  {rows.map((r, i) => {
                    const key = `${r.date}::${r.product}`;
                    const isOpen = expanded.has(key);
                    const missingQty = missingQtyAgg(r.date, r.product);
                    const notFitQty = notFitQtyAgg(r.date, r.product);
                    const color = colorForRow(i);
                    return (
                      <div
                        key={key}
                        style={{
                          borderBottom:
                            i < rows.length - 1
                              ? "1px solid var(--b1)"
                              : "none",
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        <div
                          onClick={() => toggleExpand(key)}
                          style={{
                            display: "flex",
                            gap: 10,
                            padding: "12px 14px",
                            cursor: "pointer",
                            background: isOpen ? `${color}14` : "transparent",
                          }}
                        >
                          <ProductThumb src={priceMap[r.product]} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: 8,
                              }}
                            >
                              <b style={{ fontSize: 13 }}>
                                <span style={{ color }}>
                                  {isOpen ? "🧾▾" : "🧾▸"}
                                </span>{" "}
                                {r.product}
                              </b>
                              <TotalWithMissing
                                total={r.total}
                                missingQty={missingQty}
                                notFitQty={notFitQty}
                              />
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <MarketChips markets={r.markets} />
                            </div>
                            {r.comment && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--muted)",
                                  marginTop: 6,
                                }}
                              >
                                {r.comment}
                              </div>
                            )}
                            {(missingQty > 0 || notFitQty > 0) && (
                              <div
                                style={{
                                  marginTop: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                {missingQty > 0 && (
                                  <StockOutBadge qty={missingQty} small />
                                )}
                                {notFitQty > 0 && (
                                  <NotFitBadge qty={notFitQty} small />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {isOpen && (
                          <ClientBreakdown
                            rows={ordersByDateProduct[key] || []}
                            product={r.product}
                            color={color}
                            stockOutMap={stockOutMap}
                            notFitMap={notFitMap}
                            onSetStockOut={onSetStockOut}
                            stockOutBusy={stockOutBusy}
                            onSetNotFit={onSetNotFit}
                            notFitBusy={notFitBusy}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // ── Планшет/десктоп: таблица с горизонтальным скроллом на узких экранах ──
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: compact ? 720 : undefined,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "var(--s2)" }}>
                        <TH>Товар</TH>
                        <TH>Всего произвести</TH>
                        <TH>По рынкам</TH>
                        <TH>Наличие</TH>
                        <TH>Комментарий</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const key = `${r.date}::${r.product}`;
                        const isOpen = expanded.has(key);
                        const missingQty = missingQtyAgg(r.date, r.product);
                        const notFitQty = notFitQtyAgg(r.date, r.product);
                        const color = colorForRow(i);
                        return (
                          <Fragment key={key}>
                            <TR
                              onClick={() => toggleExpand(key)}
                              bgColor={isOpen ? `${color}1a` : undefined}
                            >
                              <TD style={{ borderLeft: `3px solid ${color}` }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <span style={{ color, fontSize: 12 }}>
                                    {isOpen ? "🧾▾" : "🧾▸"}
                                  </span>
                                  <ProductThumb
                                    src={priceMap[r.product]}
                                    size={30}
                                  />
                                  <b>{r.product}</b>
                                </div>
                              </TD>
                              <TD>
                                <TotalWithMissing
                                  total={r.total}
                                  missingQty={missingQty}
                                  notFitQty={notFitQty}
                                />
                              </TD>
                              <TD>
                                <MarketChips markets={r.markets} />
                              </TD>
                              <TD onClick={(e) => e.stopPropagation()}>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                  }}
                                >
                                  {missingQty > 0 && (
                                    <StockOutBadge qty={missingQty} small />
                                  )}
                                  {notFitQty > 0 && (
                                    <NotFitBadge qty={notFitQty} small />
                                  )}
                                  {missingQty === 0 && notFitQty === 0 && (
                                    <span
                                      style={{
                                        color: "var(--muted)",
                                        fontSize: 11.5,
                                      }}
                                    >
                                      —
                                    </span>
                                  )}
                                </div>
                              </TD>
                              <TD
                                style={{
                                  color: "var(--muted)",
                                  maxWidth: 200,
                                  whiteSpace: "normal",
                                }}
                              >
                                {r.comment || "—"}
                              </TD>
                            </TR>
                            {isOpen && (
                              <tr>
                                <td
                                  colSpan={5}
                                  style={{
                                    background: "var(--s2)",
                                    borderTop: "1px solid var(--b1)",
                                    borderLeft: `3px solid ${color}`,
                                  }}
                                >
                                  <ClientBreakdown
                                    rows={ordersByDateProduct[key] || []}
                                    product={r.product}
                                    color={color}
                                    stockOutMap={stockOutMap}
                                    notFitMap={notFitMap}
                                    onSetStockOut={onSetStockOut}
                                    stockOutBusy={stockOutBusy}
                                    onSetNotFit={onSetNotFit}
                                    notFitBusy={notFitBusy}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}

function DeliveryView({
  orders,
  clients,
  stockOutMap,
  notFitMap,
  search,
  prices,
  isMobile,
  onToggleStatus,
  statusBusy,
  onSetStockOut,
  stockOutBusy,
  onSetNotFit,
  notFitBusy,
}) {
  const [dateFilter, setDateFilter] = useState("");
  const [marketFilter, setMarketFilter] = useState("");

  const imageByProduct = useMemo(() => {
    const m = {};
    (Array.isArray(prices) ? prices : []).forEach((p) => {
      if (p.product) m[p.product] = p.image || "";
    });
    return m;
  }, [prices]);

  const addressByClient = useMemo(() => {
    const m = {};
    (clients || []).forEach((c) => {
      if (c.name) m[norm(c.name)] = c.address || "";
    });
    return m;
  }, [clients]);

  // Один заказ (orderId) = одна карточка — так статус "доставлен/новый"
  // однозначно относится к конкретному заказу, а не ко всем заказам клиента.
  const allGroups = useMemo(() => {
    const groups = buildOrderGroups(orders || []);
    return groups
      .filter((g) => g.deliveryDate)
      .map((g) => ({
        ...g,
        date: g.deliveryDate,
        address: addressByClient[norm(g.client)] || "",
      }))
      .sort(sortByDateDesc);
  }, [orders, addressByClient]);

  const dates = [...new Set(allGroups.map((x) => x.date))].sort().reverse();
  const markets = [...new Set(allGroups.map((x) => x.market))]
    .filter(Boolean)
    .sort();

  const filtered = useMemo(() => {
    let r = allGroups;
    const q = String(search || "")
      .trim()
      .toLowerCase();
    if (q) {
      r = r.filter(
        (x) =>
          String(x.client).toLowerCase().includes(q) ||
          String(x.market).toLowerCase().includes(q) ||
          String(x.address).toLowerCase().includes(q) ||
          x.rows.some((it) => String(it.product).toLowerCase().includes(q)),
      );
    }
    if (dateFilter) r = r.filter((x) => x.date === dateFilter);
    if (marketFilter) r = r.filter((x) => x.market === marketFilter);
    return r;
  }, [allGroups, search, dateFilter, marketFilter]);

  const byDate = useMemo(() => {
    const groups = {};
    filtered.forEach((r) => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return groups;
  }, [filtered]);

  const orderedDates = Object.keys(byDate).sort(
    (a, b) => parseDateStr(b) - parseDateStr(a),
  );

  const colorPool = [
    "rgba(88,166,255,.12)",
    "rgba(63,185,80,.12)",
    "rgba(210,153,34,.12)",
    "rgba(248,81,73,.10)",
    "rgba(139,148,158,.12)",
    "rgba(171,75,222,.12)",
  ];
  const marketColors = {};
  markets.forEach((m, i) => {
    marketColors[m] = colorPool[i % colorPool.length];
  });

  return (
    <>
      <div style={isMobile ? S.kpiGridMobile : S.kpiGrid}>
        <KPI label="Заказов" value={filtered.length} color="var(--accent)" />
        <KPI
          label="Доставлено"
          value={filtered.filter((r) => r.status === "Доставлен").length}
          color="var(--green)"
        />
      </div>
      <div style={S.filters}>
        <Select
          value={dateFilter}
          onChange={setDateFilter}
          options={dates}
          placeholder="Все даты"
        />
        <Select
          value={marketFilter}
          onChange={setMarketFilter}
          options={markets}
          placeholder="Все рынки"
        />
      </div>

      {orderedDates.length === 0 ? (
        <div
          style={{
            ...S.card,
            padding: 40,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          Нет данных
        </div>
      ) : (
        orderedDates.map((date) => {
          const rows = byDate[date];
          return (
            <div key={date} style={{ ...S.card, marginBottom: 16 }}>
              <div
                style={{
                  padding: "12px 18px",
                  borderBottom: "1px solid var(--b1)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>📅 {date}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {rows.length} заказ(ов)
                </span>
              </div>
              <div
                style={{
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {rows.map((r) => {
                  const delivered = r.status === "Доставлен";
                  return (
                    <div
                      key={r.oid}
                      style={{
                        background: marketColors[r.market] || "var(--s2)",
                        border: `1px solid ${delivered ? "var(--green)" : "var(--b1)"}`,
                        borderRadius: 10,
                        padding: "12px 16px",
                        opacity: delivered ? 0.75 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 10,
                          marginBottom: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                            {r.client}
                          </div>
                          <div
                            style={{ fontSize: 11.5, color: "var(--muted)" }}
                          >
                            {r.address || "Адрес не указан"}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "3px 10px",
                              borderRadius: 20,
                              background: "rgba(0,0,0,.08)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            🏪 {r.market || "—"}
                          </span>
                          <Btn
                            size="sm"
                            variant={delivered ? "green" : "warn"}
                            loading={statusBusy.has(r.oid)}
                            onClick={() =>
                              onToggleStatus(
                                r.oid,
                                delivered ? "Новый" : "Доставлен",
                              )
                            }
                          >
                            {delivered ? "✅ Доставлен" : "🚚 Новый"}
                          </Btn>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {r.rows.map((it, j) => {
                          const markKey = `${r.oid}::${it.product}`;
                          const missingQty = stockOutMap.get(markKey) || 0;
                          const notFitQty = notFitMap?.get(markKey) || 0;
                          return (
                            <div
                              key={j}
                              style={{
                                padding: "4px 0",
                                borderBottom:
                                  j < r.rows.length - 1
                                    ? "1px solid var(--b1)"
                                    : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <ProductThumb
                                  src={imageByProduct[it.product]}
                                  size={26}
                                />
                                <span style={{ fontSize: 12.5, flex: 1 }}>
                                  {it.product}
                                </span>
                                {missingQty > 0 && (
                                  <StockOutBadge qty={missingQty} small />
                                )}
                                {notFitQty > 0 && (
                                  <NotFitBadge qty={notFitQty} small />
                                )}
                                <span
                                  style={{
                                    fontFamily: "JetBrains Mono,monospace",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: "var(--accent)",
                                  }}
                                >
                                  {fmt(it.paidQuantity ?? it.quantity)}
                                </span>
                              </div>
                              <div
                                style={{
                                  marginTop: 6,
                                  padding: "7px 9px",
                                  background: "rgba(210,153,34,.08)",
                                  border: "1px dashed rgba(210,153,34,.4)",
                                  borderRadius: 8,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 10.5,
                                    color: "#d29922",
                                    marginBottom: 6,
                                  }}
                                >
                                  ✏️ Отметить по этому заказу:
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <StockOutEditor
                                    orderId={r.oid}
                                    product={it.product}
                                    missingQty={missingQty}
                                    busy={stockOutBusy?.has(markKey)}
                                    onSave={onSetStockOut}
                                  />
                                  <NotFitEditor
                                    orderId={r.oid}
                                    product={it.product}
                                    notFitQty={notFitQty}
                                    busy={notFitBusy?.has(markKey)}
                                    onSave={onSetNotFit}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

// Одна общая страница для Индиры (производство) и водителя (развозка) —
// один код входа, переключение видов кнопками наверху, как в мобильном
// приложении (табы). Здесь же — отметка "нет в наличии" (видна в обоих
// видах) и отметка статуса доставки прямо по заказу.
export function ProductionDeliveryPage({
  data,
  prices,
  search,
  isMobile,
  isTablet,
}) {
  const [view, setView] = useState("production");
  const { data: store, mutate } = useData();
  const { toast } = useUI();
  const orders = Array.isArray(store.orders) ? store.orders : [];
  const clients = Array.isArray(store.clients) ? store.clients : [];

  const [statusBusy, setStatusBusy] = useState(() => new Set());
  const [stockOutBusy, setStockOutBusy] = useState(() => new Set());
  const [notFitBusy, setNotFitBusy] = useState(() => new Set());

  // key "ID заказа::товар" -> сколько не хватает (шт). Привязано к
  // КОНКРЕТНОМУ заказу — иначе если несколько клиентов заказывают один
  // товар на одну дату доставки, система не может понять, у кого именно
  // вычитать недостачу. Отмечается в Развозке (см. DeliveryView ниже), в
  // Производстве эти отметки только суммируются для общей картины.
  const stockOutMap = useMemo(() => {
    const m = new Map();
    (Array.isArray(store.stockOuts) ? store.stockOuts : []).forEach((r) => {
      if (r.orderId && r.product && Number(r.qty) > 0)
        m.set(`${r.orderId}::${r.product}`, Number(r.qty));
    });
    return m;
  }, [store.stockOuts]);

  // key "ID заказа::товар" -> сколько не поместилось (шт) — товар был в
  // наличии, но физически не увезли (не хватило места в развозке).
  // Отдельная от "не хватает" отметка, свой лист на бэкенде, тоже по
  // конкретному заказу.
  const notFitMap = useMemo(() => {
    const m = new Map();
    (Array.isArray(store.notFits) ? store.notFits : []).forEach((r) => {
      if (r.orderId && r.product && Number(r.qty) > 0)
        m.set(`${r.orderId}::${r.product}`, Number(r.qty));
    });
    return m;
  }, [store.notFits]);

  const handleToggleStatus = async (oid, nextStatus) => {
    setStatusBusy((prev) => new Set(prev).add(oid));
    try {
      await mutate(() => updateStatus(oid, nextStatus), ["orders"]);
      toast(`Статус: ${nextStatus}`, "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setStatusBusy((prev) => {
        const next = new Set(prev);
        next.delete(oid);
        return next;
      });
    }
  };

  // Отмечается по ID конкретного заказа (не по дате) — см. комментарий у
  // stockOutMap выше.
  const handleSetStockOut = async (orderId, product, qty) => {
    const key = `${orderId}::${product}`;
    setStockOutBusy((prev) => new Set(prev).add(key));
    try {
      await mutate(() => setStockOut(orderId, product, qty), ["stockOuts"]);
      toast(qty > 0 ? `Не хватает: ${qty} шт` : "Отметка снята", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setStockOutBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleSetNotFit = async (orderId, product, qty) => {
    const key = `${orderId}::${product}`;
    setNotFitBusy((prev) => new Set(prev).add(key));
    try {
      await mutate(() => setNotFit(orderId, product, qty), ["notFits"]);
      toast(qty > 0 ? `Не поместилось: ${qty} шт` : "Отметка снята", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setNotFitBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Btn
          variant={view === "production" ? "primary" : "ghost"}
          onClick={() => setView("production")}
        >
          🏭 Производство
        </Btn>
        <Btn
          variant={view === "delivery" ? "primary" : "ghost"}
          onClick={() => setView("delivery")}
        >
          🚚 Развозка
        </Btn>
      </div>

      {view === "production" ? (
        <ProductionView
          data={data}
          orders={orders}
          stockOutMap={stockOutMap}
          notFitMap={notFitMap}
          search={search}
          prices={prices}
          isMobile={isMobile}
          isTablet={isTablet}
          onSetStockOut={handleSetStockOut}
          stockOutBusy={stockOutBusy}
          onSetNotFit={handleSetNotFit}
          notFitBusy={notFitBusy}
        />
      ) : (
        <DeliveryView
          orders={orders}
          clients={clients}
          stockOutMap={stockOutMap}
          notFitMap={notFitMap}
          search={search}
          prices={prices}
          isMobile={isMobile}
          onToggleStatus={handleToggleStatus}
          statusBusy={statusBusy}
          onSetStockOut={handleSetStockOut}
          stockOutBusy={stockOutBusy}
          onSetNotFit={handleSetNotFit}
          notFitBusy={notFitBusy}
        />
      )}
    </>
  );
}
