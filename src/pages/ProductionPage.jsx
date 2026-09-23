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
import { updateStatus, setStockOut } from "../services/api.js";

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

// Общее количество за вычетом недостачи — чтобы сразу было видно, сколько
// реально есть, без путаницы с изначальным "всего заказано".
function TotalWithMissing({ total, missingQty }) {
  if (!missingQty) {
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
  const available = Math.max(0, Number(total || 0) - missingQty);
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
            color: "var(--red)",
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
      <span style={{ fontSize: 10.5, color: "var(--red)" }}>
        −{fmt(missingQty)} нет в наличии
      </span>
    </span>
  );
}

// Компактный ввод недостачи прямо в строке товара — без лишних кликов.
function StockOutEditor({ date, product, missingQty, busy, onSave }) {
  const [val, setVal] = useState(String(missingQty || ""));
  useEffect(() => setVal(String(missingQty || "")), [missingQty]);

  const save = () => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    onSave(date, product, n);
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
        {missingQty > 0 ? "Обновить" : "Не хватает"}
      </Btn>
    </div>
  );
}

// Кто и сколько заказал этот товар на эту дату доставки —
// раскрывающаяся расшифровка строки производства.
function ClientBreakdown({ rows }) {
  const byClient = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const key = r.client || "—";
      if (!m[key]) m[key] = { client: key, market: r.market || "", qty: 0 };
      m[key].qty += Number(r.paidQuantity ?? r.quantity ?? 0);
    });
    return Object.values(m).sort((a, b) => b.qty - a.qty);
  }, [rows]);

  if (byClient.length === 0) {
    return (
      <div
        style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12.5 }}
      >
        Нет заказов с этим товаром на эту дату.
      </div>
    );
  }

  return (
    <div style={{ padding: "6px 14px 12px" }}>
      {byClient.map((c) => (
        <div
          key={c.client}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
            borderBottom: "1px solid var(--b1)",
            fontSize: 12.5,
          }}
        >
          <span style={{ flex: 1 }}>
            {c.client}
            {c.market && (
              <span
                style={{ color: "var(--muted)", marginLeft: 6, fontSize: 11 }}
              >
                🏪 {c.market}
              </span>
            )}
          </span>
          <span
            style={{
              fontFamily: "JetBrains Mono,monospace",
              fontWeight: 700,
              color: "var(--accent)",
            }}
          >
            {fmt(c.qty)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProductionView({
  data,
  orders,
  stockOutMap,
  search,
  prices,
  isMobile,
  isTablet,
  onSetStockOut,
  stockOutBusy,
}) {
  const [dateFilter, setDateFilter] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const raw = data || {};
  const compact = isMobile || isTablet;

  const priceMap = useMemo(() => {
    const m = {};
    (prices || []).forEach((p) => {
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

  const toggleExpand = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
            (s, r) => s + (stockOutMap.get(`${r.date}::${r.product}`) || 0),
            0,
          );
          const dayTotal = Math.max(0, dayOrdered - dayMissing);
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
                  {dayMissing > 0 ? (
                    <>
                      <b style={{ color: "var(--red)" }}>{fmt(dayTotal)}</b>{" "}
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
                    const missingQty = stockOutMap.get(key) || 0;
                    return (
                      <div
                        key={i}
                        style={{
                          borderBottom:
                            i < rows.length - 1
                              ? "1px solid var(--b1)"
                              : "none",
                        }}
                      >
                        <div
                          onClick={() => toggleExpand(key)}
                          style={{
                            display: "flex",
                            gap: 10,
                            padding: "12px 14px",
                            cursor: "pointer",
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
                                {isOpen ? "▾" : "▸"} {r.product}
                              </b>
                              <TotalWithMissing
                                total={r.total}
                                missingQty={missingQty}
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
                            <div
                              style={{
                                marginTop: 8,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {missingQty > 0 && (
                                <StockOutBadge qty={missingQty} small />
                              )}
                              <StockOutEditor
                                date={r.date}
                                product={r.product}
                                missingQty={missingQty}
                                busy={stockOutBusy.has(key)}
                                onSave={onSetStockOut}
                              />
                            </div>
                          </div>
                        </div>
                        {isOpen && (
                          <ClientBreakdown
                            rows={ordersByDateProduct[key] || []}
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
                      {rows.map((r) => {
                        const key = `${r.date}::${r.product}`;
                        const isOpen = expanded.has(key);
                        const missingQty = stockOutMap.get(key) || 0;
                        return (
                          <Fragment key={key}>
                            <TR onClick={() => toggleExpand(key)}>
                              <TD>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      color: "var(--muted)",
                                      fontSize: 11,
                                    }}
                                  >
                                    {isOpen ? "▾" : "▸"}
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
                                />
                              </TD>
                              <TD>
                                <MarketChips markets={r.markets} />
                              </TD>
                              <TD onClick={(e) => e.stopPropagation()}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {missingQty > 0 && (
                                    <StockOutBadge qty={missingQty} small />
                                  )}
                                  <StockOutEditor
                                    date={r.date}
                                    product={r.product}
                                    missingQty={missingQty}
                                    busy={stockOutBusy.has(key)}
                                    onSave={onSetStockOut}
                                  />
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
                                  }}
                                >
                                  <ClientBreakdown
                                    rows={ordersByDateProduct[key] || []}
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
  search,
  prices,
  isMobile,
  onToggleStatus,
  statusBusy,
}) {
  const [dateFilter, setDateFilter] = useState("");
  const [marketFilter, setMarketFilter] = useState("");

  const imageByProduct = useMemo(() => {
    const m = {};
    (prices || []).forEach((p) => {
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
                          gap: 6,
                        }}
                      >
                        {r.rows.map((it, j) => {
                          const missingQty =
                            stockOutMap.get(`${date}::${it.product}`) || 0;
                          return (
                            <div
                              key={j}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "4px 0",
                                borderBottom:
                                  j < r.rows.length - 1
                                    ? "1px solid var(--b1)"
                                    : "none",
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

  // key "дата::товар" -> сколько не хватает (шт). Общее количество на
  // производстве и в развозке уменьшается на эту цифру, чтобы не путаться.
  const stockOutMap = useMemo(() => {
    const m = new Map();
    (Array.isArray(store.stockOuts) ? store.stockOuts : []).forEach((r) => {
      if (r.date && r.product && Number(r.qty) > 0)
        m.set(`${r.date}::${r.product}`, Number(r.qty));
    });
    return m;
  }, [store.stockOuts]);

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

  const handleSetStockOut = async (date, product, qty) => {
    const key = `${date}::${product}`;
    setStockOutBusy((prev) => new Set(prev).add(key));
    try {
      await mutate(() => setStockOut(date, product, qty), ["stockOuts"]);
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
          search={search}
          prices={prices}
          isMobile={isMobile}
          isTablet={isTablet}
          onSetStockOut={handleSetStockOut}
          stockOutBusy={stockOutBusy}
        />
      ) : (
        <DeliveryView
          orders={orders}
          clients={clients}
          stockOutMap={stockOutMap}
          search={search}
          prices={prices}
          isMobile={isMobile}
          onToggleStatus={handleToggleStatus}
          statusBusy={statusBusy}
        />
      )}
    </>
  );
}
