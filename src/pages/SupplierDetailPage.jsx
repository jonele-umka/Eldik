import { useMemo, useState } from "react";
import { fmtM } from "../utils/index.js";
import { KPI, TableWrap, TR, TD, TH } from "../components/UI.jsx";
import {
  Btn,
  IconBtn,
  Modal,
  Field,
  TextInput,
  DateField,
  SelectField,
  Toolbar,
  todayString,
} from "../components/Form.jsx";
import OpeningBalanceModal from "../components/OpeningBalanceModal.jsx";
import { S } from "../utils/styles.js";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import {
  deleteOffset,
  deleteOpeningBalance,
  deletePurchase,
  deleteSupplierPayment,
  saveOffset,
  savePurchase,
  saveSupplierPayment,
  updateOffset,
  updatePurchase,
  updateSupplierPayment,
} from "../services/api.js";
import { dateTimeKey, fmtDateTime, isOffsetSupplierPayment, norm } from "../utils/ledger.js";

const TYPE_META = {
  opening: { label: "📌 Нач. остаток", color: "#d29922", sign: "+" },
  purchase: { label: "📦 Поступление", color: "var(--green)", sign: "+" },
  payment: { label: "💵 Наша оплата", color: "#ea580c", sign: "−" },
  offset: { label: "🔁 Взаимозачёт", color: "#a371f7", sign: "−" },
};

