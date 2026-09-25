import { useMemo, useState } from "react";
import {
  Btn,
  IconBtn,
  Modal,
  Field,
  TextInput,
  DateField,
  SelectField,
  todayString,
} from "./Form.jsx";
import { fmt, fmtM, parseQtyExpr } from "../utils/index.js";
import { norm } from "../utils/ledger.js";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { saveSupplier, savePurchase, saveRawMaterial } from "../services/api.js";

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
const newItem = () => ({
  key: "it_" + Date.now() + "_" + uid++,
  product: "",
  quantity: "",
  // Вес ОДНОЙ единицы (например, 1 мешок = 50 кг) — чисто справочное
  // число, на "Сумма" не влияет. Кол-во × кг = сколько всего кг привезли.
  kg: "",
  price: "",
  sum: "",
  sumTouched: false,
  comment: "",
});

// Сколько всего "единиц" в строке — если указан вес одной единицы (кг),
// считаем по весу (кол-во мешков × кг), иначе просто по кол-ву.
// Пример: 3 мешка × 25 кг = 75 кг.
const totalQty = (it) => {
  const qty = parseQtyExpr(it.quantity) || 1;
  const kgNum = Number(it.kg) || 0;
  return kgNum > 0 ? qty * kgNum : qty;
};

// Если известна цена за единицу — сумма считается сама: кол-во × цена
// (вес в кг тут НЕ участвует, он только для того, чтобы знать итоговый
// вес в кг — цена вписывается за единицу/мешок целиком, а не за кг).
// Пока цены нет — сумму вписывают вручную.
const autoSum = (it) => {
  const qty = parseQtyExpr(it.quantity) || 1;
  const price = Number(it.price) || 0;
  return qty > 0 && price > 0 ? Math.round(qty * price * 100) / 100 : null;
};

