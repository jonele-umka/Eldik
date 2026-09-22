import { useState } from "react";
import {
  Btn,
  Modal,
  Field,
  TextInput,
  DateField,
  SelectField,
  todayString,
} from "./Form.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { saveSupplier, savePurchase } from "../services/api.js";

export default function CreatePurchaseModal({ open, onClose, suppliers }) {
  const { mutate } = useData();
  const { toast } = useUI();

  const [mode, setMode] = useState("existing"); // "existing" | "new"
  const [supplier, setSupplier] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [product, setProduct] = useState("");
  const [date, setDate] = useState(todayString());
  const [comment, setComment] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const names = (suppliers || []).map((s) => s.name).filter(Boolean);

  const save = async () => {
    const finalSupplier = (mode === "new" ? newSupplier : supplier).trim();
    if (!finalSupplier) return toast("Укажите поставщика", "err");
    if (!product.trim()) return toast("Укажите, что привезли", "err");
    const sum = Number(amount);
    if (!sum || sum <= 0) return toast("Укажите сумму", "err");

    try {
      setSaving(true);
      if (mode === "new") {
        await mutate(
          () => saveSupplier({ name: finalSupplier }),
          AFFECTS.supplier,
        );
      }
      await mutate(
        () =>
          savePurchase({
            supplier: finalSupplier,
            product: product.trim(),
            quantity: 1,
            price: sum,
            date,
            comment: comment.trim(),
          }),
        AFFECTS.supplier,
      );
      toast("Поступление добавлено", "ok");
      onClose();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="📦 Новое поступление"
      subtitle="Товар от поставщика в долг"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Btn>
          <Btn variant="green" onClick={save} loading={saving}>
            Записать долг
          </Btn>
        </>
      }
    >
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

      <Field label="Что привезли">
        <TextInput
          placeholder="Например: Мука, мешок"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        />
      </Field>

      <Field label="Дата">
        <DateField value={date} onChange={setDate} />
      </Field>

      <Field label="Сумма, сом">
        <TextInput
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      <Field label="Комментарий">
        <TextInput
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
