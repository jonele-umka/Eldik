// Начальный остаток — долг, который существовал ДО начала учёта в системе.
import { useMemo, useState } from "react";
import {
  Modal,
  Btn,
  Field,
  TextInput,
  DateField,
  SelectField,
  todayString,
} from "./Form.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { saveOpeningBalance, updateOpeningBalance } from "../services/api.js";

export default function OpeningBalanceModal({
  open,
  onClose,
  type,
  fixedName,
  entry,
}) {
  const { data, mutate } = useData();
  const { toast } = useUI();

  const clients = Array.isArray(data.clients) ? data.clients : [];
  const suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];

  const names = useMemo(
    () =>
      type === "supplier"
        ? suppliers
            .map((s) => s.name)
            .filter(Boolean)
            .reverse()
        : clients
            .map((c) => c.name)
            .filter(Boolean)
            .reverse(),
    [type, clients, suppliers],
  );

  const [name, setName] = useState(entry?.name || fixedName || "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [date, setDate] = useState(
    entry ? String(entry.date || "").split(" ")[0] : todayString(),
  );
  const [comment, setComment] = useState(entry?.comment || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name) return toast("Выберите имя", "err");
    const sum = Number(amount);
    if (!sum || sum <= 0) return toast("Укажите сумму", "err");
    try {
      setSaving(true);
      if (entry?.id) {
        await mutate(
          () =>
            updateOpeningBalance({
              id: entry.id,
              name,
              amount: sum,
              date,
              comment,
            }),
          AFFECTS.opening,
        );
      } else {
        await mutate(
          () => saveOpeningBalance({ type, name, amount: sum, date, comment }),
          AFFECTS.opening,
        );
      }
      toast("Начальный остаток сохранён", "ok");
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
      title={entry ? "Изменить начальный остаток" : "Начальный остаток"}
      subtitle={
        type === "supplier"
          ? "Сколько МЫ должны поставщику"
          : "Сколько клиент должен нам"
      }
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Btn>
          <Btn variant="primary" onClick={save} loading={saving}>
            Сохранить
          </Btn>
        </>
      }
    >
      <Field label={type === "supplier" ? "Поставщик" : "Клиент"}>
        {fixedName || entry ? (
          <TextInput value={name} disabled />
        ) : (
          <SelectField
            value={name}
            onChange={setName}
            options={names}
            placeholder="— выберите —"
          />
        )}
      </Field>
      <Field label="Сумма долга, сом">
        <TextInput
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Дата">
        <DateField value={date} onChange={setDate} />
      </Field>
      <Field label="За что (комментарий)">
        <TextInput
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
