import { useState, useMemo } from "react";
import { fmtM, filterSearch, unique, paginate } from "../utils/index.js";
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
  TextArea,
  DateField,
  SelectField,
  Toolbar,
  todayString,
} from "../components/Form.jsx";
import { S } from "../utils/styles.js";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import {
  deleteClient,
  deleteExpense,
  saveClient,
  saveExpense,
  saveReturn,
  updateReturn,
  deleteReturn,
  updateClient,
  updateExpense,
  saveNote,
  updateNote,
  toggleNote,
  deleteNote,
} from "../services/api.js";
import { priceOf } from "../utils/promo.js";

/* =============================================================================
   ВОЗВРАТЫ — просмотр + оформление возврата без привязки к заказу
============================================================================= */
export function ReturnsPage({ data, search }) {
  const arr = data || [];
  const { data: store, mutate } = useData();
  const { toast, confirm } = useUI();

  const clients = Array.isArray(store.clients) ? store.clients : [];
  const prices = Array.isArray(store.prices) ? store.prices : [];

  const [open, setOpen] = useState(false);
  const emptyForm = {
    market: "",
    client: "",
    date: todayString(),
    items: [{ product: "", quantity: "1", name: "", price: "" }],
  };
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // правка готового возврата
  const MANUAL = "__manual__";
  const [saving, setSaving] = useState(false);

  const setItem = (i, patch) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)),
    }));
  const addItem = () =>
    setForm((f) => ({
      ...f,
      items: [...f.items, { product: "", quantity: "1", name: "", price: "" }],
    }));
  const removeItem = (i) =>
    setForm((f) => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter((_, j) => j !== i) : f.items,
    }));

  const markets = useMemo(
    () => [...new Set(clients.map((c) => c.market).filter(Boolean))].sort(),
    [clients],
  );
  const marketClients = useMemo(
    () => clients.filter((c) => c.market === form.market).map((c) => c.name),
    [clients, form.market],
  );

  // Новые сверху: по дате и времени возврата (dd.MM.yyyy HH:mm:ss) — убывание;
  // при одинаковом времени позже добавленные выше.
  const filtered = useMemo(() => {
    const key = (d) => {
      const [date = "", time = "00:00:00"] = String(d || "")
        .trim()
        .split(" ");
      const [dd, mm, yy] = date.split(".");
      return Number(
        `${yy || 0}${(mm || "0").padStart(2, "0")}${(dd || "0").padStart(2, "0")}${time.replace(/:/g, "").padStart(6, "0")}`,
      );
    };
    return filterSearch(arr, ["client", "product"], search)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => key(b.r.date) - key(a.r.date) || b.i - a.i)
      .map((x) => x.r);
  }, [arr, search]);
  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Товары, которые выбранный клиент заказывал (по ВСЕМ его заказам):
  // сколько куплено, сколько уже возвращено, средняя цена покупки.
  // Возврат сам раскладывается по его заказам (новые первыми).
  const normC = (x) =>
    String(x || "")
      .trim()
      .toLowerCase();
  const bought = useMemo(() => {
    const map = {};
    if (!form.client) return map;
    (Array.isArray(store.orders) ? store.orders : [])
      .filter((r) => normC(r.client) === normC(form.client))
      .forEach((r) => {
        const k = String(r.product || "").trim();
        if (!k) return;
        const m = map[k] || (map[k] = { qty: 0, sum: 0, returned: 0 });
        m.qty += Number(r.quantity || 0);
        m.sum += Number(r.total || 0);
      });
    arr
      .filter((r) => normC(r.client) === normC(form.client))
      .forEach((r) => {
        const k = String(r.product || "").trim();
        if (map[k]) map[k].returned += Number(r.quantity || 0);
      });
    return map;
  }, [store.orders, arr, form.client]);
  const catalogPrice = (name) =>
    priceOf(
      prices.find((p) => p.product === name),
      form.market,
    );
  const boughtList = Object.keys(bought).sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  const leftOf = (k) =>
    Math.max(0, (bought[k]?.qty || 0) - (bought[k]?.returned || 0));
  const avgPrice = (k) => (bought[k]?.qty ? bought[k].sum / bought[k].qty : 0);

  const save = async () => {
    if (!form.client) return toast("Выберите клиента", "err");

    // одинаковые товары в списке складываем; товар вне заказов клиента
    // выбирается из каталога, цена — из каталога
    const merged = {};
    for (const it of form.items) {
      if (!it.product) continue;
      const manual = it.product === MANUAL;
      const name = manual ? String(it.name || "").trim() : it.product;
      if (!name) return toast("Выберите товар из каталога", "err");
      const q = Number(String(it.quantity).replace(",", "."));
      if (!q || q <= 0) return toast(`Укажите количество: ${name}`, "err");
      const manualPrice = manual ? catalogPrice(name) : 0;
      if (manual && !(manualPrice > 0))
        return toast(`В каталоге нет цены: ${name}`, "err");
      const m = merged[name] || (merged[name] = { q: 0, manualPrice });
      m.q += q;
    }
    const list = Object.entries(merged).map(([product, m]) => [
      product,
      m.q,
      m.manualPrice,
    ]);
    if (!list.length) return toast("Выберите хотя бы один товар", "err");
    for (const [product, q] of list) {
      if (bought[product] && q > leftOf(product))
        return toast(
          `${product}: можно вернуть не более ${leftOf(product)} шт`,
          "err",
        );
    }

    try {
      setSaving(true);
      // по одному и по очереди: каждый следующий возврат учитывает
      // предыдущий (остаток по заказам считается на сервере)
      let done = 0;
      let failed = null;
      await mutate(async () => {
        for (const [product, q, manualPrice] of list) {
          const price =
            manualPrice ||
            avgPrice(product) ||
            priceOf(
              prices.find((p) => p.product === product),
              form.market,
            );
          try {
            await saveReturn({
              client: form.client,
              market: form.market,
              product,
              quantity: q,
              price,
              orderDate: todayString(),
            });
            done++;
          } catch (e) {
            // не бросаем наружу — иначе уже сохранённые товары не
            // попадут в обновление экрана
            failed = `${product}: ${e.message}`;
            break;
          }
        }
      }, AFFECTS.return);
      if (failed) {
        toast(
          `Сохранено ${done} из ${list.length}. Не получилось — ${failed}`,
          "err",
        );
        // сохранённые убираем из формы, остальные оставляем для повтора
        const rest = list
          .slice(done)
          .map(([product, q, mp]) =>
            mp
              ? {
                  product: MANUAL,
                  name: product,
                  price: "",
                  quantity: String(q),
                }
              : { product, quantity: String(q), name: "", price: "" },
          );
        setForm((f) => ({ ...f, items: rest.length ? rest : f.items }));
        return;
      }
      toast(
        list.length > 1
          ? `Возврат сохранён: ${list.length} товара`
          : "Возврат сохранён",
        "ok",
      );
      setOpen(false);
      setForm(emptyForm);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    const q = Number(String(editing.quantity).replace(",", "."));
    const pr = Number(String(editing.price).replace(",", "."));
    if (!String(editing.product).trim()) return toast("Укажите товар", "err");
    if (!(q > 0)) return toast("Укажите количество", "err");
    if (!(pr >= 0)) return toast("Укажите цену", "err");
    try {
      setSaving(true);
      await mutate(
        () =>
          updateReturn({
            id: editing.id,
            product: editing.product,
            quantity: q,
            price: pr,
            date: editing.date,
          }),
        AFFECTS.return,
      );
      toast("Возврат изменён", "ok");
      setEditing(null);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const removeReturn = (r) =>
    confirm({
      title: "Удалить возврат?",
      text: `${r.client} — ${r.product}, ${r.quantity} шт, ${fmtM(r.amount)}. Долг клиента вернётся на эту сумму.`,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deleteReturn(r.id), AFFECTS.return);
          toast("Возврат удалён", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <div style={S.kpiGrid}>
        <KPI label="Возвратов" value={filtered.length} color="var(--yellow)" />
        <KPI
          label="Сумма возвратов"
          value={fmtM(total)}
          color="var(--yellow)"
        />
      </div>

      <Toolbar style={{ justifyContent: "flex-end" }}>
        <Btn variant="warn" onClick={() => setOpen(true)}>
          ↩️ Оформить возврат
        </Btn>
      </Toolbar>

      <TableWrap title="Возвраты" count={`${filtered.length} записей`}>
        <thead>
          <tr style={{ background: "var(--s2)" }}>
            {["Дата", "Клиент", "Товар", "Кол-во", "Цена", "Сумма", ""].map(
              (h) => (
                <TH key={h}>{h}</TH>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={7}
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
            filtered.map((r, i) => (
              <TR key={r.id || i}>
                <TD style={{ color: "var(--muted)" }}>
                  {String(r.date || "").split(" ")[0] || "—"}
                </TD>
                <TD>
                  <b>{r.client}</b>
                </TD>
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
                <TD>
                  <div style={{ display: "flex", gap: 6 }}>
                    <IconBtn
                      title="Изменить"
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          product: r.product,
                          quantity: String(r.quantity),
                          price: String(r.price),
                          date: String(r.date || "").split(" ")[0],
                        })
                      }
                    >
                      ✏️
                    </IconBtn>
                    <IconBtn
                      title="Удалить"
                      color="var(--red)"
                      onClick={() => removeReturn(r)}
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

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Возврат товара"
        subtitle="Спишется из заказов клиента, где есть товар"
        footer={
          <>
            <Btn
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Отмена
            </Btn>
            <Btn variant="warn" onClick={save} loading={saving}>
              Сохранить возврат
            </Btn>
          </>
        }
      >
        <Field
          label="Дата возврата"
          hint="Когда привезли возврат — по этой дате он попадёт в Финансы"
        >
          <DateField
            value={form.date}
            onChange={(v) => setForm({ ...form, date: v })}
          />
        </Field>
        <Field label="Рынок">
          <SelectField
            value={form.market}
            onChange={(v) =>
              setForm({
                ...form,
                market: v,
                client: "",
                items: [{ product: "", quantity: "1", name: "", price: "" }],
              })
            }
            options={markets}
            placeholder="— выберите —"
          />
        </Field>
        <Field label="Клиент">
          <SelectField
            value={form.client}
            onChange={(v) =>
              setForm({
                ...form,
                client: v,
                items: [{ product: "", quantity: "1", name: "", price: "" }],
              })
            }
            options={marketClients}
            placeholder="— выберите —"
          />
        </Field>
        {form.items.map((it, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 2, minWidth: 170 }}>
              <Field label={i === 0 ? "Товар" : ""}>
                <SelectField
                  value={it.product}
                  onChange={(v) => setItem(i, { product: v })}
                  options={[
                    ...(boughtList.length
                      ? boughtList.map((k) => ({
                          value: k,
                          label: `${k} — можно ${leftOf(k)} шт`,
                        }))
                      : prices.map((p) => ({
                          value: p.product,
                          label: p.product,
                        }))),
                    { value: MANUAL, label: "➕ Другой товар (из каталога)" },
                  ]}
                  placeholder={
                    form.client ? "— выберите —" : "— сначала клиента —"
                  }
                />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 90 }}>
              <Field label={i === 0 ? "Кол-во" : ""}>
                <TextInput
                  inputMode="numeric"
                  value={it.quantity}
                  onChange={(e) =>
                    setItem(i, {
                      quantity:
                        it.product === MANUAL
                          ? e.target.value.replace(/[^\d.,]/g, "")
                          : e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </Field>
            </div>
            {it.product === MANUAL && (
              <div style={{ flex: "1 1 100%", minWidth: 170 }}>
                <Field
                  label="Товар из каталога"
                  hint={
                    it.name
                      ? `Цена из каталога: ${fmtM(catalogPrice(it.name))} за ед. Если товара нет в заказах клиента, сумма уменьшит его начальный остаток`
                      : "Для товара, которого нет в заказах клиента (например, отправленного до учёта в системе)"
                  }
                >
                  <SelectField
                    value={it.name}
                    onChange={(v) => setItem(i, { name: v })}
                    options={prices.map((p) => ({
                      value: p.product,
                      label: p.product,
                    }))}
                    placeholder="— выберите из каталога —"
                  />
                </Field>
              </div>
            )}
            {form.items.length > 1 && (
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => removeItem(i)}
                style={{ marginBottom: 12 }}
              >
                ✕
              </Btn>
            )}
          </div>
        ))}
        <Btn variant="ghost" onClick={addItem} style={{ marginBottom: 8 }}>
          + Добавить товар
        </Btn>
        {(() => {
          const est = form.items.reduce(
            (sum, it) =>
              sum +
              (it.product === MANUAL
                ? Number(String(it.quantity).replace(",", ".") || 0) *
                  (it.name ? catalogPrice(it.name) : 0)
                : bought[it.product]
                  ? Number(it.quantity || 0) * avgPrice(it.product)
                  : 0),
            0,
          );
          return est > 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              ≈ {fmtM(est)} · спишется из его заказов, где эти товары есть
              (сначала новые)
            </div>
          ) : null;
        })()}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title="Изменить возврат"
        footer={
          <>
            <Btn
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Отмена
            </Btn>
            <Btn variant="warn" onClick={saveEdit} loading={saving}>
              Сохранить
            </Btn>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Товар">
              <SelectField
                value={editing.product}
                onChange={(v) => {
                  const row = prices.find((p) => p.product === v);
                  setEditing({
                    ...editing,
                    product: v,
                    price: row ? String(priceOf(row, "")) : editing.price,
                  });
                }}
                options={[
                  ...(prices.some((p) => p.product === editing.product)
                    ? []
                    : [{ value: editing.product, label: editing.product }]),
                  ...prices.map((p) => ({
                    value: p.product,
                    label: p.product,
                  })),
                ]}
              />
            </Field>
            <Field label="Дата возврата">
              <DateField
                value={editing.date}
                onChange={(v) => setEditing({ ...editing, date: v })}
              />
            </Field>
            <Field label="Количество">
              <TextInput
                inputMode="decimal"
                value={editing.quantity}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    quantity: e.target.value.replace(/[^\d.,]/g, ""),
                  })
                }
              />
            </Field>
            <Field
              label="Цена за единицу, сом"
              hint={`Сумма: ${fmtM(
                Number(String(editing.quantity).replace(",", ".") || 0) *
                  Number(String(editing.price).replace(",", ".") || 0),
              )}`}
            >
              <TextInput
                inputMode="decimal"
                value={editing.price}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    price: e.target.value.replace(/[^\d.,]/g, ""),
                  })
                }
              />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* =============================================================================
   РАСХОДЫ — добавление, правка, удаление
