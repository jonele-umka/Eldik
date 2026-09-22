import { useEffect, useState } from "react";

// Акция «+1 коробка за каждые 10» — как в мобильном приложении.
export function calcPromo(qty, promoEnabled) {
  const q = Number(qty) || 0;
  const giftQty = promoEnabled ? Math.floor(q / 10) : 0;
  return { paidQty: q, giftQty, finalQty: q + giftQty };
}

const KEY = "promoEnabled";

export function usePromo() {
  const [promoEnabled, setPromoEnabled] = useState(
    () => localStorage.getItem(KEY) === "true",
  );

  useEffect(() => {
    const handler = () => setPromoEnabled(localStorage.getItem(KEY) === "true");
    window.addEventListener("promo-changed", handler);
    return () => window.removeEventListener("promo-changed", handler);
  }, []);

  const togglePromo = () => {
    const next = !(localStorage.getItem(KEY) === "true");
    localStorage.setItem(KEY, String(next));
    window.dispatchEvent(new Event("promo-changed"));
  };

  return { promoEnabled, togglePromo };
}

// Единая цена товара для всех рынков (надбавка для Аламедина убрана).
export function priceOf(priceRow, market) {
  if (!priceRow) return 0;
  return Number(priceRow.price || 0);
}
