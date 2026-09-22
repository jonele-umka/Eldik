import { useMemo, useState } from "react";
import { fmtM, buildOrderGroups, parseDate } from "../utils/index.js";
import { dateTimeKey, fmtDateTime } from "../utils/ledger.js";
import { KPI, TableWrap, TR, TD, TH, MoneyCell } from "../components/UI.jsx";
import { OrderCard } from "../components/OrderCard.jsx";
import { S } from "../utils/styles.js";
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
import CreateOrderModal from "../components/CreateOrderModal.jsx";
import OrderDetailModal from "../components/OrderDetailModal.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import {
  deleteOffset,
  deleteOpeningBalance,
  deletePayment,
  saveOffset,
  savePayment,
  updateOffset,
  updatePayment,
} from "../services/api.js";

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

function LedgerEntry({ entry, onEdit, onDelete }) {
  const meta = {
    opening: {
      icon: "📌",
      color: "#d29922",
      bg: "rgba(210,153,34,0.10)",
      title: "Начальный остаток долга",
    },

    payment: {
      icon: "💵",
      color: "var(--green)",
      bg: "rgba(63,185,80,0.08)",
      title: "Оплата",
    },

    offset: {
      icon: "🔁",
      color: "#a371f7",
      bg: "rgba(163,113,247,0.08)",
      title: "Взаимозачёт",
    },
  }[entry.kind];

  const displayAmount = Math.abs(entry.amount);

  const sign = entry.kind === "opening" ? "" : "−";

  return (
    <div
      style={{
        background: meta.bg,
        border: `1px solid ${meta.color}33`,
        borderLeft: `4px solid ${meta.color}`,
        borderRadius: 14,
        padding: "14px 16px",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: meta.color,
            fontSize: 14,
          }}
        >
          {meta.icon} {meta.title}
          {entry.kind === "offset" && entry.supplier && (
            <span
              style={{
                fontWeight: 500,
                color: "var(--text)",
              }}
            >
              {" "}
              → {entry.supplier}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700,
              fontSize: 15,
              color: meta.color,
              whiteSpace: "nowrap",
            }}
          >
            {sign}
            {fmtM(displayAmount)}
          </span>
          {onEdit && (
            <IconBtn title="Изменить" onClick={() => onEdit(entry)}>
              ✏️
            </IconBtn>
          )}
          {onDelete && (
            <IconBtn title="Удалить" color="var(--red)" onClick={() => onDelete(entry)}>
              🗑
            </IconBtn>
          )}
        </div>
      </div>

      {entry.kind === "offset" && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            marginTop: 4,
          }}
        >
          клиент заплатил напрямую поставщику, деньги к нам не поступали
        </div>
      )}

      {entry.kind === "opening" && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            marginTop: 4,
          }}
        >
          Долг, существовавший до начала учёта в приложении
        </div>
      )}

      {entry.comment && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            marginTop: 4,
          }}
        >
          💬 {entry.comment}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 11.5,
          color: "var(--muted)",
        }}
      >
        <span>📅 {fmtDateTime(entry.date)}</span>

        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          остаток: {fmtM(entry.balanceAfter)}
        </span>
      </div>
    </div>
  );
}

