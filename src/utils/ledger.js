export const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

// "15.08.2026 14:23:01" -> 20260815142301 (для сортировки)
export function dateTimeKey(str) {
  const raw = String(str || "").trim();
  const [datePart, timePart = "00:00:00"] = raw.split(" ");
  const d = datePart.split(".");
  if (d.length !== 3) return 0;
  const t = timePart.split(":");
  const num = (v) => Number(v) || 0;
  return (
    num(d[2]) * 1e10 +
    num(d[1]) * 1e8 +
    num(d[0]) * 1e6 +
    num(t[0]) * 1e4 +
    num(t[1]) * 1e2 +
    num(t[2])
  );
}

export const onlyDate = (str) => String(str || "").split(" ")[0] || "—";

export const onlyTime = (str) => {
  const t = String(str || "").split(" ")[1];
  if (!t) return "";
  const hhmm = t.slice(0, 5);
  return hhmm === "00:00" ? "" : hhmm;
};

export function fmtDateTime(str) {
  const d = onlyDate(str);
  const t = onlyTime(str);
  return t ? `${d} · ${t}` : d;
}

// Та же логика, что и в мобильном services/ledger.js —
// прячем служебную половинку зачёта из ленты оплат поставщикам,
// иначе сумма задваивается.
export const isOffsetSupplierPayment = (p) => {
  const c = String(p?.comment || "");
  return (
    p?.isOffset === true || c.includes("[OFS_") || c.startsWith("Взаимозачёт")
  );
};
