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
        const retAmount = Number(g.returnedAmount || 0);
        return {
          oid: g.oid,
          date: dayStr(date),
          key: keyOf(date),
          f,
          sum,
          paid: sum - rest,
          rest,
          items,
          gross: effRaw + retAmount, // товары после недостачи, до возврата и скидки
          retAmount,
          discount: effRaw * (1 - f),
          returnsList: (returns || []).filter(
            (r) => String(r.orderId || "").trim() === String(g.oid),
          ),
        };
      }),
    [groups, stockOutMap, notFitMap, returns],
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
    // Возврат по заказу уже вычтен из суммы самого заказа (orderEffectiveTotal),
    // поэтому в сальдо второй раз его не вычитаем — только показываем.
    // Ручной возврат (OPENING) и возврат без найденного заказа уменьшают долг.
    const orderIds = new Set((orders || []).map((o) => String(o.oid)));
    (returns || []).forEach((r) => {
      const oid = String(r.orderId || "").trim();
      const inOrder = oid && oid !== "OPENING" && orderIds.has(oid);
      list.push({
        kind: "return",
        date: dayStr(r.date),
        key: keyOf(r.date),
        amount: inOrder ? 0 : -Number(r.amount || 0),
        label: inOrder
          ? `Возврат: ${r.product} × ${r.quantity} — ${money(r.amount)} (уже вычтен из суммы заказа)`
          : `Возврат: ${r.product} × ${r.quantity}`,
      });
    });
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

  // Итоги по клиенту за всё время (для блока «Общий долг»)
  const totals = useMemo(() => {
    let open = 0,
      openRet = 0,
      pay = 0,
      off = 0;
    ledger.forEach((e) => {
      if (e.kind === "opening") open += e.amount;
      else if (e.kind === "return" && e.amount < 0) openRet += -e.amount;
      else if (e.kind === "payment") pay += -e.amount;
      else if (e.kind === "offset") off += -e.amount;
    });
    const ordersAll = orders.reduce((a, o) => a + o.sum, 0);
    return {
      open,
      openRet,
      pay,
      off,
      ordersAll,
      openNet: Math.max(0, open - openRet),
      total: open - openRet + ordersAll - pay - off,
    };
  }, [ledger, orders]);

  // Цифры периода — одни и те же для окна и для PDF
  const stats = useMemo(() => {
    const inRange = (d) => keyOf(d) >= fromKey && keyOf(d) <= toKey;
    const periodOrders = orders.filter(
      (o) => o.key >= fromKey && o.key <= toKey,
    );
    const retTotal = (returns || [])
      .filter((r) => inRange(r.date))
      .reduce((a, r) => a + Number(r.amount || 0), 0);
    return {
      ordered: periodOrders.reduce((a, o) => a + o.sum, 0),
      ordersDebt: periodOrders.reduce((a, o) => a + o.rest, 0),
      retTotal,
    };
  }, [orders, returns, fromKey, toKey]);

  const pickedOrders = sortedOrders.filter((o) => selected[o.oid]);

  // ── HTML акта ────────────────────────────────────────────────────────
  const buildHtml = () => {
    const box = (label, value, color) => `
      <div style="flex:1;min-width:120px;border:1px solid #e3e6ea;border-radius:10px;padding:9px 12px;background:#fff;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#59606b;">${label}</div>
        <div style="font-size:16px;font-weight:700;color:${color};margin-top:3px;">${value}</div>
      </div>`;

    const orderCard = (o) => {
      const done = o.rest <= 0.5;
      const part = !done && o.paid > 0.5;
      const c = done
        ? { bg: "#eef8f0", bd: "#b7dfc0", tx: "#1a7f37", tag: "Оплачен" }
        : part
          ? {
              bg: "#fff8e8",
              bd: "#ecd18a",
              tx: "#9a6700",
              tag: "Частично оплачен",
            }
          : { bg: "#fbeeee", bd: "#efb7b7", tx: "#cf222e", tag: "Не оплачен" };
      const cell =
        "padding:5px 12px;font-size:12px;border-top:1px solid " + c.bd + ";";
      const items = withItems
        ? `<table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:5px 12px;font-size:10px;text-transform:uppercase;color:#59606b;">Товар</td>
              <td style="padding:5px 6px;font-size:10px;text-transform:uppercase;color:#59606b;text-align:right;">Кол-во</td>
              <td style="padding:5px 6px;font-size:10px;text-transform:uppercase;color:#59606b;text-align:right;">Цена</td>
              <td style="padding:5px 12px;font-size:10px;text-transform:uppercase;color:#59606b;text-align:right;">Сумма</td>
            </tr>
            ${o.items
              .map(
                (i) => `<tr>
              <td style="${cell}">${esc(i.product)}</td>
              <td style="${cell}text-align:right;">${i.qty}</td>
              <td style="${cell}text-align:right;">${money(i.price)}</td>
              <td style="${cell}text-align:right;font-weight:600;">${money(i.qty * i.price)}</td></tr>`,
              )
              .join("")}
            ${o.returnsList
              .map(
                (r) => `<tr>
              <td style="${cell}color:#9a6700;" colspan="3">↩ Возврат: ${esc(r.product)} × ${esc(r.quantity)}</td>
              <td style="${cell}text-align:right;color:#9a6700;font-weight:600;">−${money(r.amount)}</td></tr>`,
              )
              .join("")}
          </table>`
        : "";
      const line = (label, value, color) =>
        `<div style="margin-right:16px;font-size:12px;color:#59606b;">${label}: <b style="color:${color || "#1d232b"};">${value}</b></div>`;
      return `
      <div class="keep" style="margin-top:12px;border:1.5px solid ${c.bd};background:${c.bg};border-radius:10px;overflow:hidden;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;">
          <div style="font-size:13px;"><b>${esc(o.date)}</b> &nbsp;·&nbsp; Заказ № ${esc(String(o.oid).slice(-8))}</div>
          <div style="font-size:11px;font-weight:700;color:${c.tx};border:1px solid ${c.bd};background:#fff;border-radius:99px;padding:2px 9px;">${c.tag}</div>
        </div>
        ${items}
        <div style="display:flex;flex-wrap:wrap;align-items:center;padding:8px 12px;border-top:1px solid ${c.bd};">
          ${line("Товары", money(o.gross))}
          ${o.retAmount > 0 ? line("Возврат", "−" + money(o.retAmount), "#9a6700") : ""}
          ${o.discount > 0.005 ? line("Скидка 3%", "−" + money(o.discount), "#9a6700") : ""}
          ${line("К оплате", money(o.sum))}
          ${line("Оплачено", money(o.paid), "#1a7f37")}
          <div style="margin-left:auto;font-size:13px;">Остаток: <b style="font-size:15px;color:${done ? "#1a7f37" : "#cf222e"};">${money(o.rest)}</b></div>
        </div>
      </div>`;
    };

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

    const row = (label, value, color, bold) =>
      `<tr><td style="padding:5px 12px;font-size:12px;border-top:1px solid #e3e6ea;${bold ? "font-weight:700;" : ""}">${label}</td>
        <td style="padding:5px 12px;font-size:12px;border-top:1px solid #e3e6ea;text-align:right;font-weight:${bold ? 800 : 600};color:${color || "#1d232b"};">${value}</td></tr>`;
    const panel = (title, tint, border, inner) => `
      <div class="keep" style="margin-top:12px;border:1.5px solid ${border};background:#fff;border-radius:10px;overflow:hidden;page-break-inside:avoid;">
        <div style="padding:9px 12px;font-size:13px;font-weight:700;background:${tint};">${title}</div>
        <table style="width:100%;border-collapse:collapse;">${inner}</table>
      </div>`;
    // Общий долг клиента «по строкам»: нач. остаток, возврат, заказы, оплаты
    const debtPanel = panel(
      `Общий долг на ${esc(todayString())}`,
      "#f6f8fa",
      "#cfd6dd",
      row("Начальный остаток", money(totals.open)) +
        (totals.openRet > 0
          ? row(
              "Возврат на нач. остаток",
              "−" + money(totals.openRet),
              "#9a6700",
            )
          : "") +
        row(
          "Заказы (после возвратов и скидки)",
          "+" + money(totals.ordersAll),
        ) +
        row("Оплачено", "−" + money(totals.pay), "#1a7f37") +
        (totals.off > 0
          ? row("Взаимозачёты", "−" + money(totals.off), "#8250df")
          : "") +
        row(
          "Осталось после всего",
          money(totals.total),
          totals.total > 0 ? "#cf222e" : "#1a7f37",
          true,
        ),
    );

    let body = "";
    if (mode === "orders") {
      const total = pickedOrders.reduce((a, o) => a + o.sum, 0);
      const paid = pickedOrders.reduce((a, o) => a + o.paid, 0);
      const rest = pickedOrders.reduce((a, o) => a + o.rest, 0);
      const pickedIds = new Set(pickedOrders.map((o) => String(o.oid)));
      const others = [...orders]
        .filter((o) => !pickedIds.has(String(o.oid)) && o.rest > 0.5)
        .sort((a, b) => b.key - a.key);
      body = `
        <div style="display:flex;gap:8px;margin-top:14px;">
          ${box("Сумма заказов", money(total), "#1d232b")}
          ${box("Оплачено", money(paid), "#1a7f37")}
          ${box("Остаток по ним", money(rest), rest > 0 ? "#cf222e" : "#1a7f37")}
        </div>
        ${[...pickedOrders]
          .sort((a, b) => b.key - a.key)
          .map(orderCard)
          .join("")}
        ${
          others.length
            ? panel(
                "Другие неоплаченные заказы",
                "#fbeeee",
                "#efb7b7",
                others
                  .map((o) =>
                    row(
                      `${esc(o.date)} · № ${esc(String(o.oid).slice(-8))}`,
                      money(o.rest),
                      "#cf222e",
                    ),
                  )
                  .join("") +
                  row(
                    "Итого неоплачено",
                    money(others.reduce((a, o) => a + o.rest, 0)),
                    "#cf222e",
                    true,
                  ),
              )
            : ""
        }
        ${debtPanel}`;
    } else {
      const inP = preview.inPeriod;
      const openingRows = inP.filter((e) => e.kind === "opening");
      const retRows = inP.filter((e) => e.kind === "return" && e.amount !== 0); // на нач. остаток
      const periodOrders = [...orders]
        .filter((o) => o.key >= fromKey && o.key <= toKey)
        .sort((a, b) => b.key - a.key);
      const payRows = (
        withPayments
          ? inP.filter((e) => e.kind === "payment" || e.kind === "offset")
          : []
      ).sort((a, b) => b.key - a.key);
      // все возвраты клиента за период (и по заказам, и на нач. остаток)
      const retList = (returns || [])
        .filter((r) => keyOf(r.date) >= fromKey && keyOf(r.date) <= toKey)
        .sort((a, b) => keyOf(b.date) - keyOf(a.date));
      const retTotal = retList.reduce((a, r) => a + Number(r.amount || 0), 0);
      const ordered = periodOrders.reduce((a, o) => a + o.sum, 0);
      const ordersDebt = periodOrders.reduce((a, o) => a + o.rest, 0);
      const orderNo = new Map(
        orders.map((o) => [String(o.oid), String(o.oid).slice(-8)]),
      );
      const colorOf = (k) => (k === "offset" ? "#8250df" : "#1a7f37");
      const openGross = openingRows.reduce((a, e) => a + e.amount, 0);
      const openRet = retRows.reduce((a, e) => a - e.amount, 0);
      body = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
          ${box("Заказано", money(ordered), "#1d232b")}
          ${retTotal > 0 ? box("Возвраты", money(retTotal), "#9a6700") : ""}
          ${box("Оплачено", money(preview.paid + preview.off), "#1a7f37")}
          ${box("Долг по заказам", money(ordersDebt), ordersDebt > 0 ? "#cf222e" : "#1a7f37")}
        </div>
        ${
          payRows.length
            ? panel(
                "Оплаты и зачёты",
                "#eef8f0",
                "#b7dfc0",
                payRows
                  .map((e) =>
                    row(
                      `${esc(e.date)} · ${esc(e.label)}`,
                      money(-e.amount),
                      colorOf(e.kind),
                    ),
                  )
                  .join("") +
                  row(
                    "Всего оплачено",
                    money(preview.paid + preview.off),
                    "#1a7f37",
                    true,
                  ),
              )
            : ""
        }
        ${
          retList.length
            ? panel(
                "Возвраты",
                "#fff8e8",
                "#ecd18a",
                retList
                  .map((r) => {
                    const oid = String(r.orderId || "").trim();
                    const where = orderNo.has(oid)
                      ? `заказ № ${esc(orderNo.get(oid))}`
                      : "нач. остаток";
                    return row(
                      `${esc(dayStr(r.date))} · ${esc(r.product)} × ${esc(r.quantity)} <span style="color:#59606b;">(${where})</span>`,
                      money(r.amount),
                      "#9a6700",
                    );
                  })
                  .join("") +
                  row("Всего возвратов", money(retTotal), "#9a6700", true),
              )
            : ""
        }
        ${periodOrders.map(orderCard).join("")}
        ${
          periodOrders.length
            ? ""
            : `<div style="margin-top:14px;font-size:12px;color:#59606b;">За этот период заказов нет</div>`
        }
        ${
          openingRows.length
            ? panel(
                `📌 Начальный остаток долга (отдельно) · ${esc(openingRows[0].date)}`,
                "#f3f4f6",
                "#cfd6dd",
                row("Начальный остаток", money(openGross)) +
                  retRows
                    .map((e) =>
                      row(
                        `↩ ${esc(e.date)} · ${esc(e.label)}`,
                        "−" + money(-e.amount),
                        "#9a6700",
                      ),
                    )
                    .join("") +
                  row(
                    openRet > 0 ? "Остаток после возврата" : "Остаток",
                    money(Math.max(0, openGross - openRet)),
                    "#1d232b",
                    true,
                  ),
              )
            : ""
        }
        <div style="margin-top:14px;padding:10px 12px;background:#f6f8fa;border-radius:8px;font-size:13px;line-height:1.7;">
          Долг по заказам: <b style="color:${ordersDebt > 0 ? "#cf222e" : "#1a7f37"};">${money(ordersDebt)}</b>
          ${openingRows.length ? ` &nbsp;+&nbsp; нач. остаток: <b>${money(Math.max(0, openGross - openRet))}</b>` : ""}
          ${from || to ? "<br/>" : "&nbsp;=&nbsp;"} Общий долг на ${esc(todayString())}: <b style="color:#cf222e;">${money(totalDebt)}</b>
        </div>`;
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
              ["Заказано", stats.ordered, "var(--accent)"],
              ...(stats.retTotal > 0
                ? [["Возвраты", stats.retTotal, "var(--yellow, #9a6700)"]]
                : []),
              ["Оплачено", preview.paid + preview.off, "var(--green)"],
              [
                "Долг по заказам",
                stats.ordersDebt,
                stats.ordersDebt > 0 ? "var(--red)" : "var(--green)",
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