export default function SupplierDetailPage({
  supplier,
  purchases,
  payments,
  offsets,
  openingBalances,
  debtors,
  debtRow,
  onBack,
}) {
  const key = norm(supplier);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const { data, mutate } = useData();
  const { toast, confirm } = useUI();

  const rawMaterials = arr(data.rawMaterials);

  const [modal, setModal] = useState(null); // 'purchase' | 'payment' | 'offset' | 'opening'
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const entries = useMemo(() => {
    const list = [
      ...arr(openingBalances)
        .filter((o) => o.type === "supplier" && norm(o.name) === key)
        .map((o) => ({
          kind: "opening",
          id: o.id,
          date: o.date,
          amount: Number(o.amount || 0),
          title: "Долг до начала учёта",
          detail: "",
          comment: o.comment,
          raw: o,
        })),
      ...arr(purchases)
        .filter((p) => norm(p.supplier) === key)
        .map((p) => ({
          kind: "purchase",
          id: p.id,
          date: p.date,
          amount: Number(p.amount || 0),
          title: p.product || "Товар",
          detail: "",
          comment: p.comment,
          raw: p,
        })),
      ...arr(payments)
        .filter((p) => norm(p.supplier) === key && !isOffsetSupplierPayment(p))
        .map((p) => ({
          kind: "payment",
          id: p.id,
          date: p.date,
          amount: Number(p.amount || 0),
          title: "Наша оплата",
          detail: "",
          comment: p.comment,
          raw: p,
        })),
      ...arr(offsets)
        .filter((o) => norm(o.supplier) === key)
        .map((o) => ({
          kind: "offset",
          id: o.id,
          date: o.date,
          amount: Number(o.amount || 0),
          title: `Взаимозачёт: ${o.client}`,
          detail: "клиент заплатил вместо нас",
          comment: o.comment,
          raw: o,
        })),
    ];
    return list.sort((a, b) => dateTimeKey(b.date) - dateTimeKey(a.date));
  }, [purchases, payments, offsets, openingBalances, key]);

  const totals = useMemo(() => {
    const sum = (k) =>
      entries.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
    return {
      opening: sum("opening"),
      purchase: sum("purchase"),
      payment: sum("payment"),
      offset: sum("offset"),
    };
  }, [entries]);

  const debt = debtRow
    ? Number(debtRow.debt || 0)
    : totals.opening + totals.purchase - totals.payment - totals.offset;

  const clientDebtors = arr(debtors);

  /* ─── формы ─── */
  const openModal = (kind) => {
    if (kind === "purchase")
      setForm({ date: todayString(), product: "", amount: "", comment: "" });
    if (kind === "payment") setForm({ date: todayString(), amount: "", comment: "" });
    if (kind === "offset")
      setForm({ date: todayString(), client: "", amount: "", comment: "" });
    setModal(kind);
  };

  const openEdit = (entry) => {
    if (entry.kind === "purchase") {
      setForm({
        id: entry.id,
        date: String(entry.date || "").split(" ")[0],
        product: entry.raw.product || "",
        amount: String(entry.raw.amount ?? entry.amount ?? ""),
        comment: entry.raw.comment || "",
      });
      setModal("purchase");
    } else if (entry.kind === "payment") {
      setForm({
        id: entry.id,
        date: String(entry.date || "").split(" ")[0],
        amount: String(entry.amount),
        comment: entry.raw.comment || "",
      });
      setModal("payment");
    } else if (entry.kind === "offset") {
      setForm({
        id: entry.id,
        date: String(entry.date || "").split(" ")[0],
        client: entry.raw.client,
        amount: String(entry.amount),
        comment: entry.raw.comment || "",
      });
      setModal("offset");
    } else if (entry.kind === "opening") {
      setForm({ entry: entry.raw });
      setModal("opening");
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      if (modal === "purchase") {
        const sum = Number(form.amount);
        if (!form.product.trim()) return toast("Укажите, что привезли", "err");
        if (!sum || sum <= 0) return toast("Укажите сумму", "err");
        const payload = {
          supplier,
          product: form.product.trim(),
          quantity: 1,
          price: sum,
          date: form.date,
          comment: form.comment,
        };
        await mutate(
          () => (form.id ? updatePurchase({ id: form.id, ...payload }) : savePurchase(payload)),
          AFFECTS.purchase,
        );
      } else if (modal === "payment") {
        const amount = Number(form.amount);
        if (!amount || amount <= 0) return toast("Укажите сумму", "err");
        await mutate(
          () =>
            form.id
              ? updateSupplierPayment({
                  id: form.id,
                  amount,
                  date: form.date,
                  comment: form.comment,
                })
              : saveSupplierPayment({
                  supplier,
                  amount,
                  date: form.date,
                  comment: form.comment,
                }),
          AFFECTS.supplierPayment,
        );
      } else if (modal === "offset") {
        const amount = Number(form.amount);
        if (!form.id && !form.client) return toast("Выберите клиента", "err");
        if (!amount || amount <= 0) return toast("Укажите сумму", "err");
        await mutate(
          () =>
            form.id
              ? updateOffset({ id: form.id, amount, date: form.date, comment: form.comment })
              : saveOffset({
                  client: form.client,
                  supplier,
                  amount,
                  date: form.date,
                  comment: form.comment,
                  market:
                    clientDebtors.find((c) => c.client === form.client)?.market || "",
                }),
          AFFECTS.offset,
        );
      }
      toast("Сохранено", "ok");
      setModal(null);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = (entry) =>
    confirm({
      title: "Удалить запись?",
      text:
        entry.kind === "offset"
          ? "Взаимозачёт удалится целиком — и у поставщика, и у клиента."
          : "Действие нельзя отменить.",
      danger: true,
      onConfirm: async () => {
        try {
          if (entry.kind === "purchase")
            await mutate(() => deletePurchase(entry.id), AFFECTS.purchase);
          else if (entry.kind === "payment")
            await mutate(() => deleteSupplierPayment(entry.id), AFFECTS.supplierPayment);
          else if (entry.kind === "offset")
            await mutate(() => deleteOffset(entry.id), AFFECTS.offset);
          else if (entry.kind === "opening")
            await mutate(() => deleteOpeningBalance(entry.id), AFFECTS.opening);
          toast("Удалено", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Btn variant="ghost" onClick={onBack}>
          ← Назад
        </Btn>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>🏭 {supplier}</h2>
      </div>

      <div style={S.kpiGrid}>
        <KPI label="Наш долг сейчас" value={fmtM(debt)} color="var(--red)" />
        <KPI label="Привезено всего" value={fmtM(totals.purchase)} color="var(--green)" />
        <KPI label="Оплачено" value={fmtM(totals.payment)} color="#ea580c" />
        <KPI label="Через взаимозачёт" value={fmtM(totals.offset)} color="#a371f7" />
        <KPI label="Нач. остаток" value={fmtM(totals.opening)} color="#d29922" />
      </div>

      <Toolbar>
        <Btn variant="green" onClick={() => openModal("purchase")}>
          📦 Поступление
        </Btn>
        <Btn variant="warn" onClick={() => openModal("payment")}>
          💵 Оплата поставщику
        </Btn>
        <Btn variant="purple" onClick={() => openModal("offset")}>
          🔁 Взаимозачёт
        </Btn>
        <Btn variant="ghost" onClick={() => { setForm({}); setModal("opening"); }}>
          📌 Начальный остаток
        </Btn>
      </Toolbar>

      <TableWrap title="История операций" count={`${entries.length}`}>
        <thead>
          <tr style={{ background: "var(--s2)" }}>
            {["Дата", "Тип", "Детали", "Комментарий", "Сумма", ""].map((h, i) => (
              <TH key={i}>{h}</TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                История пуста
              </td>
            </tr>
          ) : (
            entries.map((e, i) => {
              const t = TYPE_META[e.kind];
              return (
                <TR key={`${e.kind}_${e.id || i}`}>
                  <TD>{fmtDateTime(e.date)}</TD>
                  <TD>
                    <span style={{ color: t.color, fontWeight: 600 }}>{t.label}</span>
                  </TD>
                  <TD>
                    {e.title}
                    {e.detail ? ` — ${e.detail}` : ""}
                  </TD>
                  <TD style={{ color: "var(--muted)" }}>{e.comment || "—"}</TD>
                  <TD style={{ fontFamily: "JetBrains Mono, monospace", color: t.color }}>
                    {t.sign}
                    {fmtM(e.amount)}
                  </TD>
                  <TD>
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconBtn title="Изменить" onClick={() => openEdit(e)}>
                        ✏️
                      </IconBtn>
                      <IconBtn title="Удалить" color="var(--red)" onClick={() => remove(e)}>
                        🗑
                      </IconBtn>
                    </div>
                  </TD>
                </TR>
              );
            })
          )}
        </tbody>
      </TableWrap>

      {/* Поступление */}
      <Modal
        open={modal === "purchase"}
        onClose={() => !saving && setModal(null)}
        title={form.id ? "Изменить поступление" : "Поступление товара"}
        subtitle={supplier}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="green" onClick={save} loading={saving}>
              Записать долг
            </Btn>
          </>
        }
      >
        <Field label="Поставщик">
          <TextInput value={supplier} disabled />
        </Field>
        <Field label="Что привезли">
          <TextInput
            placeholder="Например: мука 20 мешков"
            value={form.product || ""}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
          />
        </Field>
        <Field label="Дата">
          <DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </Field>
        <Field label="Сумма, сом">
          <TextInput
            inputMode="decimal"
            value={form.amount || ""}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
        <Field label="Комментарий">
          <TextInput
            value={form.comment || ""}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
        </Field>
      </Modal>

      {/* Оплата */}
      <Modal
        open={modal === "payment"}
        onClose={() => !saving && setModal(null)}
        title={form.id ? "Изменить оплату" : "Прямая оплата поставщику"}
        subtitle={supplier}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="warn" onClick={save} loading={saving}>
              Сохранить оплату
            </Btn>
          </>
        }
      >
        <Field label="Дата">
          <DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </Field>
        <Field label="Сумма, сом">
          <TextInput
            inputMode="numeric"
            value={form.amount || ""}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
        <Field label="Назначение">
          <TextInput
            placeholder="например: за муку"
            value={form.comment || ""}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
        </Field>
      </Modal>

      {/* Взаимозачёт */}
      <Modal
        open={modal === "offset"}
        onClose={() => !saving && setModal(null)}
        title={form.id ? "Изменить взаимозачёт" : "Взаимозачёт"}
        subtitle="Клиент платит поставщику вместо нас"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="purple" onClick={save} loading={saving}>
              Провести зачёт
            </Btn>
          </>
        }
      >
        <Field label="Клиент-должник">
          {form.id ? (
            <TextInput value={form.client} disabled />
          ) : (
            <SelectField
              value={form.client || ""}
              onChange={(v) => {
                const c = clientDebtors.find((x) => x.client === v);
                setForm({
                  ...form,
                  client: v,
                  amount: String(Math.round(Math.min(Number(c?.debt || 0), Math.max(debt, 0)))),
                });
              }}
              options={clientDebtors.map((c) => ({
                value: c.client,
                label: `${c.client} — долг ${fmtM(c.debt)}`,
              }))}
              placeholder="— выберите —"
            />
          )}
        </Field>
        <Field label="Дата">
          <DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </Field>
        <Field label="Сумма, сом">
          <TextInput
            inputMode="numeric"
            value={form.amount || ""}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
        <Field label="Комментарий">
          <TextInput
            value={form.comment || ""}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
        </Field>
      </Modal>

      {modal === "opening" && (
        <OpeningBalanceModal
          open
          type="supplier"
          fixedName={supplier}
          entry={form.entry}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
