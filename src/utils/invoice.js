// Печать накладной: рисуем HTML в скрытый iframe и вызываем печать.
// Пользователь может сохранить в PDF или отправить на принтер.
import { fmt } from "./index.js";

export function printInvoice({ order, rows, priceOfRow, promoOf }) {
  const itemRows = rows
    .map((r, i) => {
      const qty = Number(r.quantity) || 0;
      const price = priceOfRow(r);
      const promo = promoOf(qty);
      return `<tr>
        <td style="text-align:center;padding:6px 4px">${i + 1}</td>
        <td style="padding:6px 4px">${r.product}</td>
        <td style="text-align:center;padding:6px 4px">${qty}</td>
        <td style="text-align:center;color:#059669;padding:6px 4px">${
          promo.giftQty > 0
            ? `+${promo.giftQty}<small style="display:block;font-size:9px;color:#666">итог: ${promo.finalQty}</small>`
            : "—"
        }</td>
        <td style="text-align:right;padding:6px 4px">${fmt(price)}</td>
        <td style="text-align:right;font-weight:600;padding:6px 4px">${fmt(qty * price)}</td>
      </tr>`;
    })
    .join("");

  const total = rows.reduce(
    (s, r) => s + (Number(r.quantity) || 0) * priceOfRow(r),
    0,
  );
  const boxes = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const gifts = rows.reduce(
    (s, r) => s + promoOf(Number(r.quantity) || 0).giftQty,
    0,
  );
  const num = String(order.oid || "").slice(-8);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Накладная ${num}</title>
<style>@page{size:A4;margin:0}body{margin:0;background:#fff}</style></head><body>
<div style="font-family:Helvetica,Arial,sans-serif;color:#334155;padding:20px">
  <div style="font-size:24px;font-weight:bold;color:#0f172a">НАКЛАДНАЯ</div>
  <div style="font-size:11px;color:#64748b;margin:4px 0 25px">№ ${num} от ${order.orderDate || ""}</div>
  <table width="100%" style="margin-bottom:20px;font-size:13px"><tr>
    <td style="width:50%;vertical-align:top">
      <div style="color:#94a3b8;font-size:10px;text-transform:uppercase">Клиент</div>
      <div style="font-weight:600;margin-bottom:8px">${order.client || ""}</div>
      <div style="color:#94a3b8;font-size:10px;text-transform:uppercase">Рынок</div>
      <div style="font-weight:600">${order.market || ""}</div>
    </td>
    <td style="width:50%;vertical-align:top">
      <div style="color:#94a3b8;font-size:10px;text-transform:uppercase">Дата доставки</div>
      <div style="font-weight:600;margin-bottom:8px">${order.deliveryDate || ""}</div>
      <div style="color:#94a3b8;font-size:10px;text-transform:uppercase">Статус</div>
      <div style="font-weight:600">${order.status || ""}</div>
    </td></tr></table>
  <table width="100%" style="border-collapse:collapse;margin-bottom:20px;font-size:12px">
    <thead><tr style="border-bottom:2px solid #e2e8f0;color:#64748b;text-transform:uppercase;font-size:10px">
      <th style="padding:8px 4px;width:5%">#</th>
      <th style="padding:8px 4px;text-align:left;width:40%">Товар</th>
      <th style="padding:8px 4px;width:10%">Кол-во</th>
      <th style="padding:8px 4px;width:15%">Подарок</th>
      <th style="padding:8px 4px;text-align:right;width:15%">Цена</th>
      <th style="padding:8px 4px;text-align:right;width:15%">Сумма</th>
    </tr></thead>
    <tbody>${itemRows}
      <tr style="background:#f8fafc;font-weight:bold;border-top:2px solid #e2e8f0">
        <td colspan="2" style="padding:10px 8px">ИТОГО</td>
        <td style="text-align:center">${boxes}</td>
        <td style="text-align:center;color:#059669">${gifts > 0 ? "+" + gifts : "—"}</td>
        <td></td><td style="text-align:right">${fmt(total)}</td>
      </tr>
    </tbody></table>
  <div style="background:#f8fafc;padding:15px;border-radius:8px;margin-bottom:20px;text-align:right">
    <span style="font-weight:bold;font-size:15px;margin-right:15px">К ОПЛАТЕ:</span>
    <span style="font-weight:900;font-size:22px;color:#e11d48">${fmt(total)}</span>
  </div>
  <div style="font-size:11px;margin-bottom:20px;color:#64748b">
    WhatsApp: <b>0509 070 708</b> | Мбанк: <b>0509 070 708</b>
  </div>
  <table width="100%" style="margin-top:40px"><tr>
    <td style="width:45%;border-top:1px solid #cbd5e1;font-size:10px;color:#94a3b8;padding-top:5px">Выдал</td>
    <td style="width:10%"></td>
    <td style="width:45%;border-top:1px solid #cbd5e1;font-size:10px;color:#94a3b8;padding-top:5px">Получил</td>
  </tr></table>
</div></body></html>`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow.focus();
  setTimeout(() => {
    frame.contentWindow.print();
    setTimeout(() => document.body.removeChild(frame), 1000);
  }, 350);
}
