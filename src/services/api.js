// =============================================================================
// api.js — все запросы к Google Apps Script (тот же бэкенд, что у мобильного
// приложения). Набор действий 1:1 совпадает с Code.gs.
//
// ВАЖНО про CORS: POST отправляется с Content-Type: text/plain. Тогда браузер
// считает запрос "простым" и не шлёт preflight OPTIONS, который Apps Script
// не умеет обрабатывать. Тело остаётся JSON — на бэкенде читается
// как e.postData.contents.
// =============================================================================

let BASE_URL = "";

export function setApiUrl(url) {
  BASE_URL = url || "";
}
export function getApiUrl() {
  return BASE_URL;
}

export async function apiGet(action) {
  const res = await fetch(`${BASE_URL}?action=${action}&_t=${Date.now()}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

export async function apiPost(body) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data && data.success === false) {
    throw new Error(data.error || "Ошибка сервера");
  }
  return data;
}

/* ─── ЗАКАЗЫ ───────────────────────────────────────────────────────────── */
export const saveOrder = (d) => apiPost({ action: "saveOrder", ...d });
export const updateOrder = (d) => apiPost({ action: "updateOrder", ...d });
export const addOrderRow = (d) => apiPost({ action: "addOrderRow", ...d });
export const deleteOrder = (orderId) => apiPost({ action: "deleteOrder", orderId });
export const deleteOrderRow = (rowId) => apiPost({ action: "deleteOrderRow", rowId });
export const updateStatus = (orderId, status) =>
  apiPost({ action: "updateStatus", orderId, status });

/* ─── ПЛАТЕЖИ И ВОЗВРАТЫ ──────────────────────────────────────────────── */
export const savePayment = (d) => apiPost({ action: "savePayment", ...d });
export const updatePayment = (d) => apiPost({ action: "updatePayment", ...d });
export const deletePayment = (paymentId) => apiPost({ action: "deletePayment", paymentId });
export const saveReturn = (d) => apiPost({ action: "saveReturn", ...d });
export const saveDebtReturn = (d) => apiPost({ action: "saveDebtReturn", ...d });

/* ─── КЛИЕНТЫ ─────────────────────────────────────────────────────────── */
export const saveClient = (d) => apiPost({ action: "saveClient", ...d });
export const updateClient = (d) => apiPost({ action: "updateClient", ...d });
export const deleteClient = (id) => apiPost({ action: "deleteClient", id });

/* ─── РАСХОДЫ ─────────────────────────────────────────────────────────── */
export const saveExpense = (d) => apiPost({ action: "saveExpense", ...d });
export const updateExpense = (d) => apiPost({ action: "updateExpense", ...d });
export const deleteExpense = (id) => apiPost({ action: "deleteExpense", id });

/* ─── ЗАМЕТКИ ─────────────────────────────────────────────────────────── */
export const saveNote = (title, text) => apiPost({ action: "saveNote", title, text });
export const updateNote = (id, title, text) => apiPost({ action: "updateNote", id, title, text });
export const toggleNote = (id, completed) => apiPost({ action: "toggleNote", id, completed });
export const deleteNote = (id) => apiPost({ action: "deleteNote", id });

/* ─── ПОСТАВЩИКИ ──────────────────────────────────────────────────────── */
export const getSuppliers = () => apiGet("suppliers");  
export const saveSupplier = (d) => apiPost({ action: "saveSupplier", ...d });
export const updateSupplier = (d) => apiPost({ action: "updateSupplier", ...d });
export const deleteSupplier = (id) => apiPost({ action: "deleteSupplier", id });

/* ─── ЗАКУПКИ ─────────────────────────────────────────────────────────── */
export const savePurchase = (d) => apiPost({ action: "savePurchase", ...d });
export const updatePurchase = (d) => apiPost({ action: "updatePurchase", ...d });
export const deletePurchase = (id) => apiPost({ action: "deletePurchase", id });
export const saveSupplierDebt = (d) => apiPost({ action: "saveSupplierDebt", ...d });

/* ─── ПЛАТЕЖИ ПОСТАВЩИКАМ ─────────────────────────────────────────────── */
export const saveSupplierPayment = (d) => apiPost({ action: "saveSupplierPayment", ...d });
export const updateSupplierPayment = (d) => apiPost({ action: "updateSupplierPayment", ...d });
export const deleteSupplierPayment = (id) => apiPost({ action: "deleteSupplierPayment", id });

/* ─── ВЗАИМОЗАЧЁТЫ ────────────────────────────────────────────────────── */
export const saveOffset = (d) => apiPost({ action: "saveOffset", ...d });
export const updateOffset = (d) => apiPost({ action: "updateOffset", ...d });
export const deleteOffset = (id) => apiPost({ action: "deleteOffset", id });

/* ─── СЫРЬЁ ───────────────────────────────────────────────────────────── */
export const saveRawMaterial = (d) => apiPost({ action: "saveRawMaterial", ...d });
export const updateRawMaterial = (d) => apiPost({ action: "updateRawMaterial", ...d });
export const deleteRawMaterial = (id) => apiPost({ action: "deleteRawMaterial", id });

/* ─── НАЧАЛЬНЫЕ ОСТАТКИ ───────────────────────────────────────────────── */
export const saveOpeningBalance = (d) => apiPost({ action: "saveOpeningBalance", ...d });
export const updateOpeningBalance = (d) => apiPost({ action: "updateOpeningBalance", ...d });
export const deleteOpeningBalance = (id) => apiPost({ action: "deleteOpeningBalance", id });

/* ─── КАТАЛОГ / ЦЕНЫ ──────────────────────────────────────────────────── */
export const savePrice = (d) => apiPost({ action: "savePrice", ...d });
export const updatePrice = (d) => apiPost({ action: "updatePrice", ...d });
export const deletePrice = (product) => apiPost({ action: "deletePrice", product });

/* ─── ПРОЧЕЕ ──────────────────────────────────────────────────────────── */
export const forceUpdateAll = () => apiPost({ action: "forceUpdateAll" });
