// Единая цена товара для всех рынков (надбавка для Аламедина убрана).
export function priceOf(priceRow, market) {
  if (!priceRow) return 0;
  return Number(priceRow.price || 0);
}
