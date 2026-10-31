// Акт сверки клиента: период или выбранные заказы → PDF-файл,
// который можно сразу отправить в WhatsApp / Telegram (меню «Поделиться»)
// или скачать и прикрепить вручную.
//
// Нужен один пакет:  npm i html2pdf.js
import { useMemo, useState } from "react";
import { Modal, Btn, Field, DateField, todayString } from "./Form.jsx";
import { useUI } from "../store/UIContext.jsx";
import { fmtM, orderEffectiveTotal, discountFactor } from "../utils/index.js";

// Название вверху акта — поменяй на своё
const COMPANY = "MAYRAM";

const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (dt) =>
  `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
const dayStr = (d) =>
  String(d || "")
    .trim()
    .split(" ")[0];
// дата -> число ГГГГММДД (для сравнения периодов)
const keyOf = (d) => {
  const s = dayStr(d);
  let y, m, dd;
  if (s.includes("-")) [y, m, dd] = s.split("-");
  else [dd, m, y] = s.split(".");
  return Number(`${y || 0}${pad(m || 0)}${pad(dd || 0)}`);
};
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const money = (n) => esc(fmtM(Math.round(Number(n || 0) * 100) / 100));

export default function StatementModal({
  open,
  onClose,
  client,
  market,
  groups,
  payments,
  offsets,
  returns,
  opening,
  stockOutMap,
  notFitMap,
  totalDebt,
}) {
  const { toast } = useUI();
  const [mode, setMode] = useState("period"); // period | orders
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [withItems, setWithItems] = useState(true);
  const [withPayments, setWithPayments] = useState(true);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);

  const setMonthRange = (offset) => {
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const b = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    setFrom(fmtDate(a));
    setTo(fmtDate(b));
  };

  // ── заказы с суммами (после скидки и недостачи) ──────────────────────
  const orders = useMemo(
    () =>
      (groups || []).map((g) => {
        const date = g.deliveryDate || g.orderDate;
        const f = discountFactor(g.client, date);
        const effRaw = orderEffectiveTotal(g, stockOutMap, notFitMap);
        const paidRaw =
          g.totalPaidAmount !== undefined
            ? Number(g.totalPaidAmount || 0)
            : Number(g.paidAmount || 0) + Number(g.offsetAmount || 0);
        const sum = effRaw * f;
        const rest = Math.max(0, effRaw - Math.min(effRaw, paidRaw)) * f;
        const items = (g.rows || [])
          .map((r) => {
            const qty = Number(r.paidQuantity ?? r.quantity ?? 0);
            const key = `${g.oid}::${r.product}`;
            const missing = Math.min(qty, Number(stockOutMap?.get(key) || 0));
            const notFit = Math.min(
              Math.max(0, qty - missing),
              Number(notFitMap?.get(key) || 0),
            );
            const q = Math.max(0, qty - missing - notFit);
            return { product: r.product, qty: q, price: Number(r.price || 0) };
          })
          .filter((i) => i.qty > 0);
        return {
          oid: g.oid,
          date: dayStr(date),
          key: keyOf(date),
          f,
          sum,
          paid: sum - rest,
          rest,
          items,
        };
      }),
    [groups, stockOutMap, notFitMap],
  );

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.key - a.key),
    [orders],
  );

  // ── вся книга операций клиента (для сальдо на начало/конец периода) ──
  const ledger = useMemo(() => {
    const list = [];
    (opening || []).forEach((o) =>
      list.push({
        kind: "opening",
        date: dayStr(o.date),
        key: keyOf(o.date),
        amount: Number(o.amount || 0),
        label: "Начальный остаток долга",
      }),
    );
    orders.forEach((o) =>
      list.push({
        kind: "order",
        date: o.date,
        key: o.key,
        amount: o.sum,
        label: `Заказ № ${String(o.oid).slice(-8)}${o.f < 1 ? " (скидка 3%)" : ""}`,
        order: o,
      }),
    );
    (payments || []).forEach((p) =>
      list.push({
        kind: "payment",
        date: dayStr(p.paymentDate),
        key: keyOf(p.paymentDate),
        amount: -Number(p.amount || 0),
        label: "Оплата",
      }),
    );
    (offsets || []).forEach((o) =>
      list.push({
        kind: "offset",
        date: dayStr(o.date),
        key: keyOf(o.date),
        amount: -Number(o.amount || 0),
        label: "Взаимозачёт",
      }),
    );
    (returns || []).forEach((r) =>
      list.push({
        kind: "return",
        date: dayStr(r.date),
        key: keyOf(r.date),
        amount: -Number(r.amount || 0),
        label: `Возврат: ${r.product} × ${r.quantity}`,
      }),
    );
    // внутри одного дня: начальный остаток, заказы, потом оплаты
    const rank = { opening: 0, order: 1, return: 2, payment: 3, offset: 3 };
    return list.sort((a, b) => a.key - b.key || rank[a.kind] - rank[b.kind]);
  }, [opening, orders, payments, offsets, returns]);

  const fromKey = from ? keyOf(from) : 0;
  const toKey = to ? keyOf(to) : 99999999;

  const preview = useMemo(() => {
    const before = ledger
      .filter((e) => e.key < fromKey)
      .reduce((s, e) => s + e.amount, 0);
    const inPeriod = ledger.filter((e) => e.key >= fromKey && e.key <= toKey);
    const sum = (k) =>
      inPeriod.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
    const charged = sum("order") + sum("opening");
    const paid = -sum("payment");
    const off = -sum("offset");
    const ret = -sum("return");
    return {
      before,
      inPeriod,
      charged,
      paid,
      off,
      ret,
      end: before + charged - paid - off - ret,
    };
  }, [ledger, fromKey, toKey]);

  const pickedOrders = sortedOrders.filter((o) => selected[o.oid]);

  // ── HTML акта ────────────────────────────────────────────────────────
  const buildHtml = () => {
    const td =
      "padding:6px 8px;border-bottom:1px solid #e3e6ea;font-size:12px;";
    const th =
      "padding:7px 8px;background:#f1f3f6;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#59606b;text-align:left;";
    const itemsHtml = (o) =>
      o.items
        .map(
          (i) =>
            `<div style="font-size:11px;color:#59606b;padding-left:10px;">• ${esc(i.product)} — ${i.qty} × ${money(i.price)} = ${money(i.qty * i.price)}</div>`,
        )
        .join("");

    const head = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1d232b;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1d232b;padding-bottom:8px;">
          <div style="font-size:22px;font-weight:700;">Акт сверки</div>
          <div style="font-size:13px;font-weight:700;">${esc(COMPANY)}</div>
        </div>
        <div style="margin-top:10px;font-size:13px;line-height:1.6;">
          <div>Клиент: <b>${esc(client)}</b>${market ? ` · ${esc(market)}` : ""}</div>
          <div>${
            mode === "orders"
              ? `Выбрано заказов: <b>${pickedOrders.length}</b>`
              : `Период: <b>${from ? esc(from) : "с начала"} — ${to ? esc(to) : esc(todayString())}</b>`
          }</div>
          <div style="color:#59606b;">Сформировано: ${esc(todayString())}</div>
        </div>`;

    let body = "";
    if (mode === "orders") {
      const total = pickedOrders.reduce((s, o) => s + o.sum, 0);
      const paid = pickedOrders.reduce((s, o) => s + o.paid, 0);
      const rest = pickedOrders.reduce((s, o) => s + o.rest, 0);
      body = `
        <table style="width:100%;border-collapse:collapse;margin-top:14px;">
          <tr><th style="${th}">Дата</th><th style="${th}">Заказ</th>
          <th style="${th};text-align:right;">Сумма</th>
          <th style="${th};text-align:right;">Оплачено</th>
          <th style="${th};text-align:right;">Остаток</th></tr>
          ${pickedOrders
            .map(
              (o) => `<tr>
              <td style="${td}white-space:nowrap;vertical-align:top;">${esc(o.date)}</td>
              <td style="${td}">№ ${esc(String(o.oid).slice(-8))}${o.f < 1 ? " (скидка 3%)" : ""}${withItems ? itemsHtml(o) : ""}</td>
              <td style="${td}text-align:right;vertical-align:top;">${money(o.sum)}</td>
              <td style="${td}text-align:right;vertical-align:top;color:#1a7f37;">${money(o.paid)}</td>
              <td style="${td}text-align:right;vertical-align:top;color:#cf222e;font-weight:700;">${money(o.rest)}</td></tr>`,
            )
            .join("")}
          <tr>
            <td style="${td}font-weight:700;" colspan="2">Итого</td>
            <td style="${td}text-align:right;font-weight:700;">${money(total)}</td>
            <td style="${td}text-align:right;font-weight:700;color:#1a7f37;">${money(paid)}</td>
            <td style="${td}text-align:right;font-weight:700;color:#cf222e;">${money(rest)}</td>
          </tr>
        </table>
        <div style="margin-top:14px;padding:10px 12px;background:#f6f8fa;border-radius:6px;font-size:13px;">
          Общий долг клиента на ${esc(todayString())} (с начальным остатком): <b style="color:#cf222e;">${money(totalDebt)}</b>
        </div>`;
    } else {
      const rows = preview.inPeriod.filter(
        (e) => withPayments || e.kind === "order" || e.kind === "opening",
      );
      let run = preview.before;
      const rowsHtml = preview.inPeriod
        .map((e) => {
          run += e.amount;
          if (!rows.includes(e)) return "";
          const debit = e.amount > 0 ? money(e.amount) : "";
          const credit = e.amount < 0 ? money(-e.amount) : "";
          const color =
            e.kind === "payment"
              ? "#1a7f37"
              : e.kind === "offset"
                ? "#8250df"
                : e.kind === "return"
                  ? "#9a6700"
                  : "#1d232b";
          return `<tr>
            <td style="${td}white-space:nowrap;vertical-align:top;">${esc(e.date)}</td>
            <td style="${td}color:${color};">${esc(e.label)}${withItems && e.order ? itemsHtml(e.order) : ""}</td>
            <td style="${td}text-align:right;vertical-align:top;">${debit}</td>
            <td style="${td}text-align:right;vertical-align:top;color:${color};">${credit}</td>
            <td style="${td}text-align:right;vertical-align:top;font-weight:600;">${money(run)}</td></tr>`;
        })
        .join("");
      const box = (label, value, color) => `
        <div style="flex:1;min-width:110px;border:1px solid #e3e6ea;border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;text-transform:uppercase;color:#59606b;">${label}</div>
          <div style="font-size:15px;font-weight:700;color:${color};margin-top:2px;">${value}</div>
        </div>`;
      body = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
          ${box("Долг на начало", money(preview.before), "#1d232b")}
          ${box("Начислено", money(preview.charged), "#1d232b")}
          ${box("Оплачено", money(preview.paid + preview.off), "#1a7f37")}
          ${preview.ret > 0 ? box("Возвраты", money(preview.ret), "#9a6700") : ""}
          ${box("Долг на конец", money(preview.end), preview.end > 0 ? "#cf222e" : "#1a7f37")}
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;">
          <tr><th style="${th}">Дата</th><th style="${th}">Операция</th>
          <th style="${th};text-align:right;">Начислено</th>
          <th style="${th};text-align:right;">Оплата / зачёт</th>
          <th style="${th};text-align:right;">Долг</th></tr>
          <tr><td style="${td}" colspan="4"><i>Долг на начало периода</i></td>
              <td style="${td}text-align:right;font-weight:600;">${money(preview.before)}</td></tr>
          ${rowsHtml || `<tr><td style="${td}color:#59606b;" colspan="5">За этот период операций нет</td></tr>`}
          <tr><td style="${td}font-weight:700;" colspan="4">Долг на конец периода</td>
              <td style="${td}text-align:right;font-weight:700;color:${preview.end > 0 ? "#cf222e" : "#1a7f37"};">${money(preview.end)}</td></tr>
        </table>
        ${
          preview.end !== totalDebt
            ? `<div style="margin-top:12px;font-size:12px;color:#59606b;">Общий долг клиента на ${esc(todayString())}: <b style="color:#cf222e;">${money(totalDebt)}</b></div>`
            : ""
        }`;
    }

    const sign = `
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px;color:#59606b;">
        <div>От ${esc(COMPANY)}: ____________________</div>
        <div>Клиент: ____________________</div>
      </div></div>`;
    return head + body + sign;
  };

  // ── PDF ──────────────────────────────────────────────────────────────
  const makeBlob = async () => {
    const html2pdf = (await import("html2pdf.js")).default;
    const el = document.createElement("div");
    // Блок НЕ добавляем в страницу и не позиционируем: html2pdf сам
    // клонирует его в свой слой. Если задать position/left за кадром —
    // PDF получается пустым.
    el.style.cssText = "width:720px;background:#fff;";
    el.innerHTML = buildHtml();
    return await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: {
          scale: 2,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] },
      })
      .from(el)
      .outputPdf("blob");
  };

  const fileName = () =>
    `Акт сверки ${client} ${todayString()}.pdf`.replace(/[\\/:*?"<>|]/g, "");

  const validate = () => {
    if (mode === "orders" && !pickedOrders.length) {
      toast("Отметьте хотя бы один заказ", "err");
      return false;
    }
    return true;
  };

  const download = async () => {
    if (!validate()) return;
    try {
      setBusy(true);
      const blob = await makeBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("PDF скачан", "ok");
    } catch (e) {
      toast("Не удалось создать PDF: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!validate()) return;
    try {
      setBusy(true);
      const blob = await makeBlob();
      const file = new File([blob], fileName(), { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // только файл — иначе Telegram/WhatsApp могут отправить одно название
        await navigator.share({ files: [file] });
      } else {
        // на компьютере меню «Поделиться» с файлами часто нет — скачиваем
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName();
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast("PDF скачан — прикрепите его в WhatsApp", "ok");
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // закрыл меню — не ошибка
      toast("Не удалось отправить: " + e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  // ── окно ─────────────────────────────────────────────────────────────
  const chip = (on) => ({
    background: on ? "rgba(46,110,224,.14)" : "var(--s1)",
    border: `1px solid ${on ? "var(--accent)" : "var(--b1)"}`,
    color: on ? "var(--accent)" : "var(--text)",
    borderRadius: 20,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  });
  const check = (label, value, onChange) => (
    <label
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        fontSize: 13,
        marginTop: 6,
      }}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      width={620}
      title={`📄 Акт сверки: ${client}`}
      subtitle="Соберите документ и отправьте клиенту файлом"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>
            Закрыть
          </Btn>
          <Btn variant="ghost" onClick={download} disabled={busy}>
            ⬇️ Скачать PDF
          </Btn>
          <Btn variant="green" onClick={share} loading={busy}>
            📤 Отправить
          </Btn>
        </>
      }
    >
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <button
          style={chip(mode === "period")}
          onClick={() => setMode("period")}
        >
          📅 За период
        </button>
        <button
          style={chip(mode === "orders")}
          onClick={() => setMode("orders")}
        >
          🧾 Выбрать заказы
        </button>
      </div>

      {mode === "period" ? (
        <>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <button
              style={chip(!from && !to)}
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Всё время
            </button>
            <button style={chip(false)} onClick={() => setMonthRange(0)}>
              Этот месяц
            </button>
            <button style={chip(false)} onClick={() => setMonthRange(-1)}>
              Прошлый месяц
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <Field label="С даты">
                <DateField value={from} onChange={setFrom} />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <Field label="По дату">
                <DateField value={to} onChange={setTo} />
              </Field>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
              gap: 8,
              marginTop: 4,
            }}
          >
            {[
              ["Долг на начало", preview.before, "var(--text)"],
              ["Начислено", preview.charged, "var(--accent)"],
              ["Оплачено", preview.paid + preview.off, "var(--green)"],
              [
                "Долг на конец",
                preview.end,
                preview.end > 0 ? "var(--red)" : "var(--green)",
              ],
            ].map(([l, v, c]) => (
              <div
                key={l}
                style={{
                  background: "var(--s2)",
                  border: "1px solid var(--b1)",
                  borderRadius: 9,
                  padding: "8px 10px",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                  }}
                >
                  {l}
                </div>
                <div
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 600,
                    color: c,
                  }}
                >
                  {fmtM(v)}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div
          style={{
            maxHeight: 280,
            overflowY: "auto",
            border: "1px solid var(--b1)",
            borderRadius: 10,
          }}
        >
          {sortedOrders.length === 0 && (
            <div style={{ padding: 16, color: "var(--muted)" }}>
              Заказов нет
            </div>
          )}
          {sortedOrders.map((o) => (
            <label
              key={o.oid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderBottom: "1px solid var(--b1)",
                cursor: "pointer",
                background: selected[o.oid]
                  ? "rgba(46,110,224,.08)"
                  : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={!!selected[o.oid]}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [o.oid]: e.target.checked }))
                }
              />
              <span style={{ flex: 1, fontSize: 13 }}>
                {o.date} · № {String(o.oid).slice(-8)}
              </span>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12.5,
                }}
              >
                {fmtM(o.sum)}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: o.rest > 0.5 ? "var(--red)" : "var(--green)",
                  minWidth: 84,
                  textAlign: "right",
                }}
              >
                {o.rest > 0.5 ? `долг ${fmtM(o.rest)}` : "оплачен"}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {check(
          "Показывать состав заказов (товары, цены)",
          withItems,
          setWithItems,
        )}
        {mode === "period" &&
          check(
            "Показывать оплаты, зачёты и возвраты",
            withPayments,
            setWithPayments,
          )}
      </div>
    </Modal>
  );
}
