// «Топ товары» и «Топ клиенты» для страницы Аналитика.
// Все позиции сразу (список с прокруткой), с картинками и полоской доли.
//  • клик по товару — окно: кто заказывал, когда, сколько, сумма, статус;
//  • клик по клиенту — страница клиента с историей заказов.
import { useMemo, useState } from "react";
import { fmtM, parseDate } from "../utils/index.js";
import { ProductThumb } from "./UI.jsx";
import { Modal, DateField } from "./Form.jsx";
import { S } from "../utils/styles.js";

const key = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const statusColor = (st) => {
  const s = key(st);
  if (s.includes("достав")) return "var(--green)";
  if (s.includes("нов")) return "var(--accent)";
  return "var(--muted)";
};

function Rank({ i }) {
  const medal = ["🥇", "🥈", "🥉"][i];
  return (
    <div
      style={{
        width: 26,
        textAlign: "center",
        fontSize: medal ? 17 : 12.5,
        color: "var(--muted)",
        flexShrink: 0,
      }}
    >
      {medal || i + 1}
    </div>
  );
}

function Row({ i, left, title, sub, value, share, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        borderBottom: "1px solid var(--b1)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--s2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Rank i={i} />
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <b
            style={{
              fontSize: 13.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </b>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background: "var(--s2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(2, share * 100)}%`,
                height: "100%",
                background: color,
                borderRadius: 3,
              }}
            />
          </div>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{sub}</span>
        </div>
      </div>
    </div>
  );
}