============================================================================= */
const QUICK_CATEGORIES = ["Коммуналка", "Зарплата", "Аренда", "Прочее"];

export function ExpensesPage({ data, search }) {
  const [cat, setCat] = useState("");
  const [page, setPage] = useState(1);
  const arr = data || [];

  const { mutate } = useData();
  const { toast, confirm } = useUI();

  const [editing, setEditing] = useState(null); // {id?...}
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    let r = filterSearch(arr, ["category", "comment"], search);
    if (cat) r = r.filter((x) => x.category === cat);
    return r;
  }, [arr, search, cat]);

  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0);

  const openAdd = () =>
    setEditing({
      id: null,
      date: todayString(),
      category: "",
      amount: "",
      comment: "",
    });

  const save = async () => {
    if (!editing.category.trim()) return toast("Укажите категорию", "err");
    const amount = Number(editing.amount);
    if (!amount) return toast("Укажите сумму", "err");
    try {
      setSaving(true);
      if (editing.id) {
        await mutate(
          () =>
            updateExpense({
              id: editing.id,
              category: editing.category.trim(),
              amount,
              comment: editing.comment,
            }),
          AFFECTS.expense,
        );
      } else {
        await mutate(
          () =>
            saveExpense({
              date: editing.date,
              category: editing.category.trim(),
              amount,
              comment: editing.comment,
            }),
          AFFECTS.expense,
        );
      }
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
      title: "Удалить расход?",
      text: `${row.category} — ${fmtM(row.amount)}`,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deleteExpense(row.id), AFFECTS.expense);
          toast("Удалено", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <div style={S.kpiGrid}>
        <KPI
          label="Записей расходов"
          value={filtered.length}
          color="var(--red)"
        />
        <KPI label="Сумма расходов" value={fmtM(total)} color="var(--red)" />
      </div>

      <div style={{ ...S.filters, justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Select
            value={cat}
            onChange={(v) => {
              setCat(v);
              setPage(1);
            }}
            options={unique(arr, "category")}
            placeholder="Все категории"
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn
            variant="ghost"
            onClick={() =>
              setEditing({
                id: null,
                date: todayString(),
                category: "Коммуналка",
                amount: "",
                comment: "",
              })
            }
          >
            💡 Коммуналка
          </Btn>
          <Btn
            variant="ghost"
            onClick={() =>
              setEditing({
                id: null,
                date: todayString(),
                category: "Зарплата",
                amount: "",
                comment: "",
              })
            }
          >
            👷 Зарплата
          </Btn>
          <Btn variant="primary" onClick={openAdd}>
            + Добавить расход
          </Btn>
        </div>
      </div>

      <TableWrap
        title="Расходы"
        count={`${filtered.length} записей`}
        pagination={
          <Pagination total={filtered.length} page={page} onPage={setPage} />
        }
      >
        <thead>
          <tr style={{ background: "var(--s2)" }}>
            {["Дата", "Категория", "Сумма", "Комментарий", ""].map((h, i) => (
              <TH key={i}>{h}</TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginate(filtered, page).length === 0 ? (
            <tr>
              <td
                colSpan={5}
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
                <TD style={{ color: "var(--muted)" }}>
                  {r.date?.split(" ")[0] || "—"}
                </TD>
                <TD>
                  <b>{r.category}</b>
                </TD>
                <TD>
                  <MoneyCell n={r.amount} pos={false} />
                </TD>
                <TD style={{ color: "var(--muted)" }}>{r.comment || "—"}</TD>
                <TD>
                  <div style={{ display: "flex", gap: 6 }}>
                    <IconBtn
                      title="Изменить"
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          date: r.date?.split(" ")[0] || "",
                          category: r.category || "",
                          amount: String(r.amount ?? ""),
                          comment: r.comment || "",
                        })
                      }
                    >
                      ✏️
                    </IconBtn>
                    <IconBtn
                      title="Удалить"
                      color="var(--red)"
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

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? "Изменить расход" : "Новый расход"}
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
            <Field
              label="Дата"
              hint={
                editing.id ? "Дата создания при правке не меняется" : undefined
              }
            >
              <DateField
                value={editing.date}
                disabled={!!editing.id}
                onChange={(v) => setEditing({ ...editing, date: v })}
              />
            </Field>
            <Field label="Категория">
              <TextInput
                placeholder="Например: Коммуналка"
                value={editing.category}
                onChange={(e) =>
                  setEditing({ ...editing, category: e.target.value })
                }
              />
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                {QUICK_CATEGORIES.map((c) => (
                  <Btn
                    key={c}
                    size="sm"
                    variant={editing.category === c ? "primary" : "ghost"}
                    onClick={() => setEditing({ ...editing, category: c })}
                  >
                    {c}
                  </Btn>
                ))}
              </div>
            </Field>
            <Field label="Сумма, сом">
              <TextInput
                inputMode="numeric"
                value={editing.amount}
                onChange={(e) =>
                  setEditing({ ...editing, amount: e.target.value })
                }
              />
            </Field>
            <Field
              label="Комментарий"
              hint="Например: кому зарплата или за что коммуналка"
            >
              <TextInput
                placeholder="За что / кому"
                value={editing.comment || ""}
                onChange={(e) =>
                  setEditing({ ...editing, comment: e.target.value })
                }
              />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* =============================================================================
   КЛИЕНТЫ — справочник с добавлением, правкой и удалением
============================================================================= */
export function ClientsPage({ data, search, onSelectClient }) {
  const [market, setMarket] = useState("");
  const arr = [...(data || [])].reverse();
  const { mutate } = useData();
  const { toast, confirm } = useUI();

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    let r = filterSearch(arr, ["name", "market", "address", "phone"], search);
    if (market) r = r.filter((x) => x.market === market);
    return r;
  }, [arr, search, market]);

  const save = async () => {
    if (!editing.market.trim() || !editing.name.trim())
      return toast("Рынок и имя обязательны", "err");
    try {
      setSaving(true);
      const payload = {
        market: editing.market.trim(),
        name: editing.name.trim(),
        address: editing.address.trim(),
        phone: editing.phone.trim(),
      };
      if (editing.id)
        // имя клиента могло поменяться — на бэкенде оно меняется во всех
        // заказах/платежах/возвратах, поэтому перечитываем и их тоже
        await mutate(
          () => updateClient({ id: editing.id, ...payload }),
          [
            ...new Set([
              ...AFFECTS.client,
              ...AFFECTS.order,
              "returns",
              "openingBalances",
            ]),
          ],
        );
      else await mutate(() => saveClient(payload), AFFECTS.client);
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
      title: "Удалить клиента?",
      text: `${row.name} будет удалён из базы. История заказов останется.`,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deleteClient(row.id), AFFECTS.client);
          toast("Клиент удалён", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <div style={{ ...S.filters, justifyContent: "space-between" }}>
        <Select
          value={market}
          onChange={setMarket}
          options={unique(arr, "market")}
          placeholder="Все рынки"
        />
        <Btn
          variant="primary"
          onClick={() =>
            setEditing({
              id: null,
              market: "",
              name: "",
              address: "",
              phone: "",
            })
          }
        >
          + Новый клиент
        </Btn>
      </div>

      <TableWrap title="Клиенты" count={`${filtered.length} клиентов`}>
        <thead>
          <tr style={{ background: "var(--s2)" }}>
            {["Рынок", "Имя", "Адрес", "Телефон", ""].map((h, i) => (
              <TH key={i}>{h}</TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={5}
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
            filtered.map((r, i) => (
              <TR key={r.id || i}>
                <TD style={{ color: "var(--muted)" }}>{r.market}</TD>
                <TD>
                  <b
                    onClick={() => onSelectClient?.(r.name)}
                    style={{
                      cursor: onSelectClient ? "pointer" : "default",
                      color: onSelectClient ? "var(--accent)" : "inherit",
                    }}
                  >
                    {r.name}
                  </b>
                </TD>
                <TD style={{ color: "var(--muted)" }}>{r.address || "—"}</TD>
                <TD>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono,monospace",
                      fontSize: 12.5,
                    }}
                  >
                    {r.phone || "—"}
                  </span>
                </TD>
                <TD>
                  <div style={{ display: "flex", gap: 6 }}>
                    <IconBtn
                      title="Изменить"
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          market: r.market || "",
                          name: r.name || "",
                          address: r.address || "",
                          phone: r.phone || "",
                        })
                      }
                    >
                      ✏️
                    </IconBtn>
                    <IconBtn
                      title="Удалить"
                      color="var(--red)"
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

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? "Изменить клиента" : "Новый клиент"}
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
            <Field label="Рынок *">
              <TextInput
                value={editing.market}
                onChange={(e) =>
                  setEditing({ ...editing, market: e.target.value })
                }
              />
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                {unique(arr, "market").map((m) => (
                  <Btn
                    key={m}
                    size="sm"
                    variant={editing.market === m ? "primary" : "ghost"}
                    onClick={() => setEditing({ ...editing, market: m })}
                  >
                    {m}
                  </Btn>
                ))}
              </div>
            </Field>
            <Field label="Имя клиента *">
              <TextInput
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <Field label="Адрес">
              <TextInput
                value={editing.address}
                onChange={(e) =>
                  setEditing({ ...editing, address: e.target.value })
                }
              />
            </Field>
            <Field label="Телефон">
              <TextInput
                value={editing.phone}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    phone: e.target.value.replace(/[^0-9+ ]/g, ""),
                  })
                }
              />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* =============================================================================
   ЗАМЕТКИ
============================================================================= */
export function NotesPage({ data, search }) {
  const arr = Array.isArray(data) ? data : [];
  const { mutate } = useData();
  const { toast, confirm } = useUI();

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const filtered = useMemo(
    () => filterSearch(arr, ["title", "text"], search),
    [arr, search],
  );

  const save = async () => {
    if (!editing.title.trim() || !editing.text.trim())
      return toast("Заполните заголовок и текст", "err");
    try {
      setSaving(true);
      if (editing.id)
        await mutate(
          () => updateNote(editing.id, editing.title, editing.text),
          AFFECTS.note,
        );
      else
        await mutate(() => saveNote(editing.title, editing.text), AFFECTS.note);
      toast("Сохранено", "ok");
      setEditing(null);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (note) => {
    try {
      setBusyId(note.id);
      await mutate(() => toggleNote(note.id, !note.completed), AFFECTS.note);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusyId(null);
    }
  };

  const remove = (note) =>
    confirm({
      title: "Удалить заметку?",
      text: note.title,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deleteNote(note.id), AFFECTS.note);
          toast("Удалено", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <Toolbar style={{ justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {filtered.length} заметок
        </div>
        <Btn
          variant="primary"
          onClick={() => setEditing({ id: null, title: "", text: "" })}
        >
          + Новая заметка
        </Btn>
      </Toolbar>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))",
          gap: 12,
        }}
      >
        {filtered.length === 0 && (
          <div
            style={{
              ...S.card,
              padding: 40,
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            Заметок пока нет
          </div>
        )}

        {filtered.map((n) => (
          <div
            key={n.id}
            style={{
              ...S.card,
              padding: 14,
              opacity: n.completed ? 0.5 : 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ flex: 1, fontSize: 14 }}>{n.title}</b>
              <IconBtn
                title="Выполнено"
                disabled={busyId === n.id}
                onClick={() => toggle(n)}
              >
                {n.completed ? "✅" : "⚪"}
              </IconBtn>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--muted)",
                whiteSpace: "pre-wrap",
                flex: 1,
              }}
            >
              {n.text}
            </div>
            <div
              style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}
            >
              <IconBtn
                title="Изменить"
                onClick={() =>
                  setEditing({ id: n.id, title: n.title, text: n.text })
                }
              >
                ✏️
              </IconBtn>
              <IconBtn
                title="Удалить"
                color="var(--red)"
                onClick={() => remove(n)}
              >
                🗑
              </IconBtn>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? "Изменить заметку" : "Новая заметка"}
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
            <Field label="Заголовок">
              <TextInput
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </Field>
            <Field label="Текст">
              <TextArea
                value={editing.text}
                onChange={(e) =>
                  setEditing({ ...editing, text: e.target.value })
                }
              />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}
