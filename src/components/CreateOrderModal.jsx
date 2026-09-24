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
  tomorrowString,
} from "./Form.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { saveOrder } from "../services/api.js";
import { ProductThumb } from "./UI.jsx";
import { priceOf } from "../utils/promo.js";
import { fmtM } from "../utils/index.js";

export default function CreateOrderModal({ open, onClose, defaultClient }) {
  const { data, mutate } = useData();
  const { toast } = useUI();

  const clients = Array.isArray(data.clients) ? data.clients : [];
  const prices = Array.isArray(data.prices) ? data.prices : [];

  const markets = useMemo(
    () => [...new Set(clients.map((c) => c.market).filter(Boolean))].sort(),
    [clients],
  );

  const initialClient = clients.find((c) => c.name === defaultClient);
  const [market, setMarket] = useState(initialClient?.market || markets[0] || "");
  const [client, setClient] = useState(defaultClient || "");
  const [deliveryDate, setDeliveryDate] = useState(tomorrowString());
  const [items, setItems] = useState({}); // product -> {qty, comment}
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const marketClients = useMemo(
    () => clients.filter((c) => c.market === market).map((c) => c.name),
    [clients, market],
  );

  // Весовой товар — у него задана цена "своя тара" (обычная или
  // раздельно белое/тёмное). Коробочные (обычные, штучные) товары
  // показываем по алфавиту сверху, весовые — как есть, снизу.
  const isWeighted = (p) =>
    Number(p?.ownBoxPrice || 0) > 0 ||
    (Number(p?.ownBoxPriceWhite || 0) > 0 && Number(p?.ownBoxPriceDark || 0) > 0);

  const shownProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = prices.filter((p) => !q || String(p.product).toLowerCase().includes(q));
    const boxed = filtered
      .filter((p) => !isWeighted(p))
      .sort((a, b) => String(a.product).localeCompare(String(b.product), "ru"));
    const weighted = filtered.filter((p) => isWeighted(p));
    return [...boxed, ...weighted];
  }, [prices, search]);

  const setQty = (product, qty) =>
    setItems((prev) => ({
      ...prev,
      [product]: { ...(prev[product] || { comment: "", oldBox: false }), qty: Math.max(0, qty) },
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

  const toggleOldBox = (product) =>
    setItems((prev) => ({
      ...prev,
      [product]: {
        ...(prev[product] || { qty: 0, comment: "" }),
        oldBox: !prev[product]?.oldBox,
      },
    }));

  // Товары, у которых старая коробка делится по цвету (белый/тёмный) —
  // для них при выборе "старая коробка" вводится кол-во отдельно для
  // каждого цвета, каждое по своей цене.
  const canColorSplit = (row) =>
    !!row && Number(row.ownBoxPriceWhite || 0) > 0 && Number(row.ownBoxPriceDark || 0) > 0;

  // Цена товара с учётом "своей тары" (клиент забирает без нашей
  // коробки — обычно чуть дешевле). Применимо только к товарам, у
  // которых в каталоге задана ownBoxPrice.
  const priceForItem = (row, it) =>
    it?.oldBox && Number(row?.ownBoxPrice || 0) > 0
      ? Number(row.ownBoxPrice)
      : priceOf(row, market);

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
      if (it?.oldBox && canColorSplit(row)) {
        const qw = Number(it.qtyWhite || 0);
        const qd = Number(it.qtyDark || 0);
        boxes += qw + qd;
        sum += qw * Number(row.ownBoxPriceWhite) + qd * Number(row.ownBoxPriceDark);
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
      if (it?.oldBox && canColorSplit(row)) {
        const qw = Number(it.qtyWhite || 0);
        const qd = Number(it.qtyDark || 0);
        if (qw > 0) {
          orderItems.push({
            product,
            quantity: qw,
            paidQuantity: qw,
            giftQty: 0,
            finalQuantity: qw,
            comment: it.comment || "",
            oldBox: true,
            oldBoxColor: "white",
          });
        }
        if (qd > 0) {
          orderItems.push({
            product,
            quantity: qd,
            paidQuantity: qd,
            giftQty: 0,
            finalQuantity: qd,
            comment: it.comment || "",
            oldBox: true,
            oldBoxColor: "dark",
          });
        }
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
            <b style={{ fontFamily: "JetBrains Mono,monospace" }}>{totals.boxes}</b>
            <span style={{ color: "var(--muted)", marginLeft: 14 }}>Сумма: </span>
            <b style={{ fontFamily: "JetBrains Mono,monospace", color: "var(--green)" }}>
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

      <TextInput
        placeholder="🔍 Поиск товара..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <div>
        {shownProducts.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
            Товар не найден
          </div>
        )}

        {shownProducts.map((p) => {
          const it = items[p.product] || { qty: 0, comment: "", oldBox: false };
          const canOldBox = Number(p.ownBoxPrice || 0) > 0;
          const canSplit = canColorSplit(p);
          const splitActive = it.oldBox && canSplit;
          const qtyWhite = Number(it.qtyWhite || 0);
          const qtyDark = Number(it.qtyDark || 0);
          const rawQty = Number(it.qty || 0);
          const qty = splitActive ? qtyWhite + qtyDark : rawQty;
          const price = priceForItem(p, it);

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
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.product}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {splitActive
                      ? `бел. ${withPerKg(p, p.ownBoxPriceWhite)} · тём. ${withPerKg(p, p.ownBoxPriceDark)}`
                      : `${price} сом / шт`}
                    {it.oldBox && (canOldBox || canSplit) && (
                      <span style={{ color: "#d29922", marginLeft: 6 }}>
                        📦 старая коробка
                      </span>
                    )}
                  </div>
                </div>

                {qty > 0 && canOldBox && !canSplit && (
                  <button
                    onClick={() => toggleOldBox(p.product)}
                    title={`Клиент забирает в своей таре — цена ${p.ownBoxPrice} сом вместо ${p.price} сом`}
                    style={{
                      background: it.oldBox ? "rgba(210,153,34,0.15)" : "var(--s1)",
                      border: `1px solid ${it.oldBox ? "#d29922" : "var(--b1)"}`,
                      borderRadius: 7,
                      padding: "5px 8px",
                      color: it.oldBox ? "#d29922" : "var(--muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📦 своя тара
                  </button>
                )}

                {!splitActive && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Btn size="sm" variant="ghost" onClick={() => setQty(p.product, qty - 1)}>
                      −
                    </Btn>
                    <input
                      value={qty || ""}
                      onChange={(e) =>
                        setQty(p.product, parseInt(e.target.value.replace(/\D/g, "")) || 0)
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
                    <Btn size="sm" variant="green" onClick={() => setQty(p.product, qty + 1)}>
                      +
                    </Btn>
                  </div>
                )}
              </div>

              {canSplit && (rawQty > 0 || it.oldBox) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <button
                    onClick={() => toggleOldBox(p.product)}
                    title="Клиент забирает в своей таре — указать отдельно белого и тёмного"
                    style={{
                      background: it.oldBox ? "rgba(210,153,34,0.15)" : "var(--s1)",
                      border: `1px solid ${it.oldBox ? "#d29922" : "var(--b1)"}`,
                      borderRadius: 7,
                      padding: "5px 8px",
                      color: it.oldBox ? "#d29922" : "var(--muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📦 старая коробка
                  </button>

                  {splitActive && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>белый</span>
                        <Btn size="sm" variant="ghost" onClick={() => setQtyColor(p.product, "white", qtyWhite - 1)}>
                          −
                        </Btn>
                        <input
                          value={qtyWhite || ""}
                          onChange={(e) =>
                            setQtyColor(p.product, "white", parseInt(e.target.value.replace(/\D/g, "")) || 0)
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
                        <Btn size="sm" variant="green" onClick={() => setQtyColor(p.product, "white", qtyWhite + 1)}>
                          +
                        </Btn>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>тёмный</span>
                        <Btn size="sm" variant="ghost" onClick={() => setQtyColor(p.product, "dark", qtyDark - 1)}>
                          −
                        </Btn>
                        <input
                          value={qtyDark || ""}
                          onChange={(e) =>
                            setQtyColor(p.product, "dark", parseInt(e.target.value.replace(/\D/g, "")) || 0)
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
                        <Btn size="sm" variant="green" onClick={() => setQtyColor(p.product, "dark", qtyDark + 1)}>
                          +
                        </Btn>
                      </div>
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
