import { useMemo, useState } from "react";
import { fmt, fmtM, parseQtyExpr } from "../utils/index.js";
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
  saveRawMaterial,
  saveSupplierPayment,
  updateOffset,
  updatePurchase,
  updateSupplierPayment,
} from "../services/api.js";
import { dateTimeKey, fmtDateTime, isOffsetSupplierPayment, norm } from "../utils/ledger.js";

// Подсказки-товары поставщика собираются из истории покупок, но иногда
// туда попадает товар, добавленный по ошибке (не тот поставщик). Явно
// убранные так подсказки запоминаем в localStorage — по каждому
// поставщику отдельно, чтобы больше не предлагались (сама история
// покупок при этом не трогается).
const HIDDEN_CHIPS_KEY = "hiddenSupplierChips_v1";
function loadHiddenChips() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_CHIPS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveHiddenChip(supplierKey, productKey) {
  const all = loadHiddenChips();
  const list = new Set(all[supplierKey] || []);
  list.add(productKey);
  all[supplierKey] = [...list];
  try {
    localStorage.setItem(HIDDEN_CHIPS_KEY, JSON.stringify(all));
  } catch {
    /* localStorage недоступен — не критично */
  }
  return all;
}

let uid = 0;
const newPurchaseItem = () => ({
  key: "it_" + Date.now() + "_" + uid++,
  product: "",
  quantity: "",
  // Вес одной единицы (1 мешок = 50 кг) — если указан, считаем по весу.
  kg: "",
  price: "",
  sum: "",
  sumTouched: false,
  comment: "",
});

// Сколько всего "единиц" в строке — если указан вес одной единицы (кг),
// считаем по весу (кол-во мешков × кг), иначе просто по кол-ву.
// Пример: 3 мешка × 25 кг = 75 кг.
const totalPurchaseQty = (it) => {
  const qty = parseQtyExpr(it.quantity) || 1;
  const kgNum = Number(it.kg) || 0;
  return kgNum > 0 ? qty * kgNum : qty;
};

