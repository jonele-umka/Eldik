// Карточка заказа со всем функционалом мобильного orderDetail:
// правка состава, статус, оплаты, возвраты, удаление, печать накладной.
import { useMemo, useState } from "react";
import {
  Modal,
  Btn,
  IconBtn,
  Field,
  TextInput,
  DateField,
  SelectField,
  todayString,
} from "./Form.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { ProductThumb } from "./UI.jsx";
import {
  addOrderRow,
  deleteOrder,
  deleteOrderRow,
  deletePayment,
  savePayment,
  saveReturn,
  updateOrder,
  updatePayment,
  updateStatus,
} from "../services/api.js";
import { priceOf } from "../utils/promo.js";
import { fmtM } from "../utils/index.js";
import { printInvoice } from "../utils/invoice.js";

const norm = (s) => String(s || "").trim().toLowerCase();

export default function OrderDetailModal({ group, onClose }) {
  const { data, mutate, refresh } = useData();
  const { toast, confirm } = useUI();

  const clients = Array.isArray(data.clients) ? data.clients : [];
  const prices = Array.isArray(data.prices) ? data.prices : [];
  const allPayments = Array.isArray(data.payments) ? data.payments : [];
  const allReturns = Array.isArray(data.returns) ? data.returns : [];

  const [market, setMarket] = useState(group.market || "");
  const [client, setClient] = useState(group.client || "");
  const [orderDate, setOrderDate] = useState((group.orderDate || "").split(" ")[0]);
  const [deliveryDate, setDeliveryDate] = useState(
    (group.deliveryDate || "").split(" ")[0],
  );
  const [status, setStatus] = useState(group.status || "Новый");
  const [rows, setRows] = useState(() =>
    group.rows.map((r) => ({
      id: r.id,
      product: r.product,
      quantity: String(r.paidQuantity ?? r.quantity ?? 0),
      comment: r.comment || "",
    })),
  );
  const [busy, setBusy] = useState(false);

  // формы
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayString());
  const [editingPay, setEditingPay] = useState(null);
  const [retProduct, setRetProduct] = useState("");
  const [retQty, setRetQty] = useState("1");
  const [addProduct, setAddProduct] = useState("");

  const markets = useMemo(
    () => [...new Set(clients.map((c) => c.market).filter(Boolean))].sort(),
    [clients],
  );
  const marketClients = useMemo(
    () => clients.filter((c) => c.market === market).map((c) => c.name),
    [clients, market],
  );

  const priceRowOf = (product) => prices.find((p) => p.product === product);
  const priceFor = (product) => priceOf(priceRowOf(product), market);

  const orderPayments = useMemo(
    () =>
      allPayments.filter(
        (p) => String(p.orderId || "").trim() === String(group.oid).trim(),
      ),
    [allPayments, group.oid],
  );

  const returnedByProduct = useMemo(() => {
    const map = {};
    allReturns
      .filter((r) => norm(r.client) === norm(group.client))
      .forEach((r) => {
        const key = String(r.product || "").trim();
        if (!key) return;
        map[key] = (map[key] || 0) + Number(r.quantity || 0);
      });
    return map;
  }, [allReturns, group.client]);

  const totalSum = rows.reduce(
    (s, r) => s + (Number(r.quantity) || 0) * priceFor(r.product),
    0,
  );
  const paidAmount = orderPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const returnedAmount = Number(group.returnedAmount || 0);
  const netSum = totalSum - returnedAmount;
  const debt = Math.max(0, netSum - paidAmount);

  /* ─── состав заказа ─── */
  const setRow = (i, patch) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleRemoveRow = (i) => {
    const row = rows[i];
    const isNew = !row.id || String(row.id).startsWith("NEW_");
    confirm({
      title: "Удалить товар?",
      text: `${row.product} будет убран из заказа.`,
      danger: true,
      onConfirm: async () => {
        if (isNew) {
          setRows((prev) => prev.filter((_, idx) => idx !== i));
          return;
        }
        try {
          setBusy(true);
          await mutate(() => deleteOrderRow(row.id), AFFECTS.order);
          setRows((prev) => prev.filter((_, idx) => idx !== i));
          toast("Товар удалён", "ok");
        } catch (e) {
          toast(e.message, "err");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleAddProduct = () => {
    if (!addProduct) return;
    if (rows.some((r) => r.product === addProduct))
      return toast("Этот товар уже в заказе", "err");
    setRows((prev) => [
      { id: "NEW_" + Date.now(), product: addProduct, quantity: "1", comment: "" },
      ...prev,
    ]);
    setAddProduct("");
  };

  const handleSaveChanges = async () => {
    if (!rows.length) return toast("В заказе должен быть хотя бы один товар", "err");
    try {
      setBusy(true);
      for (const row of rows) {
        const qty = Number(row.quantity) || 0;
        const item = {
          product: row.product,
          quantity: qty,
          paidQuantity: qty,
          giftQty: 0,
          finalQuantity: qty,
          comment: row.comment || "",
        };
        const payload = {
          orderId: group.oid,
          orderDate,
          client,
          market,
          deliveryDate,
          status,
          items: [item],
        };
        const isNew = !row.id || String(row.id).startsWith("NEW_");
        if (isNew) await addOrderRow(payload);
        else await updateOrder({ rowId: row.id, ...payload });
      }
      await refresh(AFFECTS.order);
      toast("Изменения сохранены", "ok");
      onClose();
    } catch (e) {
      toast("Не удалось сохранить: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async () => {
    const next = status === "Доставлен" ? "Новый" : "Доставлен";
    try {
      setBusy(true);
      await mutate(() => updateStatus(group.oid, next), ["orders"]);
      setStatus(next);
      toast(`Статус: ${next}`, "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOrder = () =>
    confirm({
      title: "Удалить заказ?",
      text: `Заказ клиента «${group.client}» будет удалён вместе с платежами и возвратами по нему.`,
      danger: true,
      onConfirm: async () => {
        try {
          setBusy(true);
          await mutate(() => deleteOrder(group.oid), [
            ...AFFECTS.order,
            "payments",
            "returns",
          ]);
          toast("Заказ удалён", "ok");
          onClose();
        } catch (e) {
          toast(e.message, "err");
        } finally {
          setBusy(false);
        }
      },
    });

  /* ─── оплаты ─── */
  const handleAddPayment = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast("Введите сумму", "err");
    if (amount > debt + 0.5) return toast("Сумма больше остатка долга", "err");
    try {
      setBusy(true);
      await mutate(
        () =>
          savePayment({
            orderId: group.oid,
            client: group.client,
            market: group.market,
            orderDate,
            amount,
            paymentDate: payDate,
          }),
        AFFECTS.payment,
      );
      setPayAmount("");
      toast("Оплата внесена", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdatePayment = async () => {
    const amount = Number(editingPay.amount);
    if (!amount || amount <= 0) return toast("Введите сумму", "err");
    try {
      setBusy(true);
      await mutate(
        () =>
          updatePayment({
            paymentId: editingPay.id,
            amount,
            paymentDate: editingPay.paymentDate,
          }),
        AFFECTS.payment,
      );
      setEditingPay(null);
      toast("Оплата обновлена", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePayment = (p) =>
    confirm({
      title: "Удалить оплату?",
      text: `${fmtM(p.amount)} — действие необратимо.`,
      danger: true,
      onConfirm: async () => {
        try {
          setBusy(true);
          await mutate(() => deletePayment(p.id), AFFECTS.payment);
          toast("Оплата удалена", "ok");
        } catch (e) {
          toast(e.message, "err");
        } finally {
          setBusy(false);
        }
      },
    });

  /* ─── возврат ─── */
  const handleReturn = async () => {
    if (!retProduct) return toast("Выберите товар", "err");
    const qty = Number(retQty);
    if (!qty || qty <= 0) return toast("Укажите количество", "err");

    const row = rows.find((r) => r.product === retProduct);
    const bought = Number(row?.quantity || 0);
    const already = returnedByProduct[retProduct] || 0;
    if (qty > bought - already)
      return toast(`Можно вернуть не более ${Math.max(0, bought - already)} шт`, "err");

    try {
      setBusy(true);
      const price = priceFor(retProduct);
      await mutate(
        () =>
          saveReturn({
            orderId: group.oid,
            orderDate,
            client: group.client,
            market: group.market,
            product: retProduct,
            quantity: qty,
            price,
          }),
        AFFECTS.return,
      );
      setRetProduct("");
      setRetQty("1");
      toast("Возврат оформлен", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const sectionTitle = (t) => (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: ".06em",
        color: "var(--muted)",
        margin: "18px 0 8px",
      }}
    >
      {t}
    </div>
  );

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      width={860}
      title={`Заказ № ${String(group.oid).slice(-8)} · ${group.client}`}
      subtitle={`${group.market} · создан ${group.orderDate || "—"}`}
      footer={
        <>
          <Btn variant="danger" onClick={handleDeleteOrder} disabled={busy} style={{ marginRight: "auto" }}>
            🗑 Удалить заказ
          </Btn>
          <Btn
            variant="ghost"
            onClick={() =>
              printInvoice({
                order: { ...group, market, client, deliveryDate, orderDate, status },
                rows,
                priceOfRow: (r) => priceFor(r.product),
              })
            }
          >
            🖨 Накладная
          </Btn>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>
            Закрыть
          </Btn>
          <Btn variant="primary" onClick={handleSaveChanges} loading={busy}>
            Сохранить
          </Btn>
        </>
      }
    >
      {/* Финансы */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
          gap: 8,
          marginBottom: 6,
        }}
      >
        {[
          ["Сумма чека", fmtM(netSum), "var(--accent)"],
          ["Оплачено", fmtM(paidAmount), "var(--green)"],
          ["Возвраты", fmtM(returnedAmount), "var(--yellow)"],
          ["Остаток", fmtM(debt), debt > 0 ? "var(--red)" : "var(--green)"],
        ].map(([l, v, c]) => (
          <div
            key={l}
            style={{
              background: "var(--s2)",
              border: "1px solid var(--b1)",
              borderRadius: 9,
              padding: "9px 11px",
            }}
          >
            <div style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase" }}>
              {l}
            </div>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 14,
                color: c,
                fontWeight: 600,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* Шапка заказа */}
      {sectionTitle("Информация о заказе")}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 10,
        }}
      >
        <Field label="Рынок">
          <SelectField
            value={market}
            onChange={(v) => {
              setMarket(v);
              const first = clients.find((c) => c.market === v);
              setClient(first?.name || "");
            }}
            options={markets}
            placeholder="—"
          />
        </Field>
        <Field label="Клиент">
          <SelectField value={client} onChange={setClient} options={marketClients} placeholder="—" />
        </Field>
        <Field label="Дата заявки">
          <DateField value={orderDate} onChange={setOrderDate} />
        </Field>
        <Field label="Дата доставки">
          <DateField value={deliveryDate} onChange={setDeliveryDate} />
        </Field>
        <Field label="Статус">
          <Btn
            variant={status === "Доставлен" ? "green" : "warn"}
            onClick={handleToggleStatus}
            disabled={busy}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {status === "Доставлен" ? "✅ Доставлен" : "🚚 Новый"}
          </Btn>
        </Field>
      </div>

      {/* Состав */}
      {sectionTitle("Товары в заказе")}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <SelectField
          value={addProduct}
          onChange={setAddProduct}
          options={prices.map((p) => p.product)}
          placeholder="— добавить товар —"
        />
        <Btn variant="green" onClick={handleAddProduct} disabled={!addProduct}>
          + Добавить
        </Btn>
      </div>

      {rows.map((r, i) => {
        const qty = Number(r.quantity) || 0;
        const price = priceFor(r.product);
        return (
          <div
            key={r.id || r.product}
            style={{
              border: "1px solid var(--b1)",
              background: "var(--s2)",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <ProductThumb src={priceRowOf(r.product)?.image} size={32} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.product}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {price} сом / шт
                </div>
              </div>

              <input
                value={r.quantity}
                onChange={(e) => setRow(i, { quantity: e.target.value.replace(/\D/g, "") })}
                style={{
                  width: 70,
                  textAlign: "center",
                  background: "var(--s1)",
                  border: "1px solid var(--b1)",
                  borderRadius: 8,
                  color: "var(--text)",
                  padding: "6px 4px",
                  fontFamily: "JetBrains Mono, monospace",
                  outline: "none",
                }}
              />

              <div
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                  minWidth: 90,
                  textAlign: "right",
                }}
              >
                {fmtM(qty * price)}
              </div>

              <IconBtn title="Удалить" color="var(--red)" onClick={() => handleRemoveRow(i)}>
                ✕
              </IconBtn>
            </div>

            <TextInput
              placeholder="Комментарий к товару..."
              value={r.comment}
              onChange={(e) => setRow(i, { comment: e.target.value })}
              style={{ marginTop: 8, fontSize: 12.5 }}
            />
          </div>
        );
      })}

      {/* Оплаты */}
      {sectionTitle(`Оплаты по заказу (${orderPayments.length})`)}
      {orderPayments.map((p) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(63,185,80,.07)",
            border: "1px solid rgba(63,185,80,.3)",
            borderRadius: 9,
            padding: "8px 11px",
            marginBottom: 6,
          }}
        >
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>
            📅 {String(p.paymentDate || "").split(" ")[0]}
          </span>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--green)",
              fontWeight: 600,
            }}
          >
            {fmtM(p.amount)}
          </span>
          <IconBtn
            title="Изменить"
            onClick={() =>
              setEditingPay({
                id: p.id,
                amount: String(p.amount),
                paymentDate: String(p.paymentDate || "").split(" ")[0],
              })
            }
          >
            ✏️
          </IconBtn>
          <IconBtn title="Удалить" color="var(--red)" onClick={() => handleDeletePayment(p)}>
            🗑
          </IconBtn>
        </div>
      ))}

      {editingPay ? (
        <div
          style={{
            border: "1px solid var(--accent)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <Field label="Дата">
                <DateField
                  value={editingPay.paymentDate}
                  onChange={(v) => setEditingPay((s) => ({ ...s, paymentDate: v }))}
                />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <Field label="Сумма">
                <TextInput
                  inputMode="numeric"
                  value={editingPay.amount}
                  onChange={(e) => setEditingPay((s) => ({ ...s, amount: e.target.value }))}
                />
              </Field>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="primary" onClick={handleUpdatePayment} loading={busy}>
              Сохранить оплату
            </Btn>
            <Btn variant="ghost" onClick={() => setEditingPay(null)}>
              Отмена
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 130 }}>
            <Field label="Дата оплаты">
              <DateField value={payDate} onChange={setPayDate} />
            </Field>
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <Field label="Сумма">
              <TextInput
                inputMode="numeric"
                placeholder="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </Field>
          </div>
          <Btn variant="green" onClick={handleAddPayment} loading={busy} style={{ marginBottom: 12 }}>
            💵 Внести оплату
          </Btn>
        </div>
      )}

      {/* Возврат */}
      {sectionTitle("Оформить возврат")}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 2, minWidth: 170 }}>
          <Field label="Товар">
            <SelectField
              value={retProduct}
              onChange={setRetProduct}
              options={rows.map((r) => {
                const already = returnedByProduct[r.product] || 0;
                const left = Math.max(0, (Number(r.quantity) || 0) - already);
                return { value: r.product, label: `${r.product} — можно ${left} шт` };
              })}
              placeholder="— выберите —"
            />
          </Field>
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <Field label="Количество">
            <TextInput
              inputMode="numeric"
              value={retQty}
              onChange={(e) => setRetQty(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>
        <Btn variant="warn" onClick={handleReturn} loading={busy} style={{ marginBottom: 12 }}>
          ↩️ Возврат
        </Btn>
      </div>
    </Modal>
  );
}
