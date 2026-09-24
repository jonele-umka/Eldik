import { useState } from "react";
import { S } from "../utils/styles.js";
import { getUserLabel } from "../utils/auth.js";
import { KPI, TableWrap, TR, TD, TH } from "../components/UI.jsx";
import { Btn, IconBtn, Modal, Field, TextInput, Toolbar } from "../components/Form.jsx";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import {
  deleteRawMaterial,
  forceUpdateAll,
  normalizeNames,
  saveRawMaterial,
  updateRawMaterial,
} from "../services/api.js";
import { useTheme } from "../utils/theme.js";
import { fmtM } from "../utils/index.js";

export default function SettingsPage({ user, onLogout }) {
  const { data, mutate, refreshAll } = useData();
  const { toast, confirm } = useUI();
  const { theme, toggleTheme } = useTheme();

  const raws = Array.isArray(data.rawMaterials) ? data.rawMaterials : [];
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recalc, setRecalc] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

  const saveRaw = async () => {
    if (!editing.name.trim()) return toast("Укажите название", "err");
    try {
      setSaving(true);
      const payload = { name: editing.name.trim(), price: Number(editing.price || 0) };
      if (editing.id) await mutate(() => updateRawMaterial({ id: editing.id, ...payload }), AFFECTS.raw);
      else await mutate(() => saveRawMaterial(payload), AFFECTS.raw);
      toast("Сохранено", "ok");
      setEditing(null);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const removeRaw = (row) =>
    confirm({
      title: "Удалить сырьё?",
      text: row.name,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deleteRawMaterial(row.id), AFFECTS.raw);
          toast("Удалено", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  const handleRecalc = async () => {
    try {
      setRecalc(true);
      await forceUpdateAll();
      await refreshAll();
      toast("Таблицы пересчитаны", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setRecalc(false);
    }
  };

  const handleNormalizeNames = async () => {
    try {
      setNormalizing(true);
      const res = await normalizeNames();
      await refreshAll();
      const changed = res?.changed ?? 0;
      toast(
        changed > 0
          ? `Готово: исправлено записей — ${changed}`
          : "Готово: расхождений не найдено",
        "ok",
      );
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setNormalizing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.card, maxWidth: 560, padding: "22px 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Аккаунт</div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>
          Вы вошли как: <b>{getUserLabel(user) || user}</b>
        </p>
        <Btn variant="ghost" onClick={onLogout}>
          Выйти
        </Btn>
      </div>

      <div style={{ ...S.card, maxWidth: 560, padding: "22px 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Тема оформления</div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          По умолчанию — светлая. Можно переключить на тёмную.
        </p>
        <Btn variant={theme === "dark" ? "purple" : "ghost"} onClick={toggleTheme}>
          {theme === "dark" ? "🌙 Тёмная — нажмите для светлой" : "☀️ Светлая — нажмите для тёмной"}
        </Btn>
      </div>

      <div style={{ ...S.card, maxWidth: 560, padding: "22px 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          Пересчёт служебных таблиц
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          Заново собирает служебные листы «Должники», «Аналитика» и
          «Финансы» на стороне Google Таблицы. Производство и развозка
          считаются напрямую из заказов и обновляются всегда, без этой
          кнопки — достаточно «Обновить» в шапке.
        </p>
        <Btn variant="primary" onClick={handleRecalc} loading={recalc}>
          🔄 Пересчитать всё
        </Btn>
      </div>

      <div style={{ ...S.card, maxWidth: 560, padding: "22px 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          Синхронизация имён клиентов/поставщиков
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          Если один и тот же клиент или поставщик где-то сохранён под
          сокращённым именем (например «Элдияр» вместо «Элдияр ДФ»),
          эта кнопка один раз пройдётся по всем листам (заказы, оплаты,
          возвраты, взаимозачёты, начальные остатки, закупки) и приведёт
          имя везде к полному варианту из справочника «Клиенты»/
          «Поставщики». Новые записи теперь и так сохраняются с полным
          именем — кнопка нужна только чтобы поправить старые.
        </p>
        <Btn variant="primary" onClick={handleNormalizeNames} loading={normalizing}>
          🔗 Синхронизировать имена
        </Btn>
      </div>

      <div>
        <Toolbar style={{ justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Справочник сырья</div>
          <Btn variant="primary" onClick={() => setEditing({ id: null, name: "", price: "" })}>
            + Добавить сырьё
          </Btn>
        </Toolbar>

        <TableWrap title="Сырьё" count={`${raws.length} позиций`}>
          <thead>
            <tr style={{ background: "var(--s2)" }}>
              {["Название", "Цена за единицу", ""].map((h, i) => (
                <TH key={i}>{h}</TH>
              ))}
            </tr>
          </thead>
          <tbody>
            {raws.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                  Справочник пуст — добавьте позиции, чтобы цена подставлялась
                  при вводе поступлений от поставщиков.
                </td>
              </tr>
            ) : (
              raws.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <b>{r.name}</b>
                  </TD>
                  <TD style={{ fontFamily: "JetBrains Mono,monospace" }}>{fmtM(r.price)}</TD>
                  <TD>
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconBtn
                        title="Изменить"
                        onClick={() =>
                          setEditing({ id: r.id, name: r.name, price: String(r.price ?? "") })
                        }
                      >
                        ✏️
                      </IconBtn>
                      <IconBtn title="Удалить" color="var(--red)" onClick={() => removeRaw(r)}>
                        🗑
                      </IconBtn>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </TableWrap>
      </div>

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? "Изменить сырьё" : "Новое сырьё"}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Отмена
            </Btn>
            <Btn variant="primary" onClick={saveRaw} loading={saving}>
              Сохранить
            </Btn>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Название">
              <TextInput
                placeholder="Например: Мешок муки"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Цена за единицу, сом">
              <TextInput
                inputMode="decimal"
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: e.target.value })}
              />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
