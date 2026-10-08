// Оформление нового заказа — весь функционал экрана createOrder из мобильного:
// выбор рынка/клиента, дата доставки, счётчики по товарам, комментарии,
// акция «+1 за 10», итоговая сумма.
import { useMemo, useState } from "react";
import {
  Modal,
  Btn,
  Field,
  TextInput,
  DateField,
  SelectField,
  todayString,
} from "./Form.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { saveOrder } from "../services/api.js";
import { ProductThumb } from "./UI.jsx";
import { priceOf } from "../utils/promo.js";
import { fmtM, parseDate } from "../utils/index.js";

const normName = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

export default function CreateOrderModal({ open, onClose, defaultClient }) {
  const { data, mutate } = useData();
  const { toast } = useUI();

  const clients = Array.isArray(data.clients) ? data.clients : [];
  const prices = Array.isArray(data.prices) ? data.prices : [];

  // "Дордой-фуд" — самый частый рынок, его и предлагаем первым по
  // умолчанию (раньше список просто сортировался по алфавиту, и первым
  // оказывался "Аламедин"). Сравниваем без учёта регистра/пробелов —
  // мало ли как именно записано в справочнике клиентов.
  const normMarket = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();
  const markets = useMemo(() => {
    const list = [
      ...new Set(clients.map((c) => c.market).filter(Boolean)),
    ].sort();
    const idx = list.findIndex((m) => normMarket(m) === "дордой-фуд");
    if (idx > 0) return [list[idx], ...list.filter((_, i) => i !== idx)];
    return list;
  }, [clients]);

  const initialClient = clients.find((c) => c.name === defaultClient);
  const [market, setMarket] = useState(
    initialClient?.market || markets[0] || "",
  );
  const [client, setClient] = useState(defaultClient || "");
  const [deliveryDate, setDeliveryDate] = useState(todayString());
  const [items, setItems] = useState({}); // product -> {qty, comment}
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [unfulfilledOpen, setUnfulfilledOpen] = useState(false);

  // Отметки "не хватает"/"не поместилось" — те же данные, что на странице
  // Развозки, ключ "ID заказа::товар" (привязаны к конкретному заказу, а
  // не просто к дате+товару — иначе путались бы разные клиенты).
  const allOrderRows = Array.isArray(data.orders) ? data.orders : [];
  const allStockOuts = Array.isArray(data.stockOuts) ? data.stockOuts : [];
  const allNotFits = Array.isArray(data.notFits) ? data.notFits : [];
  const stockOutMap = useMemo(() => {
    const m = new Map();
    allStockOuts.forEach((r) => {
      if (r.orderId && r.product && Number(r.qty) > 0)
        m.set(`${r.orderId}::${r.product}`, Number(r.qty));
    });
    return m;
  }, [allStockOuts]);
  const notFitMap = useMemo(() => {
    const m = new Map();
    allNotFits.forEach((r) => {
      if (r.orderId && r.product && Number(r.qty) > 0)
        m.set(`${r.orderId}::${r.product}`, Number(r.qty));
    });
    return m;
  }, [allNotFits]);

  // Раньше недопоставленный товар переносили отдельным заказом на
  // завтра — теперь просто фиксируем нехватку/непомещение по конкретному
  // заказу, а здесь, при следующем заказе этого же клиента, напоминаем об
  // этом: по датам, что именно и сколько не доехало, чтобы можно было
  // решить — добавить ли это в текущий заказ (как обычно, вручную) или нет.
  const unfulfilledByDate = useMemo(() => {
    if (!client) return [];
    const byDate = {};
    allOrderRows.forEach((r) => {
      if (
        normName(r.client) !== normName(client) ||
        !r.deliveryDate ||
        !r.orderId
      )
        return;
      const date = String(r.deliveryDate).split(" ")[0];
      const key = `${r.orderId}::${r.product}`;
      const qty = Number(r.paidQuantity ?? r.quantity ?? 0);
      const missing = Math.min(qty, Number(stockOutMap.get(key) || 0));
      const remaining = Math.max(0, qty - missing);
      const notFit = Math.min(remaining, Number(notFitMap.get(key) || 0));
      if (missing <= 0 && notFit <= 0) return;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({ product: r.product, missing, notFit });
    });
    return Object.entries(byDate)
      .sort((a, b) => parseDate(b[0]) - parseDate(a[0]))
      .slice(0, 10);
  }, [client, allOrderRows, stockOutMap, notFitMap]);

  const unfulfilledCount = unfulfilledByDate.reduce(
    (s, [, items]) => s + items.length,
    0,
  );

  const marketClients = useMemo(
    () => clients.filter((c) => c.market === market).map((c) => c.name),
    [clients, market],
  );

  // Весовой товар — у него задана цена "своя тара" (обычная или
  // раздельно белое/тёмное). Коробочные (обычные, штучные) товары
  // показываем по алфавиту сверху, весовые — как есть, снизу.
  const isWeighted = (p) =>
    Number(p?.ownBoxPrice || 0) > 0 ||
    (Number(p?.ownBoxPriceWhite || 0) > 0 &&
      Number(p?.ownBoxPriceDark || 0) > 0);

  const shownProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = prices.filter(
      (p) => !q || String(p.product).toLowerCase().includes(q),
    );
    const boxed = filtered
      .filter((p) => !isWeighted(p))
      .sort((a, b) => String(a.product).localeCompare(String(b.product), "ru"));
    const weighted = filtered.filter((p) => isWeighted(p));
    return [...boxed, ...weighted];
  }, [prices, search]);

  const setQty = (product, qty) =>
    setItems((prev) => ({
      ...prev,
      [product]: {
        ...(prev[product] || { comment: "", oldBox: false }),
        qty: Math.max(0, qty),
      },
    }));

  const setQtyColor = (product, color, qty) =>
    setItems((prev) => ({
      ...prev,
      [product]: {
        ...(prev[product] || { qty: 0, comment: "", oldBox: false }),
        [color === "white" ? "qtyWhite" : "qtyDark"]: Math.max(0, qty),
      },
    }));

  const setComment = (product, comment) =>
    setItems((prev) => ({
      ...prev,
      [product]: { ...(prev[product] || { qty: 0, oldBox: false }), comment },
    }));

  // Тёмное печенье в новой коробке: в каталоге задана priceDark
  // (напр. 97 вместо 90).
  const canDark = (row) => !!row && Number(row.priceDark || 0) > 0;

  // Товары, у которых старая коробка делится по цвету (белый/тёмный) —
  // для них при выборе "старая коробка" вводится кол-во отдельно для
  // каждого цвета, каждое по своей цене.
  const canColorSplit = (row) =>
    !!row &&
    Number(row.ownBoxPriceWhite || 0) > 0 &&
    Number(row.ownBoxPriceDark || 0) > 0;

  // Режим "по цветам": включена "Тёмные" либо старая коробка с делением.
  const isSplit = (row, it) =>
    !!it && (!!it.dark || (!!it.oldBox && canColorSplit(row)));

  // Меняем флаг (oldBox/dark) и переносим количество между режимами:
  // в раздельный режим — всё количество уходит в "обычные", обратно —
  // сумма обоих цветов возвращается в общее количество.
  const toggleFlag = (product, flag) =>
    setItems((prev) => {
      const row = prices.find((p) => p.product === product);
      const cur = prev[product] || { qty: 0, comment: "" };
      const next = { ...cur, [flag]: !cur[flag] };
      const was = isSplit(row, cur);
      const now = isSplit(row, next);
      const sum = Number(cur.qtyWhite || 0) + Number(cur.qtyDark || 0);
      if (!was && now && sum === 0) next.qtyWhite = Number(cur.qty || 0);
      if (was && !now) {
        next.qty = sum || Number(cur.qty || 0);
        next.qtyWhite = 0;
        next.qtyDark = 0;
      }
      return { ...prev, [product]: next };
    });
  const toggleOldBox = (product) => toggleFlag(product, "oldBox");
  const toggleDark = (product) => toggleFlag(product, "dark");

  // Цены по цветам. Новая коробка: обычное = price, тёмное = priceDark.
  // Старая: белое/тёмное из каталога; если не заданы — своя тара
  // (+ разница тёмного).
  const colorPrices = (row, oldBox) => {
    const base = priceOf(row, market);
    const delta = canDark(row)
      ? Number(row.priceDark) - Number(row.price || 0)
      : 0;
    if (!oldBox)
      return { white: base, dark: canDark(row) ? Number(row.priceDark) : base };
    const own = Number(row?.ownBoxPrice || 0);
    const w = Number(row?.ownBoxPriceWhite || 0);
    const d = Number(row?.ownBoxPriceDark || 0);
    return {
      white: w > 0 ? w : own || base,
      dark: d > 0 ? d : (own || base) + delta,
    };
  };

  // Цена обычной (не раздельной) строки.
  const priceForItem = (row, it) => {
    if (it?.oldBox && Number(row?.ownBoxPrice || 0) > 0)
      return Number(row.ownBoxPrice);
    return priceOf(row, market);
  };

  // Цена за коробку + в скобках цена за кг (для весовых, продающихся
  // коробками — напр. 3 кг), чтобы было видно обе величины сразу.
  const withPerKg = (row, amount) => {
    const weight = Number(row?.weight || 0);
    if (!weight) return `${amount} сом`;
    return `${amount} сом (${Math.round(amount / weight)} сом/кг)`;
  };

  const totals = useMemo(() => {
    let boxes = 0;
    let sum = 0;
    Object.entries(items).forEach(([product, it]) => {
      const row = prices.find((p) => p.product === product);
      if (isSplit(row, it)) {
        const qw = Number(it.qtyWhite || 0);
        const qd = Number(it.qtyDark || 0);
        const cp = colorPrices(row, !!it.oldBox);
        boxes += qw + qd;
        sum += qw * cp.white + qd * cp.dark;
        return;
      }
      const qty = Number(it?.qty || 0);
      if (!qty) return;
      boxes += qty;
      sum += qty * priceForItem(row, it);
    });
    return { boxes, sum };
  }, [items, prices, market]);

  const handleSave = async () => {
    if (!market) return toast("Выберите рынок", "err");
    if (!client) return toast("Выберите клиента", "err");

    const orderItems = [];
    Object.entries(items).forEach(([product, it]) => {
      const row = prices.find((p) => p.product === product);
      if (isSplit(row, it)) {
        const oldBox = !!it.oldBox;
        [
          ["white", Number(it.qtyWhite || 0)],
          ["dark", Number(it.qtyDark || 0)],
        ].forEach(([color, q]) => {
          if (q <= 0) return;
          orderItems.push({
            product,
            quantity: q,
            paidQuantity: q,
            giftQty: 0,
            finalQuantity: q,
            comment: it.comment || "",
            oldBox,
            // новая коробка: помечаем только тёмное
            oldBoxColor: oldBox || color === "dark" ? color : "",
          });
        });
        return;
      }
      const qty = Number(it?.qty || 0);
      if (qty > 0) {
        orderItems.push({
          product,
          quantity: qty,
          paidQuantity: qty,
          giftQty: 0,
          finalQuantity: qty,
          comment: it.comment || "",
          oldBox: !!it.oldBox,
        });
      }
    });

    if (!orderItems.length) return toast("Добавьте хотя бы один товар", "err");

    try {
      setSaving(true);
      await mutate(
        () => saveOrder({ client, market, deliveryDate, items: orderItems }),
        AFFECTS.order,
      );
      toast("Заказ сохранён", "ok");
      onClose();
    } catch (e) {
      toast("Не удалось сохранить заказ: " + e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Новый заказ"
      subtitle="Выберите клиента и соберите коробки"
      width={720}
      footer={
        <>
          <div style={{ marginRight: "auto", fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>Коробок: </span>
            <b style={{ fontFamily: "JetBrains Mono,monospace" }}>
              {totals.boxes}
            </b>
            <span style={{ color: "var(--muted)", marginLeft: 14 }}>
              Сумма:{" "}
            </span>
            <b
              style={{
                fontFamily: "JetBrains Mono,monospace",
                color: "var(--green)",
              }}
            >
              {fmtM(totals.sum)}
            </b>
          </div>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Btn>
          <Btn variant="primary" onClick={handleSave} loading={saving}>
            Сохранить заказ
          </Btn>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 10,
        }}
      >
        <Field label="Рынок">
          <SelectField
            value={market}
            onChange={(v) => {
              setMarket(v);
              setClient("");
            }}
            options={markets}
            placeholder="— выберите —"
          />
        </Field>
        <Field label="Клиент">
          <SelectField
            value={client}
            onChange={setClient}
            options={marketClients}
            placeholder="— выберите —"
          />
        </Field>
        <Field label="Дата доставки">
          <DateField value={deliveryDate} onChange={setDeliveryDate} />
        </Field>
      </div>

      {unfulfilledCount > 0 && (
        <div
          style={{
            border: "1px solid rgba(210,153,34,0.4)",
            background: "rgba(210,153,34,.06)",
            borderRadius: 10,
            marginBottom: 10,
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setUnfulfilledOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "9px 12px",
              background: "transparent",
              border: "none",
              color: "#d29922",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span>
              {unfulfilledOpen ? "▾" : "▸"} Не довезли в прошлый раз:{" "}
              {unfulfilledCount} поз.
            </span>
            <span
              style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}
            >
              не хватало / не поместилось
            </span>
          </button>

          {unfulfilledOpen && (
            <div style={{ padding: "0 12px 10px" }}>
              {unfulfilledByDate.map(([date, list]) => (
                <div key={date} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    📅 {date}
                  </div>
                  {list.map((it, idx) => {
                    const total = it.missing + it.notFit;
                    const row = prices.find((p) => p.product === it.product);
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "5px 0",
                          flexWrap: "wrap",
                        }}
                      >
                        <ProductThumb src={row?.image} size={22} />
                        <span
                          style={{ fontSize: 12.5, flex: 1, minWidth: 100 }}
                        >
                          {it.product}
                        </span>
                        {it.missing > 0 && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: "var(--red)",
                              background: "rgba(248,81,73,.14)",
                              borderRadius: 20,
                              padding: "2px 7px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            🚫 не хватило: {it.missing}
                          </span>
                        )}
                        {it.notFit > 0 && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: "var(--purple)",
                              background: "rgba(163,113,247,.14)",
                              borderRadius: 20,
                              padding: "2px 7px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            📦 не поместилось: {it.notFit}
                          </span>
                        )}
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const current = Number(items[it.product]?.qty || 0);
                            setQty(it.product, current + total);
                          }}
                        >
                          + добавить {total} в заказ
                        </Btn>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <TextInput
        placeholder="🔍 Поиск товара..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <div>
        {shownProducts.length === 0 && (
          <div
            style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}
          >
            Товар не найден
          </div>
        )}

        {shownProducts.map((p) => {
          const it = items[p.product] || { qty: 0, comment: "", oldBox: false };
          const canOldBox = Number(p.ownBoxPrice || 0) > 0;
          const canSplit = canColorSplit(p);
          const hasDark = canDark(p);
          const splitActive = isSplit(p, it);
          const qtyWhite = Number(it.qtyWhite || 0);
          const qtyDark = Number(it.qtyDark || 0);
          const rawQty = Number(it.qty || 0);
          const qty = splitActive ? qtyWhite + qtyDark : rawQty;
          const price = priceForItem(p, it);
          const cp = colorPrices(p, !!it.oldBox);
          const showOptions =
            (canOldBox || canSplit || hasDark) &&
            (rawQty > 0 || it.oldBox || it.dark || qty > 0);
          const optBtn = (on) => ({
            background: on ? "rgba(210,153,34,0.15)" : "var(--s1)",
            border: `1px solid ${on ? "#d29922" : "var(--b1)"}`,
            borderRadius: 7,
            padding: "5px 8px",
            color: on ? "#d29922" : "var(--muted)",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          });
          const stepper = (color, val, label) => (
            <div
              key={color}
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {label}
              </span>
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => setQtyColor(p.product, color, val - 1)}
              >
                −
              </Btn>
              <input
                value={val || ""}
                onChange={(e) =>
                  setQtyColor(
                    p.product,
                    color,
                    parseInt(e.target.value.replace(/\D/g, "")) || 0,
                  )
                }
                placeholder="0"
                style={{
                  width: 46,
                  textAlign: "center",
                  background: "var(--s1)",
                  border: "1px solid var(--b1)",
                  borderRadius: 8,
                  color: "var(--text)",
                  padding: "6px 4px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <Btn
                size="sm"
                variant="green"
                onClick={() => setQtyColor(p.product, color, val + 1)}
              >
                +
              </Btn>
            </div>
          );

          return (
            <div
              key={p.product}
              style={{
                border: `1px solid ${qty > 0 ? "var(--green)" : "var(--b1)"}`,
                background: qty > 0 ? "rgba(63,185,80,.06)" : "var(--s2)",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ProductThumb src={p.image} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {p.product}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {splitActive
                      ? `обычн. ${withPerKg(p, cp.white)} · тём. ${withPerKg(p, cp.dark)}`
                      : `${price} сом / шт`}
                    {it.oldBox && (canOldBox || canSplit) && (
                      <span style={{ color: "#d29922", marginLeft: 6 }}>
                        📦 старая коробка
                      </span>
                    )}
                  </div>
                </div>

                {!splitActive && (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => setQty(p.product, qty - 1)}
                    >
                      −
                    </Btn>
                    <input
                      value={qty || ""}
                      onChange={(e) =>
                        setQty(
                          p.product,
                          parseInt(e.target.value.replace(/\D/g, "")) || 0,
                        )
                      }
                      placeholder="0"
                      style={{
                        width: 56,
                        textAlign: "center",
                        background: "var(--s1)",
                        border: "1px solid var(--b1)",
                        borderRadius: 8,
                        color: "var(--text)",
                        padding: "6px 4px",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 14,
                        outline: "none",
                      }}
                    />
                    <Btn
                      size="sm"
                      variant="green"
                      onClick={() => setQty(p.product, qty + 1)}
                    >
                      +
                    </Btn>
                  </div>
                )}
              </div>

              {showOptions && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {(canOldBox || canSplit) && (
                    <button
                      onClick={() => toggleOldBox(p.product)}
                      title={
                        canSplit
                          ? "Клиент забирает в своей таре — указать отдельно обычное и тёмное"
                          : `Клиент забирает в своей таре — цена ${p.ownBoxPrice} сом вместо ${p.price} сом`
                      }
                      style={optBtn(!!it.oldBox)}
                    >
                      📦 старая коробка
                    </button>
                  )}
                  {hasDark && (
                    <button
                      onClick={() => toggleDark(p.product)}
                      title={`Тёмное печенье: ${p.priceDark} сом вместо ${p.price} сом`}
                      style={optBtn(!!it.dark)}
                    >
                      🍫 Тёмные
                    </button>
                  )}
                  {splitActive && (
                    <>
                      {stepper("white", qtyWhite, "обычные")}
                      {stepper("dark", qtyDark, "тёмные")}
                    </>
                  )}
                </div>
              )}

              {qty > 0 && (
                <TextInput
                  placeholder="Комментарий к товару..."
                  value={it.comment || ""}
                  onChange={(e) => setComment(p.product, e.target.value)}
                  style={{ marginTop: 8, fontSize: 12.5 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
