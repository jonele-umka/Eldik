function fmtDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d || "—");
  return dt.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
