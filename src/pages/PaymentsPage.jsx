import { useState, useMemo } from "react";
import {
  fmtM,
  filterSearch,
  unique,
  paginate,
  getMonth,
} from "../utils/index.js";
import {
  KPI,
  Select,
  TableWrap,
  TR,
  TD,
  TH,
  MoneyCell,
  Pagination,
} from "../components/UI.jsx";
import {
  Btn,
  IconBtn,
  Modal,
  Field,
  TextInput,
  DateField,
} from "../components/Form.jsx";
import { S } from "../utils/styles.js";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { updatePayment, deletePayment } from "../services/api.js";

export default function PaymentsPage({ data, search }) {
  const [market, setMarket] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const arr = data || [];

  const { mutate } = useData();
  const { toast, confirm } = useUI();

  const [editing, setEditing] = useState(null); // { id, paymentDate, amount }
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    let r = filterSearch(arr, ["client", "market"], search);
    if (market) r = r.filter((x) => x.market === market);
    if (month) r = r.filter((x) => getMonth(x.paymentDate) === month);
    return [...r].reverse();
  }, [arr, search, market, month]);

  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthOptions = [
    ...new Set(arr.map((r) => getMonth(r.paymentDate)).filter(Boolean)),
  ]
    .sort()
    .reverse();

  const openEdit = (r) =>
    setEditing({
      id: r.id,
      paymentDate: String(r.paymentDate || "").split(" ")[0],
      amount: String(r.amount ?? ""),
      client: r.client,
    });

  const save = async () => {
    const amount = Number(editing.amount);
    if (!amount || amount <= 0) return toast("Укажите сумму", "err");
    try {
      setSaving(true);
      await mutate(
        () =>
          updatePayment({
            paymentId: editing.id,
            amount,
            paymentDate: editing.paymentDate,
          }),
        AFFECTS.payment,
      );
      toast("Сохранено", "ok");
      setEditing(null);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = (r) =>
    confirm({
      title: "Удалить платёж?",
      text: `${r.client} — ${fmtM(r.amount)}`,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deletePayment(r.id), AFFECTS.payment);
          toast("Удалено", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <div style={S.kpiGrid}>
        <KPI label="Платежей" value={filtered.length} color="var(--green)" />
        <KPI label="Общая сумма" value={fmtM(total)} color="var(--green)" />
      </div>
      <div style={S.filters}>
        <Select
          value={market}
          onChange={(v) => {
            setMarket(v);
            setPage(1);
          }}
          options={unique(arr, "market")}
          placeholder="Все рынки"
        />
        <Select
          value={month}
          onChange={(v) => {
            setMonth(v);
            setPage(1);
          }}
          options={monthOptions}
          placeholder="Все месяцы"
        />
      </div>
      <TableWrap
        title="Платежи"
        count={`${filtered.length} записей`}
        pagination={
          <Pagination total={filtered.length} page={page} onPage={setPage} />
        }
      >
        <thead>
          <tr style={{ background: "var(--s2)" }}>
            {["Дата платежа", "Дата заказа", "Клиент", "Рынок", "Сумма", ""].map(
              (h) => (
                <TH key={h}>{h}</TH>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {paginate(filtered, page).length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  textAlign: "center",
                  padding: 40,
                  color: "var(--muted)",
                }}
              >
                Нет данных
              </td>
            </tr>
          ) : (
            paginate(filtered, page).map((r, i) => (
              <TR key={r.id || i}>
                <TD>{r.paymentDate?.split(" ")[0] || "—"}</TD>
                <TD style={{ color: "var(--muted)" }}>
                  {r.orderDate?.split(" ")[0] || "—"}
                </TD>
                <TD>
                  <b>{r.client}</b>
                </TD>
                <TD style={{ color: "var(--muted)" }}>{r.market}</TD>
                <TD>
                  <MoneyCell n={r.amount} pos={true} />
                </TD>
                <TD>
                  <div style={{ display: "flex", gap: 6 }}>
                    <IconBtn title="Изменить" onClick={() => openEdit(r)}>
                      ✏️
                    </IconBtn>
                    <IconBtn title="Удалить" color="var(--red)" onClick={() => remove(r)}>
                      🗑
                    </IconBtn>
                  </div>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </TableWrap>

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title="Изменить платёж"
        subtitle={editing?.client}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="primary" onClick={save} loading={saving}>
              Сохранить
            </Btn>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Дата платежа">
              <DateField
                value={editing.paymentDate}
                onChange={(v) => setEditing({ ...editing, paymentDate: v })}
              />
            </Field>
            <Field label="Сумма, сом">
              <TextInput
                inputMode="numeric"
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
              />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}