// Если известна цена за единицу — сумма считается сама: кол-во × цена
// (вес в кг тут НЕ участвует, он только для итогового веса в кг — цена
// вписывается за единицу/мешок целиком, а не за кг).
const autoPurchaseSum = (it) => {
  const qty = parseQtyExpr(it.quantity) || 1;
  const price = Number(it.price) || 0;
  return qty > 0 && price > 0 ? Math.round(qty * price * 100) / 100 : null;
};

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
  const { data, mutate, refresh } = useData();
  const { toast, confirm } = useUI();

  const rawMaterials = arr(data.rawMaterials);

  const [modal, setModal] = useState(null); // 'purchase' | 'payment' | 'offset' | 'opening'
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Новое поступление — список товаров (несколько за раз), как в общей
  // форме «Новое поступление» у поставщиков. Пусто, пока не нажали на
  // подсказку. Для редактирования уже существующей записи ("form.id")
  // используется прежняя простая одиночная форма ниже.
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [purchaseDate, setPurchaseDate] = useState(todayString());
  const [hiddenChips, setHiddenChips] = useState(loadHiddenChips);

  // Что этот поставщик обычно привозит — по истории его поступлений,
  // самые недавние товары сверху (purchases уже приходят новыми вперёд).
  const supplierProducts = useMemo(() => {
    const hidden = new Set(hiddenChips[key] || []);
    const seen = [];
    const has = new Set();
    arr(purchases).forEach((p) => {
      if (
        norm(p.supplier) === key &&
        p.product &&
        !has.has(norm(p.product)) &&
        !hidden.has(norm(p.product))
      ) {
        has.add(norm(p.product));
        seen.push(p.product);
      }
    });
    return seen.slice(0, 12);
  }, [purchases, key, hiddenChips]);

  const quickProducts = supplierProducts.length
    ? supplierProducts
    : rawMaterials.map((r) => r.name).filter(Boolean).slice(0, 12);

  // Убрать товар из подсказок этого поставщика (например, добавили по
  // ошибке) — саму историю покупок не трогаем, только скрываем чип.
  const hideChip = (name) => setHiddenChips(saveHiddenChip(key, norm(name)));

  const knownProductNames = useMemo(
    () => new Set(rawMaterials.map((r) => norm(r.name))),
    [rawMaterials],
  );
  const rawByName = useMemo(() => {
    const m = {};
    rawMaterials.forEach((r) => {
      if (r.name) m[norm(r.name)] = Number(r.price || 0);
    });
    return m;
  }, [rawMaterials]);

  const setPurchaseItem = (itemKey, patch) =>
    setPurchaseItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const next = { ...it, ...patch };

        if ("sum" in patch) {
          next.sumTouched = true;
        } else if (!next.sumTouched) {
          const computed = autoPurchaseSum(next);
          if (computed !== null) next.sum = String(computed);
        }

        if ("product" in patch && !it.price) {
          const known = rawByName[norm(patch.product)];
          if (known) {
            next.price = String(known);
            const computed = autoPurchaseSum(next);
            if (computed !== null && !next.sumTouched) next.sum = String(computed);
          }
        }

        return next;
      }),
    );

  // Та же авто-сумма, что и в списке новых товаров, но для формы
  // редактирования ОДНОЙ уже существующей записи (form.id) — раньше там
  // не было никакой связи между полями, и "Сумма" не пересчитывалась,
  // когда меняли Кол-во/Вес/Цену.
  const setEditField = (patch) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if ("amount" in patch) {
        next.amountTouched = true;
      } else if (!next.amountTouched) {
        const computed = autoPurchaseSum(next);
        if (computed !== null) next.amount = String(computed);
      }
      return next;
    });

  const quickAddPurchaseProduct = (name) => {
    const known = rawByName[norm(name)];
    const filled = { ...newPurchaseItem(), product: name, price: known ? String(known) : "" };
    setPurchaseItems((prev) => {
      const idx = prev.findIndex((it) => !it.product.trim());
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], product: name, price: filled.price };
        return copy;
      }
      return [...prev, filled];
    });
  };

  const addPurchaseItem = () =>
    setPurchaseItems((prev) => [newPurchaseItem(), ...prev]);
  const removePurchaseItem = (itemKey) =>
    setPurchaseItems((prev) => prev.filter((it) => it.key !== itemKey));

  const purchaseItemSum = (it) => Number(it.sum) || 0;
  const purchaseTotal = purchaseItems.reduce((s, it) => s + purchaseItemSum(it), 0);

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
    if (kind === "purchase") {
      setForm({});
      setPurchaseDate(todayString());
      setPurchaseItems([]);
    }
    if (kind === "payment") setForm({ date: todayString(), amount: "", comment: "" });
    if (kind === "offset")
      setForm({ date: todayString(), client: "", amount: "", comment: "" });
    setModal(kind);
  };

  const openEdit = (entry) => {
    if (entry.kind === "purchase") {
      // Когда указан вес ед. (кг), в Закупки на бэкенде "Количество" — это
      // ИТОГО кг (кол-во × вес), а не исходное кол-во мешков — иначе тут
      // негде было бы его взять. Поэтому исходное кол-во тоже хранится в
      // комментарии ("Вес/ед.: 50 кг × 100") и достаётся отсюда при
      // редактировании — без этого поле "Кол-во" показывало бы итог
      // (кол-во × кг) вместо того, что человек реально вписывал.
      const weightMatch = String(entry.raw.comment || "").match(
        /^Вес\/ед\.:\s*([\d.,]+)\s*кг(?:\s*×\s*([\d.,]+))?/,
      );
      const kg = weightMatch?.[1]?.trim() || "";
      const kgNum = Number(kg) || 0;
      const countFromComment = weightMatch?.[2]?.trim() || "";
      // На бэкенде "Цена" всегда за кг (см. save() ниже) — а в форме
      // "Цена за ед." это цена за мешок целиком. Если вес указан,
      // переводим обратно: цена за кг × вес = цена за мешок.
      const rawPrice = Number(entry.raw.price || 0);
      const unitPrice = kgNum > 0 ? Math.round(rawPrice * kgNum * 100) / 100 : rawPrice;
      setForm({
        id: entry.id,
        date: String(entry.date || "").split(" ")[0],
        product: entry.raw.product || "",
        quantity: kg ? countFromComment || "1" : String(entry.raw.quantity || "1"),
        kg,
        price: String(unitPrice || ""),
        amount: String(entry.raw.amount ?? entry.amount ?? ""),
        // false — пока трогаем только показ. Как только что-то из
        // Кол-во/Вес/Цена изменят, Сумма пересчитается сама (пока сам
        // не впишут Сумму вручную).
        amountTouched: false,
        comment: String(entry.raw.comment || "").replace(
          /^Вес\/ед\.:\s*[\d.,]+\s*кг(?:\s*×\s*[\d.,]+)?\s*—?\s*/,
          "",
        ),
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
      if (modal === "purchase" && form.id) {
        // Редактирование уже существующей записи — одна строка.
        // Обязательно только название товара.
        const sum = Number(form.amount) || 0;
        if (!form.product.trim()) return toast("Укажите, что привезли", "err");
        // Количество для бэкенда = итого кг (кол-во × вес, если вес
        // указан). Цену за бэкенд-единицу (кг) высчитываем из самой суммы,
        // а не берём поле "Цена за ед." напрямую — оно про цену за мешок
        // целиком, а не за кг.
        const qty = totalPurchaseQty(form);
        const price = qty > 0 ? Math.round((sum / qty) * 100) / 100 : Number(form.price) || sum;
        const kgNum = Number(form.kg) || 0;
        const qtyCount = parseQtyExpr(form.quantity) || 1;
        const comment = [
          kgNum > 0 ? `Вес/ед.: ${kgNum} кг × ${qtyCount}` : "",
          form.comment,
        ]
          .filter(Boolean)
          .join(" — ");
        await mutate(
          () =>
            updatePurchase({
              id: form.id,
              supplier,
              product: form.product.trim(),
              quantity: qty,
              price,
              date: form.date,
              comment,
            }),
          AFFECTS.purchase,
        );
      } else if (modal === "purchase") {
        // Новое поступление — можно сразу несколько товаров.
        // Обязательно только название товара.
        const validItems = purchaseItems.filter((it) => it.product.trim());
        if (!validItems.length) return toast("Добавьте хотя бы один товар", "err");

        const registeredNow = new Set();
        for (const it of validItems) {
          const sum = Number(it.sum) || 0;
          const qty = totalPurchaseQty(it);
          const price = qty > 0 ? Math.round((sum / qty) * 100) / 100 : Number(it.price) || sum;
          const kgNum = Number(it.kg) || 0;
          const qtyCount = parseQtyExpr(it.quantity) || 1;
          const comment = [
            kgNum > 0 ? `Вес/ед.: ${kgNum} кг × ${qtyCount}` : "",
            it.comment.trim(),
          ]
            .filter(Boolean)
            .join(" — ");
          await savePurchase({
            supplier,
            product: it.product.trim(),
            quantity: qty,
            price,
            date: purchaseDate,
            comment,
          });
          const productKey = norm(it.product);
          if (!knownProductNames.has(productKey) && !registeredNow.has(productKey)) {
            registeredNow.add(productKey);
            try {
              await saveRawMaterial({ name: it.product.trim(), price });
            } catch {
              // не критично — поступление уже записано
            }
          }
        }
        await refresh([...AFFECTS.purchase, "rawMaterials"]);
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
      // Apps Script иногда отвечает ошибкой (напр. 404) уже ПОСЛЕ того, как
      // запись на сервере отработала — рвётся только доставка ответа, не
      // само сохранение. Подтягиваем данные и при ошибке, чтобы сразу было
      // видно, сохранилось ли на самом деле, а не только после ручного
      // обновления страницы. Ветки через mutate() уже это делают сами —
      // здесь нужно только для «новое поступление» (несколько товаров),
      // которая идёт напрямую через savePurchase в цикле.
      if (modal === "purchase" && !form.id) {
        try {
          await refresh([...AFFECTS.purchase, "rawMaterials"]);
        } catch {
          /* не критично */
        }
      }
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
        width={form.id ? undefined : 760}
        title={form.id ? "Изменить поступление" : "📦 Новое поступление"}
        subtitle={supplier}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="green" onClick={save} loading={saving}>
              Записать долг
              {!form.id && purchaseTotal > 0 ? ` — ${fmtM(purchaseTotal)}` : ""}
            </Btn>
          </>
        }
      >
        {form.id ? (
          <>
            <Field label="Поставщик">
              <TextInput value={supplier} disabled />
            </Field>
            <Field label="Что привезли">
              <TextInput
                placeholder="Например: Мука Даяш"
                value={form.product || ""}
                onChange={(e) => setForm({ ...form, product: e.target.value })}
              />
            </Field>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 90 }}>
                <Field label="Кол-во">
                  <TextInput
                    placeholder="100х50"
                    value={form.quantity || ""}
                    onChange={(e) => setEditField({ quantity: e.target.value })}
                  />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 90 }}>
                <Field label="Вес ед., кг">
                  <TextInput
                    inputMode="decimal"
                    placeholder="50"
                    value={form.kg || ""}
                    onChange={(e) => setEditField({ kg: e.target.value })}
                  />
                  {Number(form.kg) > 0 && parseQtyExpr(form.quantity) > 0 && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                      = {fmt(parseQtyExpr(form.quantity) * Number(form.kg))} кг
                    </div>
                  )}
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 90 }}>
                <Field label="Цена за ед.">
                  <TextInput
                    inputMode="decimal"
                    placeholder="0"
                    value={form.price || ""}
                    onChange={(e) => setEditField({ price: e.target.value })}
                  />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <Field label="Сумма, сом">
                  <TextInput
                    inputMode="decimal"
                    value={form.amount || ""}
                    onChange={(e) => setEditField({ amount: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <Field label="Дата">
              <DateField value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
            </Field>
            <Field label="Комментарий">
              <TextInput
                value={form.comment || ""}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Дата">
              <DateField value={purchaseDate} onChange={setPurchaseDate} />
            </Field>

            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                color: "var(--muted)",
                margin: "14px 0 8px",
              }}
            >
              Что привезли
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <button
                type="button"
                onClick={addPurchaseItem}
                title="Добавить пустую строку для нового товара"
                style={{
                  background: "rgba(46,110,224,0.12)",
                  border: "1px solid var(--accent)",
                  borderRadius: 20,
                  padding: "5px 11px",
                  color: "var(--accent)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + новый товар
              </button>
              {quickProducts.map((name) => (
                <span
                  key={name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    background: "var(--s2)",
                    border: "1px solid var(--b1)",
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => quickAddPurchaseProduct(name)}
                    title="Добавить строку с этим товаром"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "5px 4px 5px 11px",
                      color: "var(--text)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    + {name}
                  </button>
                  {supplierProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => hideChip(name)}
                      title="Убрать из подсказок этого поставщика (по ошибке добавили)"
                      style={{
                        background: "transparent",
                        border: "none",
                        borderLeft: "1px solid var(--b1)",
                        padding: "5px 8px",
                        color: "var(--muted)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))}
            </div>

            <datalist id="rawMaterialsListSupplier">
              {rawMaterials.map((r) => (
                <option key={r.id || r.name} value={r.name} />
              ))}
            </datalist>

            {purchaseItems.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 2px" }}>
                Нажмите на товар выше, чтобы добавить строку.
              </div>
            )}

            {purchaseItems.map((it, i) => (
              <div
                key={it.key}
                style={{
                  border: "1px solid var(--b1)",
                  background: "var(--s2)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 2, minWidth: 140 }}>
                    <Field label={i === 0 ? "Товар" : null}>
                      <TextInput
                        list="rawMaterialsListSupplier"
                        placeholder="Например: Мука Даяш"
                        value={it.product}
                        onChange={(e) => setPurchaseItem(it.key, { product: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div style={{ width: 84 }}>
                    <Field label={i === 0 ? "Кол-во" : null}>
                      <TextInput
                        placeholder="100х50"
                        value={it.quantity}
                        onChange={(e) => setPurchaseItem(it.key, { quantity: e.target.value })}
                      />
                      {/[x×хX*]/.test(it.quantity) && parseQtyExpr(it.quantity) > 0 && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                          = {parseQtyExpr(it.quantity)}
                        </div>
                      )}
                    </Field>
                  </div>
                  <div style={{ width: 74 }}>
                    <Field label={i === 0 ? "Вес ед., кг" : null}>
                      <TextInput
                        inputMode="decimal"
                        placeholder="50"
                        value={it.kg}
                        onChange={(e) => setPurchaseItem(it.key, { kg: e.target.value })}
                      />
                      {Number(it.kg) > 0 && parseQtyExpr(it.quantity) > 0 && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                          = {fmt(parseQtyExpr(it.quantity) * Number(it.kg))} кг
                        </div>
                      )}
                    </Field>
                  </div>
                  <div style={{ width: 100 }}>
                    <Field label={i === 0 ? "Цена за ед." : null}>
                      <TextInput
                        inputMode="decimal"
                        placeholder="0"
                        value={it.price}
                        onChange={(e) => setPurchaseItem(it.key, { price: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div style={{ width: 110 }}>
                    <Field label={i === 0 ? "Сумма, сом" : null}>
                      <TextInput
                        inputMode="decimal"
                        placeholder="0"
                        value={it.sum}
                        onChange={(e) => setPurchaseItem(it.key, { sum: e.target.value })}
                      />
                    </Field>
                  </div>
                  <IconBtn
                    title="Удалить строку"
                    color="var(--red)"
                    onClick={() => removePurchaseItem(it.key)}
                  >
                    ✕
                  </IconBtn>
                </div>

                <TextInput
                  placeholder="Комментарий к товару (необязательно)..."
                  value={it.comment}
                  onChange={(e) => setPurchaseItem(it.key, { comment: e.target.value })}
                  style={{ marginTop: 6, fontSize: 12.5 }}
                />
              </div>
            ))}

            {purchaseTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, fontSize: 13 }}>
                <span style={{ color: "var(--muted)", marginRight: 8 }}>Итого поступление:</span>
                <b style={{ fontFamily: "JetBrains Mono, monospace" }}>{fmtM(purchaseTotal)}</b>
              </div>
            )}
          </>
        )}
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
