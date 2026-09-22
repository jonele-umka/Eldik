// =============================================================================
// КАТАЛОГ — товары из листа "Цены": название, цена, вес, картинка.
// Редактируется прямо здесь (без похода в Google Таблицу).
// =============================================================================
import { useMemo, useState } from "react";
import { fmtM, filterSearch } from "../utils/index.js";
import { KPI, TableWrap, TR, TD, TH, ProductThumb } from "../components/UI.jsx";
import { Btn, IconBtn, Modal, Field, TextInput, Toolbar } from "../components/Form.jsx";
import { S } from "../utils/styles.js";
import { useData, AFFECTS } from "../store/DataContext.jsx";
import { useUI } from "../store/UIContext.jsx";
import { savePrice, updatePrice, deletePrice } from "../services/api.js";

export default function CatalogPage({ data, search, isMobile }) {
  const arr = Array.isArray(data) ? data : [];
  const { mutate } = useData();
  const { toast, confirm } = useUI();

  const [editing, setEditing] = useState(null); // { oldProduct?, product, price, weight, image }
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () => filterSearch(arr, ["product"], search),
    [arr, search],
  );

  const openAdd = () =>
    setEditing({ oldProduct: null, product: "", price: "", weight: "", image: "" });

  const openEdit = (row) =>
    setEditing({
      oldProduct: row.product,
      product: row.product,
      price: String(row.price ?? ""),
      weight: String(row.weight ?? ""),
      image: row.image || "",
    });

  const save = async () => {
    if (!editing.product.trim()) return toast("Укажите название товара", "err");
    try {
      setSaving(true);
      const payload = {
        product: editing.product.trim(),
        price: Number(editing.price || 0),
        weight: Number(editing.weight || 0),
        image: editing.image.trim(),
      };
      if (editing.oldProduct) {
        await mutate(
          () => updatePrice({ oldProduct: editing.oldProduct, ...payload }),
          AFFECTS.price,
        );
      } else {
        await mutate(() => savePrice(payload), AFFECTS.price);
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
      title: "Удалить товар из каталога?",
      text: row.product,
      danger: true,
      onConfirm: async () => {
        try {
          await mutate(() => deletePrice(row.product), AFFECTS.price);
          toast("Удалено", "ok");
        } catch (e) {
          toast(e.message, "err");
        }
      },
    });

  return (
    <>
      <div style={isMobile ? S.kpiGridMobile : S.kpiGrid}>
        <KPI label="Товаров в каталоге" value={filtered.length} color="var(--accent)" />
      </div>

      <Toolbar style={{ justifyContent: "flex-end" }}>
        <Btn variant="primary" onClick={openAdd}>
          + Добавить товар
        </Btn>
      </Toolbar>

      <TableWrap title="Каталог" count={`${filtered.length} товаров`}>
        <thead>
          <tr style={{ background: "var(--s2)" }}>
            {["", "Товар", "Цена", "Вес", ""].map((h, i) => (
              <TH key={i}>{h}</TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
                Каталог пуст
              </td>
            </tr>
          ) : (
            filtered.map((r, i) => (
              <TR key={r.product || i}>
                <TD>
                  <ProductThumb src={r.image} size={38} />
                </TD>
                <TD>
                  <b>{r.product}</b>
                </TD>
                <TD>
                  <span style={{ fontFamily: "JetBrains Mono,monospace" }}>{fmtM(r.price)}</span>
                </TD>
                <TD style={{ color: "var(--muted)" }}>{r.weight ? `${r.weight} кг` : "—"}</TD>
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
        title={editing?.oldProduct ? "Изменить товар" : "Новый товар"}
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
            <Field label="Название">
              <TextInput
                value={editing.product}
                onChange={(e) => setEditing({ ...editing, product: e.target.value })}
              />
            </Field>
            <Field label="Цена, сом">
              <TextInput
                inputMode="decimal"
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: e.target.value })}
              />
            </Field>
            <Field label="Вес, кг">
              <TextInput
                inputMode="decimal"
                value={editing.weight}
                onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
              />
            </Field>
            <Field label="Ссылка на картинку" hint="Ссылка из Google Диска (файл должен быть доступен по ссылке)">
              <TextInput
                value={editing.image}
                onChange={(e) => setEditing({ ...editing, image: e.target.value })}
              />
            </Field>
            {editing.image && (
              <div style={{ marginTop: 6 }}>
                <ProductThumb src={editing.image} size={64} />
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