function Card({ title, count, children }) {
  return (
    <div style={{ ...S.card, minWidth: 0 }}>
      <div
        style={{
          padding: "13px 18px",
          borderBottom: "1px solid var(--b1)",
          fontSize: 14,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{title}</span>
        <span
          style={{ color: "var(--muted)", fontWeight: 500, fontSize: 12.5 }}
        >
          всего: {count}
        </span>
      </div>
      <div style={{ maxHeight: 640, overflowY: "auto" }}>{children}</div>
    </div>
  );
}

export default function AnalyticsTop({
  products, // [{name, qty, revenue}]
  clients, // [{name, orders, revenue}]
  orders, // строки заказов (data.orders)
  prices, // каталог (картинки)
  onSelectClient, // (name) => открыть страницу клиента
}) {
  const [productOpen, setProductOpen] = useState(null);
  const [fMarket, setFMarket] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const openProduct = (p) => {
    setFMarket("");
    setFFrom("");
    setFTo("");
    setProductOpen(p);
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtD = (d) =>
    `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  const setMonth = (off) => {
    const n = new Date();
    setFFrom(fmtD(new Date(n.getFullYear(), n.getMonth() + off, 1)));
    setFTo(fmtD(new Date(n.getFullYear(), n.getMonth() + off + 1, 0)));
  };
  const dKey = (d) => {
    const p = String(d || "")
      .split(" ")[0]
      .split(".");
    return p.length === 3
      ? Number(p[2]) * 10000 + Number(p[1]) * 100 + Number(p[0])
      : 0;
  };

  const imgByProduct = useMemo(() => {
    const m = {};
    (Array.isArray(prices) ? prices : []).forEach((p) => {
      if (p.product) m[key(p.product)] = p.image;
    });
    return m;
  }, [prices]);

  const maxP = Math.max(1, ...products.map((p) => p.revenue));
  const maxC = Math.max(1, ...clients.map((c) => c.revenue));

  // все заказы выбранного товара (без фильтров) — отсюда список рынков
  const productAll = useMemo(() => {
    if (!productOpen) return [];
    const k = key(productOpen.name);
    return (Array.isArray(orders) ? orders : []).filter(
      (o) => key(o.product) === k,
    );
  }, [productOpen, orders]);

  const marketList = useMemo(
    () => [...new Set(productAll.map((o) => o.market).filter(Boolean))].sort(),
    [productAll],
  );

  const productRows = useMemo(() => {
    const fk = fFrom ? dKey(fFrom) : 0;
    const tk = fTo ? dKey(fTo) : 99999999;
    return productAll
      .filter((o) => {
        if (fMarket && o.market !== fMarket) return false;
        const k = dKey(o.deliveryDate || o.orderDate);
        return k >= fk && k <= tk;
      })
      .sort(
        (a, b) =>
          parseDate(b.deliveryDate || b.orderDate) -
          parseDate(a.deliveryDate || a.orderDate),
      );
  }, [productAll, fMarket, fFrom, fTo]);

  const sumQty = productRows.reduce(
    (s, o) => s + Number(o.paidQuantity ?? o.quantity ?? 0),
    0,
  );
  const sumTotal = productRows.reduce((s, o) => s + Number(o.total || 0), 0);

  const th = {
    textAlign: "left",
    fontSize: 11,
    color: "var(--muted)",
    textTransform: "uppercase",
    padding: "7px 10px",
    background: "var(--s2)",
    position: "sticky",
    top: 0,
  };
  const td = {
    padding: "8px 10px",
    borderTop: "1px solid var(--b1)",
    fontSize: 13,
  };

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <Card title="🏆 Топ товары" count={products.length}>
          {products.length === 0 && (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              Нет данных
            </div>
          )}
          {products.map((p, i) => (
            <Row
              key={p.name}
              i={i}
              left={<ProductThumb src={imgByProduct[key(p.name)]} size={40} />}
              title={p.name}
              sub={`${p.qty.toLocaleString()} шт`}
              value={fmtM(p.revenue)}
              share={p.revenue / maxP}
              color="var(--purple)"
              onClick={() => openProduct(p)}
            />
          ))}
        </Card>

        <Card title="👥 Топ клиенты" count={clients.length}>
          {clients.length === 0 && (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              Нет данных
            </div>
          )}
          {clients.map((c, i) => (
            <Row
              key={c.name}
              i={i}
              left={
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "var(--s2)",
                    border: "1px solid var(--b1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    color: "var(--green)",
                    flexShrink: 0,
                  }}
                >
                  {String(c.name || "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </div>
              }
              title={c.name}
              sub={`${c.orders.toLocaleString()} заказ.`}
              value={fmtM(c.revenue)}
              share={c.revenue / maxC}
              color="var(--green)"
              onClick={() => onSelectClient && onSelectClient(c.name)}
            />
          ))}
        </Card>
      </div>

      <Modal
        open={!!productOpen}
        onClose={() => setProductOpen(null)}
        width={760}
        title={productOpen ? `📦 ${productOpen.name}` : ""}
        subtitle={
          productOpen
            ? `Заказов: ${productRows.length} · Кол-во: ${sumQty.toLocaleString()} · Сумма: ${fmtM(sumTotal)}`
            : ""
        }
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 150 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Рынок
            </div>
            <select
              value={fMarket}
              onChange={(e) => setFMarket(e.target.value)}
              style={{
                width: "100%",
                background: "var(--s2)",
                border: "1px solid var(--b1)",
                borderRadius: 8,
                padding: "9px 10px",
                color: "var(--text)",
                fontSize: 13,
              }}
            >
              <option value="">Все рынки</option>
              {marketList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              С даты
            </div>
            <DateField value={fFrom} onChange={setFFrom} />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              По дату
            </div>
            <DateField value={fTo} onChange={setFTo} />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {[
            [
              "Всё время",
              () => {
                setFFrom("");
                setFTo("");
              },
            ],
            ["Этот месяц", () => setMonth(0)],
            ["Прошлый месяц", () => setMonth(-1)],
          ].map(([l, fn]) => (
            <button
              key={l}
              type="button"
              onClick={fn}
              style={{
                background: "var(--s2)",
                border: "1px solid var(--b1)",
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 12.5,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: "60vh", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Дата",
                  "Клиент",
                  "Рынок",
                  "Кол-во",
                  "Цена",
                  "Сумма",
                  "Статус",
                ].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productRows.map((o, i) => (
                <tr key={o.id || i}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {String(o.deliveryDate || o.orderDate || "").split(" ")[0]}
                  </td>
                  <td
                    style={{
                      ...td,
                      color: "var(--accent)",
                      cursor: onSelectClient ? "pointer" : "default",
                      fontWeight: 600,
                    }}
                    onClick={() => {
                      if (!onSelectClient) return;
                      setProductOpen(null);
                      onSelectClient(o.client);
                    }}
                  >
                    {o.client}
                  </td>
                  <td style={{ ...td, color: "var(--muted)" }}>
                    {o.market || "—"}
                  </td>
                  <td style={td}>
                    {Number(o.paidQuantity ?? o.quantity ?? 0)}
                  </td>
                  <td style={td}>{fmtM(o.price)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtM(o.total)}</td>
                  <td
                    style={{
                      ...td,
                      color: statusColor(o.status),
                      fontWeight: 600,
                    }}
                  >
                    {o.status || "—"}
                  </td>
                </tr>
              ))}
              {productRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      ...td,
                      textAlign: "center",
                      color: "var(--muted)",
                    }}
                  >
                    Заказов этого товара нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
