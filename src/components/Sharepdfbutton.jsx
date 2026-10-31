// Кнопка «📤 PDF»: собирает документ из HTML, делает PDF-файл и отправляет
// через меню «Поделиться» (WhatsApp / Telegram на телефоне) или скачивает.
// Нужен пакет:  npm i html2pdf.js
import { useState } from "react";
import { Btn } from "./Form.jsx";
import { useUI } from "../store/UIContext.jsx";

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// HTML -> PDF (Blob). Блок не добавляем в страницу и не позиционируем —
// html2pdf сам клонирует его; иначе страница получается пустой.
export async function htmlToPdfBlob(html) {
  const html2pdf = (await import("html2pdf.js")).default;
  const el = document.createElement("div");
  el.style.cssText = "width:720px;background:#fff;";
  el.innerHTML = html;
  return html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".keep"] },
    })
    .from(el)
    .outputPdf("blob");
}

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function SharePdfButton({
  label = "📤 PDF",
  filename,
  getHtml,
  size = "sm",
  title = "Сформировать PDF и отправить",
}) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);

  const onClick = async (e) => {
    e.stopPropagation();
    try {
      setBusy(true);
      const name = String(filename || "документ.pdf").replace(
        /[\\/:*?"<>|]/g,
        "",
      );
      const blob = await htmlToPdfBlob(getHtml());
      const file = new File([blob], name, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        download(blob, name);
        toast("PDF скачан — перетащите его в чат или прикрепите", "ok");
      }
    } catch (err) {
      if (err && err.name === "AbortError") return; // закрыл меню — не ошибка
      toast("Не удалось создать PDF: " + err.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Btn
      size={size}
      variant="ghost"
      onClick={onClick}
      loading={busy}
      title={title}
    >
      {label}
    </Btn>
  );
}