export default function CreatePurchaseModal({ open, onClose, suppliers }) {
  const { data, refresh } = useData();
  const { toast } = useUI();

  const rawMaterials = Array.isArray(data.rawMaterials) ? data.rawMaterials : [];
  const purchases = Array.isArray(data.purchases) ? data.purchases : [];
  const knownProductNames = useMemo(
    () => new Set(rawMaterials.map((r) => norm(r.name))),
    [rawMaterials],
  );

  const [mode, setMode] = useState("existing"); // "existing" | "new"
  const [supplier, setSupplier] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [date, setDate] = useState(todayString());
  // Пусто по умолчанию — строка появляется только когда нажали на
  // подсказку (существующий товар этого поставщика) или на «+ новый товар».
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [hiddenChips, setHiddenChips] = useState(loadHiddenChips);

  const names = (suppliers || []).map((s) => s.name).filter(Boolean);
  const currentSupplier = (mode === "new" ? newSupplier : supplier).trim();

  // Что этот поставщик обычно привозит — по истории поступлений (Закупки
  // приходят с бэкенда уже от новых к старым, так что первое вхождение
  // товара — самое недавнее; оно и оказывается сверху списка).
  const supplierProducts = useMemo(() => {
    if (!currentSupplier) return [];
    const key = norm(currentSupplier);
    const hidden = new Set(hiddenChips[key] || []);
    const seen = [];
    const has = new Set();
    purchases.forEach((p) => {
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
  }, [purchases, currentSupplier, hiddenChips]);

  // Пока у поставщика ещё нет истории (новый, или ещё ничего не приносил) —
  // показываем весь справочник сырья, чтобы быстрый выбор всё равно работал.
  const quickProducts = supplierProducts.length
    ? supplierProducts
    : rawMaterials.map((r) => r.name).filter(Boolean).slice(0, 12);

  // Убрать товар из подсказок этого поставщика (например, добавили по
  // ошибке) — саму историю покупок не трогаем, только скрываем чип.
  const hideChip = (name) => {
    if (!currentSupplier) return;
    const key = norm(currentSupplier);
    setHiddenChips(saveHiddenChip(key, norm(name)));
  };

  const rawByName = useMemo(() => {
    const m = {};
    rawMaterials.forEach((r) => {
      if (r.name) m[norm(r.name)] = Number(r.price || 0);
    });
    return m;
  }, [rawMaterials]);

  const setItem = (key, patch) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };

        // Сумму трогаем только если её не правили вручную — иначе
        // затираем то, что человек уже сам вписал.
        if ("sum" in patch) {
          next.sumTouched = true;
        } else if (!next.sumTouched) {
          const computed = autoSum(next);
          if (computed !== null) next.sum = String(computed);
        }

        // Известный товар из справочника «Сырьё» — подставляем цену за
        // единицу, только если человек ещё не вписал свою.
        if ("product" in patch && !it.price) {
          const known = rawByName[norm(patch.product)];
          if (known) {
            next.price = String(known);
            const computed = autoSum(next);
            if (computed !== null && !next.sumTouched) next.sum = String(computed);
          }
        }

        return next;
      }),
    );

  // Клик по подсказке — заполняет первую пустую строку товаром, либо
  // добавляет новую, если свободных нет. Так можно быстро тыкнуть
  // подряд несколько обычных позиций этого поставщика.
  const quickAddProduct = (name) => {
    const known = rawByName[norm(name)];
    const filled = { ...newItem(), product: name, price: known ? String(known) : "" };
    setItems((prev) => {
      const idx = prev.findIndex((it) => !it.product.trim());
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], product: name, price: filled.price };
        return copy;
      }
      return [...prev, filled];
    });
  };

  // Новая строка — сверху, а не снизу: чтобы не искать её под уже
  // заполненными товарами, особенно когда до этого тыкали подсказки.
  const addItem = () => setItems((prev) => [newItem(), ...prev]);
  const removeItem = (key) =>
    setItems((prev) => prev.filter((it) => it.key !== key));

  const itemSum = (it) => Number(it.sum) || 0;
  const totalSum = items.reduce((s, it) => s + itemSum(it), 0);

  const save = async () => {
    const finalSupplier = currentSupplier;
    if (!finalSupplier) return toast("Укажите поставщика", "err");

    // Обязательно только название товара — количество, вес, цена и сумма
    // не всегда известны сразу (например, только по кг взвесили).
    const validItems = items.filter((it) => it.product.trim());
    if (!validItems.length) return toast("Добавьте хотя бы один товар", "err");

    try {
      setSaving(true);
      if (mode === "new") {
        await saveSupplier({ name: finalSupplier });
      }
      // Чтобы не создать в справочнике «Сырьё» дубликат, если один и тот
      // же новый товар встретился в этом поступлении дважды.
      const registeredNow = new Set();
      for (const it of validItems) {
        const sum = Number(it.sum) || 0;
        // В Закупки пишем количество как ИТОГО КГ (кол-во мешков × вес,
        // если вес указан) — а цену за бэкенд-единицу (кг) высчитываем из
        // самой суммы (Сумма ÷ Кол-во кг), а не берём поле "Цена за ед."
        // напрямую: то поле — цена за мешок целиком, а не за кг, так что
        // Кол-во(кг) × Цена(это поле) дало бы совсем другое число.
        // Без веса — как раньше: количество как есть, по умолчанию 1, а
        // цена за единицу и есть то, что вписали.
        const qty = totalQty(it);
        const price = qty > 0 ? Math.round((sum / qty) * 100) / 100 : Number(it.price) || sum;
        const kgNum = Number(it.kg) || 0;
        // Кол-во (мешков) тоже сохраняем в комментарий — иначе при
        // редактировании неоткуда достать исходное число, только итог
        // (кол-во × кг), который в поле "Кол-во" смотрелся бы неверно.
        const qtyCount = parseQtyExpr(it.quantity) || 1;
        const comment = [
          kgNum > 0 ? `Вес/ед.: ${kgNum} кг × ${qtyCount}` : "",
          it.comment.trim(),
        ]
          .filter(Boolean)
          .join(" — ");

        await savePurchase({
          supplier: finalSupplier,
          product: it.product.trim(),
          quantity: qty,
          price,
          date,
          comment,
        });

        // Новый товар, которого нет в справочнике «Сырьё» — заносим сами,
        // чтобы в следующий раз он сразу был под рукой в подсказках,
        // без отдельного похода в «Настройки».
        const productKey = norm(it.product);
        if (!knownProductNames.has(productKey) && !registeredNow.has(productKey)) {
          registeredNow.add(productKey);
          try {
            await saveRawMaterial({ name: it.product.trim(), price });
          } catch {
            // не критично — поступление уже записано, справочник можно
            // будет пополнить и вручную
          }
        }
      }
      await refresh([...AFFECTS.purchase, ...AFFECTS.supplier, ...AFFECTS.raw]);
      toast(
        validItems.length === 1
          ? "Поступление добавлено"
          : `Поступление добавлено: ${validItems.length} товара`,
        "ok",
      );
      onClose();
    } catch (e) {
      // Apps Script иногда отвечает ошибкой уже ПОСЛЕ того, как запись
      // на сервере отработала — обновляем данные и при ошибке, чтобы
      // сразу было видно, сохранилось ли на самом деле.
      try {
        await refresh([...AFFECTS.purchase, ...AFFECTS.supplier, ...AFFECTS.raw]);
      } catch {
        /* не критично */
      }
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      width={760}
      title="📦 Новое поступление"
      subtitle="Один поставщик может привезти сразу несколько товаров — добавьте их все и сохраните одним разом"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Btn>
          <Btn variant="green" onClick={save} loading={saving}>
            Записать долг{totalSum > 0 ? ` — ${fmtM(totalSum)}` : ""}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 180 }}>
          <Field label="Поставщик">
            {mode === "existing" ? (
              <>
                <SelectField
                  value={supplier}
                  onChange={setSupplier}
                  options={names}
                  placeholder="— выберите —"
                />
                <div
                  onClick={() => {
                    setMode("new");
                    setSupplier("");
                  }}
                  style={{
                    fontSize: 12.5,
                    color: "var(--accent)",
                    cursor: "pointer",
                    marginTop: 6,
                  }}
                >
                  + Добавить нового поставщика
                </div>
              </>
            ) : (
              <>
                <TextInput
                  placeholder="Имя нового поставщика"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                />
                <div
                  onClick={() => setMode("existing")}
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted)",
                    cursor: "pointer",
                    marginTop: 6,
                  }}
                >
                  ← Выбрать из списка
                </div>
              </>
            )}
          </Field>
        </div>

        <div style={{ flex: 1, minWidth: 140 }}>
          <Field label="Дата">
            <DateField value={date} onChange={setDate} />
          </Field>
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".06em",
          color: "var(--muted)",
          margin: "16px 0 8px",
        }}
      >
        Что привезли
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          onClick={addItem}
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
              onClick={() => quickAddProduct(name)}
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

      <datalist id="rawMaterialsList">
        {rawMaterials.map((r) => (
          <option key={r.id || r.name} value={r.name} />
        ))}
      </datalist>

      {items.length === 0 && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            padding: "10px 2px",
          }}
        >
          Нажмите на товар выше, чтобы добавить строку.
        </div>
      )}

      {items.map((it, i) => (
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
                  list="rawMaterialsList"
                  placeholder="Например: Мука Даяш"
                  value={it.product}
                  onChange={(e) => setItem(it.key, { product: e.target.value })}
                />
              </Field>
            </div>
            <div style={{ width: 84 }}>
              <Field label={i === 0 ? "Кол-во" : null}>
                <TextInput
                  placeholder="100х50"
                  value={it.quantity}
                  onChange={(e) => setItem(it.key, { quantity: e.target.value })}
                />
                {/* Если вписали "100х50" — сразу видно, что посчиталось */}
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
                  onChange={(e) => setItem(it.key, { kg: e.target.value })}
                />
                {/* Кол-во 100 × вес 50 кг (1 мешок) = 5000 кг всего */}
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
                  onChange={(e) => setItem(it.key, { price: e.target.value })}
                />
              </Field>
            </div>
            <div style={{ width: 110 }}>
              <Field label={i === 0 ? "Сумма, сом" : null}>
                <TextInput
                  inputMode="decimal"
                  placeholder="0"
                  value={it.sum}
                  onChange={(e) => setItem(it.key, { sum: e.target.value })}
                />
              </Field>
            </div>
            <IconBtn
              title="Удалить строку"
              color="var(--red)"
              onClick={() => removeItem(it.key)}
            >
              ✕
            </IconBtn>
          </div>

          <TextInput
            placeholder="Комментарий к товару (необязательно)..."
            value={it.comment}
            onChange={(e) => setItem(it.key, { comment: e.target.value })}
            style={{ marginTop: 6, fontSize: 12.5 }}
          />
        </div>
      ))}

      {totalSum > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 12,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--muted)", marginRight: 8 }}>Итого поступление:</span>
          <b style={{ fontFamily: "JetBrains Mono, monospace" }}>{fmtM(totalSum)}</b>
        </div>
      )}
    </Modal>
  );
}
