import { useMemo, useState } from "react";
import { fmtM, filterSearch } from "../utils/index.js";
import {
  dateTimeKey,
  fmtDateTime,
  isOffsetSupplierPayment,
  norm,
} from "../utils/ledger.js";
import { KPI, TableWrap, TR, TD, TH, MoneyCell } from "../components/UI.jsx";
import {
  Btn,
  IconBtn,
  Modal,
  Field,
  TextInput,
  Toolbar,
} from "../components/Form.jsx";
import OpeningBalanceModal from "../components/OpeningBalanceModal.jsx";
import CreatePurchaseModal from "../components/CreatePurchaseModal.jsx";
import { S } from "../utils/styles.js";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import {
  deleteSupplier,
  saveSupplier,
  updateSupplier,
} from "../services/api.js";

const TYPE_META = {
  purchase: { label: "📦 Поступление", color: "var(--green)", sign: "+" },
  payment: { label: "💵 Наша оплата", color: "#ea580c", sign: "−" },
  offset: { label: "🔁 Взаимозачёт", color: "#a371f7", sign: "−" },
};

export default function SuppliersPage({
  suppliers,
  debts,
  purchases,
  payments,
  offsets,
  search,
  onSelectSupplier,
}) {
  const { mutate } = useData();
  const { toast, confirm } = useUI();
  const arr = (x) => (Array.isArray(x) ? x : []);

  const [tab, setTab] = useState("suppliers"); // "suppliers" | "feed"
  const [feedFilter, setFeedFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openBalance, setOpenBalance] = useState(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const dir = arr(suppliers);
  const debtArr = arr(debts);

  // ── Справочник + долги ──────────────────────────────────────────────
  const rows = useMemo(() => {
    const map = new Map();
    dir.forEach((s) =>
      map.set(norm(s.name), {
        id: s.id,
        supplier: s.name,
        phone: s.phone || "",
        comment: s.comment || "",
        purchased: 0,
        paid: 0,
        debt: 0,
      }),
    );
    debtArr.forEach((d) => {
      const key = norm(d.supplier);
      const prev = map.get(key) || {
        supplier: d.supplier,
        phone: "",
        comment: "",
      };
      map.set(key, {
        ...prev,
        purchased: Number(d.purchased || 0),
        paid: Number(d.paid || 0),
        debt: Number(d.debt || 0),
      });
    });
    return [...map.values()].sort(
      (a, b) => Number(b.debt || 0) - Number(a.debt || 0),
    );
  }, [dir, debtArr]);

  const filteredRows = useMemo(
    () => filterSearch(rows, ["supplier", "phone", "comment"], search),
    [rows, search],
  );

  const totalDebt = rows.reduce((s, r) => s + Number(r.debt || 0), 0);
  const withDebt = rows.filter((r) => Number(r.debt || 0) > 0).length;

  // ── Лента операций ──────────────────────────────────────────────────
  const events = useMemo(() => {
    return [
      ...arr(purchases).map((p) => ({
        kind: "purchase",
        id: p.id,
        date: p.date,
        supplier: p.supplier,
        amount: Number(p.amount || 0),
        product: p.product,
        quantity: Number(p.quantity || 0),
        price: Number(p.price || 0),
        comment: p.comment || "",
      })),
      ...arr(payments)
        .filter((p) => !isOffsetSupplierPayment(p))
        .map((p) => ({
          kind: "payment",
          id: p.id,
          date: p.date,
          supplier: p.supplier,
          amount: Number(p.amount || 0),
          comment: p.comment || "",
        })),
      ...arr(offsets).map((o) => ({
        kind: "offset",
        id: o.id,
        date: o.date,
        supplier: o.supplier,
        client: o.client,
        amount: Number(o.amount || 0),
        comment: o.comment || "",
      })),
    ].sort((a, b) => dateTimeKey(b.date) - dateTimeKey(a.date));
  }, [purchases, payments, offsets]);

  const filteredFeed = useMemo(() => {
    const searched = filterSearch(
      events,
      ["supplier", "product", "client"],
      search,
    );
    return feedFilter === "all"
      ? searched
      : searched.filter((e) => e.kind === feedFilter);
  }, [events, search, feedFilter]);

  // ── Действия справочника ────────────────────────────────────────────
  const save = async () => {
    if (!editing.name.trim()) return toast("Введите имя поставщика", "err");
    try {
      setSaving(true);
      const payload = {
        name: editing.name.trim(),
        phone: editing.phone.trim(),
        comment: editing.comment.trim(),
      };
      if (editing.id)
        await mutate(
          () => updateSupplier({ id: editing.id, ...payload }),
          AFFECTS.supplier,
        );
      else
        await mutate(
          () =>
            saveSupplier({
              ...payload,
              openingBalance: Number(editing.openingBalance || 0),
            }),
          [...AFFECTS.supplier, "openingBalances"],
        );
      toast("Сохранено", "ok");
      setEditing(null);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row) =>
    confirm({
      title: "Удалить поставщика?",
      text: `${row.supplier} будет удалён из справочника. Долги и оплаты останутся в истории.`,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deleteSupplier(row.id), AFFECTS.supplier);
          toast("Удалено", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <div style={S.kpiGrid}>
        <KPI label="Поставщиков" value={rows.length} color="var(--accent)" />
        <KPI label="С долгом" value={withDebt} color="#d29922" />
        <KPI label="Общий долг" value={fmtM(totalDebt)} color="var(--red)" />
      </div>

      <Toolbar style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            ["suppliers", "🏭 Поставщики"],
            ["feed", "📋 Лента операций"],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTab(val)}
              style={{
                background: tab === val ? "var(--accent)" : "var(--s2)",
                border:
                  "1px solid " + (tab === val ? "var(--accent)" : "var(--b1)"),
                borderRadius: 20,
                padding: "7px 14px",
                color: tab === val ? "#fff" : "var(--text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="green" onClick={() => setPurchaseOpen(true)}>
            📦 Новое поступление
          </Btn>
          {tab === "suppliers" && (
            <Btn
              variant="primary"
              onClick={() =>
                setEditing({
                  id: null,
                  name: "",
                  phone: "",
                  comment: "",
                  openingBalance: "",
                })
              }
            >
              + Новый поставщик
            </Btn>
          )}
        </div>
      </Toolbar>

      {tab === "suppliers" ? (
        <TableWrap title="Поставщики" count={`${filteredRows.length}`}>
          <thead>
            <tr style={{ background: "var(--s2)" }}>
              {[
                "Поставщик",
                "Телефон",
                "Привезено",
                "Оплачено",
                "Долг",
                "",
              ].map((h, i) => (
                <TH key={i}>{h}</TH>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--muted)",
                  }}
                >
                  Поставщиков пока нет
                </td>
              </tr>
            ) : (
              filteredRows.map((r, i) => (
                <TR
                  key={r.id || i}
                  bgColor={
                    Number(r.debt || 0) > 0
                      ? "rgba(210,153,34,0.08)"
                      : undefined
                  }
                  onClick={() => onSelectSupplier?.(r.supplier)}
                >
                  <TD>
                    <b>🏭 {r.supplier}</b>
                    {r.comment ? (
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {r.comment}
                      </div>
                    ) : null}
                  </TD>
                  <TD
                    style={{
                      fontFamily: "JetBrains Mono,monospace",
                      fontSize: 12.5,
                    }}
                  >
                    {r.phone || "—"}
                  </TD>
                  <TD>
                    <MoneyCell n={r.purchased} />
                  </TD>
                  <TD>
                    <MoneyCell n={r.paid} pos={true} />
                  </TD>
                  <TD>
                    <MoneyCell
                      n={r.debt}
                      pos={Number(r.debt || 0) > 0 ? false : undefined}
                    />
                  </TD>
                  <TD>
                    <div
                      style={{ display: "flex", gap: 6 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconBtn
                        title="Начальный остаток"
                        onClick={() => setOpenBalance(r.supplier)}
                      >
                        📌
                      </IconBtn>
                      <IconBtn
                        title="Изменить"
                        disabled={!r.id}
                        onClick={() =>
                          setEditing({
                            id: r.id,
                            name: r.supplier,
                            phone: r.phone,
                            comment: r.comment,
                          })
                        }
                      >
                        ✏️
                      </IconBtn>
                      <IconBtn
                        title="Удалить"
                        color="var(--red)"
                        disabled={!r.id}
                        onClick={() => remove(r)}
                      >
                        🗑
                      </IconBtn>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </TableWrap>
      ) : (
        <>
          <div style={{ ...S.filters, marginBottom: 12 }}>
            {[
              ["all", "Все"],
              ["purchase", "📦 Товар"],
              ["payment", "💵 Оплаты"],
              ["offset", "🔁 Зачёты"],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFeedFilter(val)}
                style={{
                  background:
                    feedFilter === val ? "var(--accent)" : "var(--s2)",
                  border:
                    "1px solid " +
                    (feedFilter === val ? "var(--accent)" : "var(--b1)"),
                  borderRadius: 20,
                  padding: "6px 12px",
                  color: feedFilter === val ? "#fff" : "var(--text)",
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <TableWrap title="Лента операций" count={`${filteredFeed.length}`}>
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {[
                  "Дата",
                  "Тип",
                  "Поставщик",
                  "Детали",
                  "Комментарий",
                  "Сумма",
                ].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredFeed.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--muted)",
                    }}
                  >
                    Ничего не найдено
                  </td>
                </tr>
              ) : (
                filteredFeed.map((e) => {
                  const t = TYPE_META[e.kind];
                  return (
                    <TR
                      key={`${e.kind}_${e.id}`}
                      onClick={() => onSelectSupplier?.(e.supplier)}
                    >
                      <TD>{fmtDateTime(e.date)}</TD>
                      <TD>
                        <span style={{ color: t.color, fontWeight: 600 }}>
                          {t.label}
                        </span>
                      </TD>
                      <TD>🏭 {e.supplier}</TD>
                      <TD>
                        {e.kind === "purchase" &&
                          `${e.product} · ${e.quantity} × ${e.price} сом`}
                        {e.kind === "offset" && `Заплатил клиент: ${e.client}`}
                        {e.kind === "payment" && "—"}
                      </TD>
                      <TD style={{ color: "var(--muted)" }}>
                        {e.comment || "—"}
                      </TD>
                      <TD
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          color: t.color,
                        }}
                      >
                        {t.sign}
                        {fmtM(e.amount)}
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </TableWrap>
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? "Изменить поставщика" : "Новый поставщик"}
        footer={
          <>
            <Btn
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
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
            <Field label="Имя *">
              <TextInput
                placeholder="Например, Давран"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <Field label="Телефон">
              <TextInput
                value={editing.phone}
                onChange={(e) =>
                  setEditing({ ...editing, phone: e.target.value })
                }
              />
            </Field>
            <Field label="Комментарий">
              <TextInput
                placeholder="Что возит и т.п."
                value={editing.comment}
                onChange={(e) =>
                  setEditing({ ...editing, comment: e.target.value })
                }
              />
            </Field>
            {!editing.id && (
              <Field
                label="Начальный долг (необязательно)"
                hint="Сколько мы уже должны ему до начала учёта"
              >
                <TextInput
                  inputMode="numeric"
                  value={editing.openingBalance}
                  onChange={(e) =>
                    setEditing({ ...editing, openingBalance: e.target.value })
                  }
                />
              </Field>
            )}
          </>
        )}
      </Modal>

      {openBalance && (
        <OpeningBalanceModal
          open
          type="supplier"
          fixedName={openBalance}
          onClose={() => setOpenBalance(null)}
        />
      )}

      {purchaseOpen && (
        <CreatePurchaseModal
          open
          onClose={() => setPurchaseOpen(false)}
          suppliers={dir}
        />
      )}
    </>
  );
}