export default function ClientDetailPage({
  client,
  orders,
  payments,
  returns,
  offsets,
  openingBalances,
  debtRow,
  isMobile,
  onBack,
}) {
  const clientKey = norm(client);

  const arr = (x) => (Array.isArray(x) ? x : []);

  const { data: store, mutate } = useData();
  const { toast, confirm } = useUI();

  const [modal, setModal] = useState(null); // 'payment' | 'offset' | 'opening'
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [openOrder, setOpenOrder] = useState(null);

  const clientRow = arr(store.clients).find((c) => norm(c.name) === clientKey);
  const clientMarket = clientRow?.market || "";
  const suppliersList = arr(store.suppliers);

  const openModal = (kind) => {
    if (kind === "payment") setForm({ date: todayString(), amount: "" });
    if (kind === "offset")
      setForm({ date: todayString(), supplier: "", amount: "", comment: "" });
    setModal(kind);
  };

  const handleEditEntry = (entry) => {
    if (entry.kind === "payment") {
      setForm({
        id: entry.id,
        date: String(entry.date || "").split(" ")[0],
        amount: String(Math.abs(entry.amount)),
      });
      setModal("payment");
    } else if (entry.kind === "offset") {
      setForm({
        id: entry.id,
        date: String(entry.date || "").split(" ")[0],
        supplier: entry.supplier,
        amount: String(Math.abs(entry.amount)),
        comment: entry.comment || "",
      });
      setModal("offset");
    } else if (entry.kind === "opening") {
      setForm({
        entry: {
          id: entry.id,
          name: client,
          amount: Math.abs(entry.amount),
          date: entry.date,
          comment: entry.comment,
        },
      });
      setModal("opening");
    }
  };

  const handleDeleteEntry = (entry) =>
    confirm({
      title: "Удалить запись?",
      text:
        entry.kind === "offset"
          ? "Взаимозачёт удалится целиком — и у клиента, и у поставщика."
          : "Действие нельзя отменить.",
      danger: true,
      onConfirm: async () => {
        try {
          if (entry.kind === "payment")
            await mutate(() => deletePayment(entry.id), AFFECTS.payment);
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

  const saveModal = async () => {
    try {
      setSaving(true);
      if (modal === "payment") {
        const amount = Number(form.amount);
        if (!amount || amount <= 0) return toast("Укажите сумму", "err");
        await mutate(
          () =>
            form.id
              ? updatePayment({ paymentId: form.id, amount, paymentDate: form.date })
              : savePayment({
                  client,
                  market: clientMarket,
                  amount,
                  paymentDate: form.date,
                }),
          AFFECTS.payment,
        );
      } else if (modal === "offset") {
        const amount = Number(form.amount);
        if (!form.id && !form.supplier) return toast("Выберите поставщика", "err");
        if (!amount || amount <= 0) return toast("Укажите сумму", "err");
        await mutate(
          () =>
            form.id
              ? updateOffset({ id: form.id, amount, date: form.date, comment: form.comment })
              : saveOffset({
                  client,
                  supplier: form.supplier,
                  amount,
                  date: form.date,
                  comment: form.comment,
                  market: clientMarket,
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

  // =========================
  // ЗАКАЗЫ КЛИЕНТА
  // =========================

  const clientOrders = useMemo(
    () => arr(orders).filter((o) => norm(o.client) === clientKey),
    [orders, clientKey],
  );

  // =========================
  // ВСЕ ПЛАТЕЖИ КЛИЕНТА
  // =========================

  const allClientPayments = useMemo(
    () => arr(payments).filter((p) => norm(p.client) === clientKey),
    [payments, clientKey],
  );

  // =========================
  // ПРЯМЫЕ ОПЛАТЫ
  // =========================
  //
  // При взаимозачёте backend создаёт
  // служебную запись с:
  //
  // OFFSET:OFS_XXXXXXXX
  //
  // Её здесь НЕ считаем как обычную оплату.
  //

  const directPayments = useMemo(
    () =>
      allClientPayments.filter(
        (p) =>
          !String(p.orderId || "")
            .trim()
            .startsWith("OFFSET:"),
      ),
    [allClientPayments],
  );

  // =========================
  // ВОЗВРАТЫ
  // =========================

  const clientReturns = useMemo(
    () => arr(returns).filter((r) => norm(r.client) === clientKey),
    [returns, clientKey],
  );

  // =========================
  // ВЗАИМОЗАЧЁТЫ
  // =========================

  const clientOffsets = useMemo(
    () => arr(offsets).filter((o) => norm(o.client) === clientKey),
    [offsets, clientKey],
  );

  // =========================
  // НАЧАЛЬНЫЕ ОСТАТКИ
  // =========================

  const clientOpening = useMemo(
    () =>
      arr(openingBalances).filter(
        (o) => o.type === "client" && norm(o.name) === clientKey,
      ),
    [openingBalances, clientKey],
  );

  // =========================
  // ГРУППЫ ЗАКАЗОВ
  // =========================

  const groups = useMemo(() => {
    // Получаем обычные заказы
    const baseGroups = buildOrderGroups(clientOrders);

    // Для распределения зачётов сортируем от старого заказа к новому.
    // Старый долг закрывается первым.
    const sortedOldestFirst = [...baseGroups].sort(
      (a, b) => parseDate(a.orderDate) - parseDate(b.orderDate),
    );

    // Общая сумма взаимозачётов клиента
    let remainingOffset = clientOffsets.reduce(
      (sum, offset) => sum + Number(offset.amount || 0),
      0,
    );

    // Распределяем взаимозачёт по заказам
    const withOffsets = sortedOldestFirst.map((group) => {
      const totalSum = Number(group.totalSum || 0);
      const returnedAmount = Number(group.returnedAmount || 0);
      const paidAmount = Number(group.paidAmount || 0);

      // Реальная сумма, которую нужно погасить
      const effectiveTotal = Math.max(0, totalSum - returnedAmount);

      // Сколько осталось после обычной оплаты
      const remainingDebt = Math.max(0, effectiveTotal - paidAmount);

      // Из зачёта берём только столько,
      // сколько нужно этому заказу
      const offsetAmount = Math.min(remainingOffset, remainingDebt);

      remainingOffset -= offsetAmount;

      return {
        ...group,
        offsetAmount,

        // Это общая сумма погашения:
        // обычная оплата + взаимозачёт
        totalPaidAmount: paidAmount + offsetAmount,
      };
    });

    // Для отображения новые заказы сверху
    return withOffsets.sort(
      (a, b) => parseDate(b.orderDate) - parseDate(a.orderDate),
    );
  }, [clientOrders, clientOffsets]);
  // =========================
  // ИТОГИ
  // =========================

  const totalSum = groups.reduce((s, g) => s + Number(g.totalSum || 0), 0);

  const retSum = clientReturns.reduce((s, r) => s + Number(r.amount || 0), 0);

  const paidSum = directPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const offsetSum = clientOffsets.reduce(
    (s, o) => s + Number(o.amount || 0),
    0,
  );

  const openingSum = clientOpening.reduce(
    (s, o) => s + Number(o.amount || 0),
    0,
  );

  // =========================
  // ТЕКУЩИЙ ДОЛГ
  // =========================
  //
  // ВАЖНО:
  //
  // Не берём debtRow.debt как единственный
  // источник истины.
  //
  // Считаем непосредственно из данных,
  // включая взаимозачёты.
  //

  const calculatedDebt = totalSum - retSum - paidSum - offsetSum + openingSum;

  const debt = Math.max(0, calculatedDebt);

  // =========================
  // ЕДИНАЯ ЛЕНТА
  // =========================

  const feed = useMemo(() => {
    const events = [
      // Заказы
      ...groups.map((g) => ({
        kind: "order",
        date: g.orderDate,
        amount: Number(g.totalSum || 0),
      })),

      // Начальный остаток
      ...clientOpening.map((o) => ({
        kind: "opening",
        date: o.date,
        amount: Number(o.amount || 0),
        id: o.id,
        comment: o.comment,
      })),

      // Прямые оплаты
      ...directPayments.map((p) => ({
        kind: "payment",
        date: p.paymentDate,
        amount: -Number(p.amount || 0),
        id: p.id,
      })),

      // Взаимозачёты
      ...clientOffsets.map((o) => ({
        kind: "offset",
        date: o.date,
        amount: -Number(o.amount || 0),
        id: o.id,
        supplier: o.supplier,
        comment: o.comment,
      })),

      // Возвраты
      ...clientReturns.map((r) => ({
        kind: "return",
        date: r.date,
        amount: -Number(r.amount || 0),
        id: r.id,
      })),
    ].sort((a, b) => dateTimeKey(a.date) - dateTimeKey(b.date));

    let running = 0;

    // Рассчитываем накопленный остаток (balanceAfter) в хронологическом порядке
    events.forEach((e) => {
      running += e.amount;
      e.balanceAfter = running;
    });

    return events
      .filter(
        (e) =>
          e.kind === "opening" || e.kind === "payment" || e.kind === "offset",
      )
      .sort((a, b) => {
        // 1. Если один из элементов — opening, поднимаем его наверх
        if (a.kind === "opening" && b.kind !== "opening") return -1;
        if (b.kind === "opening" && a.kind !== "opening") return 1;

        // 2. Все остальные элементы (payment, offset) сортируем от новых к старым
        return dateTimeKey(b.date) - dateTimeKey(a.date);
      });
  }, [groups, clientOpening, directPayments, clientOffsets, clientReturns]);
  const kpiGrid = isMobile ? S.kpiGridMobile : S.kpiGrid;

  return (
    <>
      <button
        onClick={onBack}
        style={{
          background: "var(--s2)",
          border: "1px solid var(--b1)",
          borderRadius: 8,
          padding: "7px 12px",
          color: "var(--text)",
          fontSize: 13,
          cursor: "pointer",
          marginBottom: 14,
        }}
      >
        ← Назад к клиентам
      </button>

      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 14,
        }}
      >
        {client || "Клиент"}
      </h2>

      {/* =========================
          KPI
      ========================= */}

      <div style={kpiGrid}>
        <KPI label="Заказано" value={fmtM(totalSum)} color="var(--accent)" />

        <KPI label="Оплачено нам" value={fmtM(paidSum)} color="var(--green)" />

        <KPI label="Возвраты" value={fmtM(retSum)} color="var(--yellow)" />

        <KPI label="Через зачёт" value={fmtM(offsetSum)} color="#a371f7" />

        <KPI
          label="Текущий долг"
          value={fmtM(debt)}
          color={debt > 0 ? "var(--red)" : "var(--green)"}
        />
      </div>

      <Toolbar>
        <Btn variant="primary" onClick={() => setCreateOpen(true)}>
          + Новый заказ
        </Btn>
        <Btn variant="green" onClick={() => openModal("payment")}>
          💵 Внести оплату
        </Btn>
        <Btn variant="purple" onClick={() => openModal("offset")}>
          🔁 Зачёт поставщику
        </Btn>
        <Btn variant="ghost" onClick={() => { setForm({}); setModal("opening"); }}>
          📌 Начальный остаток
        </Btn>
      </Toolbar>

      {/* =========================
          ВОЗВРАТЫ
      ========================= */}

      {clientReturns.length > 0 && (
        <>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: "22px 0 10px",
            }}
          >
            История возвратов
          </div>

          <TableWrap title="Возвраты" count={`${clientReturns.length} записей`}>
            <thead>
              <tr
                style={{
                  background: "var(--s2)",
                }}
              >
                {["Товар", "Кол-во", "Цена", "Сумма"].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>

            <tbody>
              {clientReturns.map((r, i) => (
                <TR key={i}>
                  <TD>{r.product}</TD>

                  <TD>
                    <span
                      style={{
                        fontFamily: "JetBrains Mono,monospace",
                        fontSize: 12.5,
                      }}
                    >
                      {r.quantity}
                    </span>
                  </TD>

                  <TD>
                    <MoneyCell n={r.price} />
                  </TD>

                  <TD>
                    <MoneyCell n={r.amount} pos={false} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}

      {/* =========================
          ЛЕНТА + ЗАКАЗЫ
      ========================= */}

      <div
        style={{
          display: "flex",
          gap: "20px",
        }}
      >
        <div>
          {feed.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  margin: "22px 0 10px",
                }}
              >
                Лента платежей и зачётов ({feed.length})
              </div>

              {feed.map((entry, i) => (
                <LedgerEntry
                  key={`${entry.kind}_${entry.id ?? i}`}
                  entry={entry}
                  onEdit={entry.id ? handleEditEntry : null}
                  onDelete={entry.id ? handleDeleteEntry : null}
                />
              ))}
            </>
          )}
        </div>

        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: "18px 0 10px",
            }}
          >
            История заказов
          </div>

          {groups.length === 0 ? (
            <div
              style={{
                ...S.card,
                padding: 40,
                textAlign: "center",
                color: "var(--muted)",
              }}
            >
              Нет заказов
            </div>
          ) : (
            groups.map((g) => (
              <OrderCard
                key={g.oid}
                group={g}
                isMobile={isMobile}
                onOpen={setOpenOrder}
              />
            ))
          )}
        </div>
      </div>

      {/* Оплата */}
      <Modal
        open={modal === "payment"}
        onClose={() => !saving && setModal(null)}
        title={form.id ? "Изменить оплату" : `Оплата: ${client}`}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="green" onClick={saveModal} loading={saving}>
              Сохранить
            </Btn>
          </>
        }
      >
        <Field label="Дата">
          <DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </Field>
        <Field label="Сумма, сом" hint="Оплата без привязки к заказу закрывает общий долг">
          <TextInput
            inputMode="numeric"
            value={form.amount || ""}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </Field>
      </Modal>

      {/* Взаимозачёт */}
      <Modal
        open={modal === "offset"}
        onClose={() => !saving && setModal(null)}
        title={form.id ? "Изменить взаимозачёт" : `Взаимозачёт: ${client}`}
        subtitle="Клиент отдал деньги напрямую нашему поставщику"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="purple" onClick={saveModal} loading={saving}>
              Провести зачёт
            </Btn>
          </>
        }
      >
        <Field label="Поставщик">
          {form.id ? (
            <TextInput value={form.supplier} disabled />
          ) : (
            <SelectField
              value={form.supplier || ""}
              onChange={(v) => setForm({ ...form, supplier: v })}
              options={suppliersList.map((s) => s.name).filter(Boolean)}
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
        <Field label="За что">
          <TextInput
            placeholder="например: за муку"
            value={form.comment || ""}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
        </Field>
      </Modal>

      {modal === "opening" && (
        <OpeningBalanceModal
          open
          type="client"
          fixedName={client}
          entry={form.entry}
          onClose={() => setModal(null)}
        />
      )}

      {createOpen && (
        <CreateOrderModal open onClose={() => setCreateOpen(false)} defaultClient={client} />
      )}

      {openOrder && (
        <OrderDetailModal
          group={groups.find((g) => g.oid === openOrder.oid) || openOrder}
          onClose={() => setOpenOrder(null)}
        />
      )}
    </>
  );
}
