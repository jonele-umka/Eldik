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
import { calcPromo, priceOf, usePromo } from "../utils/promo.js";
import { fmtM } from "../utils/index.js";

export default function CreateOrderModal({ open, onClose, defaultClient }) {
  const { data, mutate } = useData();
  const { toast } = useUI();
  const { promoEnabled, togglePromo } = usePromo();

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

  const shownProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prices.filter((p) => !q || String(p.product).toLowerCase().includes(q));
  }, [prices, search]);

  const setQty = (product, qty) =>
    setItems((prev) => ({
      ...prev,
      [product]: { ...(prev[product] || { comment: "" }), qty: Math.max(0, qty) },
    }));

  const setComment = (product, comment) =>
    setItems((prev) => ({
      ...prev,
      [product]: { ...(prev[product] || { qty: 0 }), comment },
    }));

  const totals = useMemo(() => {
    let boxes = 0;
    let sum = 0;
    Object.entries(items).forEach(([product, it]) => {
      const qty = Number(it?.qty || 0);
      if (!qty) return;
      const row = prices.find((p) => p.product === product);
      boxes += qty;
      sum += qty * priceOf(row, market);
    });
    return { boxes, sum };
  }, [items, prices, market]);

  const handleSave = async () => {
    if (!market) return toast("Выберите рынок", "err");
    if (!client) return toast("Выберите клиента", "err");

    const orderItems = Object.entries(items)
      .filter(([, it]) => Number(it?.qty || 0) > 0)
      .map(([product, it]) => {
        const promo = calcPromo(it.qty, promoEnabled);
        return {
          product,
          quantity: promo.paidQty,
          paidQuantity: promo.paidQty,
          giftQty: promo.giftQty,
          finalQuantity: promo.finalQty,
          comment: it.comment || "",
        };
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

      <div
        onClick={togglePromo}
        style={{
          cursor: "pointer",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 600,
          background: promoEnabled ? "rgba(63,185,80,.15)" : "var(--s2)",
          border: `1px solid ${promoEnabled ? "var(--green)" : "var(--b1)"}`,
          color: promoEnabled ? "var(--green)" : "var(--muted)",
        }}
      >
        {promoEnabled ? "🎁 Акция включена: +1 за каждые 10" : "🎁 Акция выключена"}
      </div>

      <TextInput
        placeholder="🔍 Поиск товара..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {shownProducts.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
            Товар не найден
          </div>
        )}

        {shownProducts.map((p) => {
          const it = items[p.product] || { qty: 0, comment: "" };
          const qty = Number(it.qty || 0);
          const promo = calcPromo(qty, promoEnabled);
          const price = priceOf(p, market);

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
                    {price} сом / шт
                    {promo.giftQty > 0 && (
                      <span style={{ color: "var(--green)", marginLeft: 8 }}>
                        🎁 +{promo.giftQty} (выдача {promo.finalQty})
                      </span>
                    )}
                  </div>
                </div>

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
              </div>

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
