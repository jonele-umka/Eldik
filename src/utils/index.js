export const fmt = (n) => Number(n || 0).toLocaleString("ru-RU");
export const fmtM = (n) => fmt(n) + " с";

export const getMonth = (d) => {
  if (!d) return "";
  const p = String(d).split(" ")[0].split(".");
  return p.length === 3 ? `${p[2]}-${p[1]}` : "";
};

export const PAGE = 50;

export function paginate(arr, page) {
  return arr.slice((page - 1) * PAGE, page * PAGE);
}

// Сопоставляет "сырое" и "каноничное" имя клиента/поставщика.
// Одного и того же человека иногда сохраняют под разными вариантами
// имени в разных местах (например, заказ на "Элдияр ДФ", а начальный
// остаток когда-то внесли просто как "Элдияр") — бэкенд в getDebtors()
// уже умеет сводить такие варианты в одну запись через резолвер имён
// по листу "Клиенты"/"Поставщики". Здесь — тот же принцип на фронте,
// без доступа к листу: считаем совпадением точное имя, а также случай,
// когда один вариант — префикс другого до пробела.
export function sameClient(a, b) {
  const na = String(a || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const nb = String(b || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb + " ")) return true;
  if (nb.startsWith(na + " ")) return true;
  return false;
}

export function filterSearch(arr, keys, q) {
  if (!q) return arr;
  const lq = q.toLowerCase();
  return arr.filter((r) =>
    keys.some((k) =>
      String(r[k] || "")
        .toLowerCase()
        .includes(lq),
    ),
  );
}

export function sortArr(arr, col, dir) {
  return [...arr].sort((a, b) => {
    let va = a[col],
      vb = b[col];
    const parseDate = (v) => {
      if (!v) return 0;
      const p = String(v).split(" ")[0].split(".");
      if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
      return 0;
    };
    if (col === "orderDate" || col === "deliveryDate") {
      va = parseDate(va);
      vb = parseDate(vb);
    } else if (typeof va === "string") {
      va = va.toLowerCase();
      vb = vb.toLowerCase();
    }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export function unique(arr, key) {
  return [...new Set(arr.map((r) => r[key]).filter(Boolean))].sort();
}

// Группируем строки заказов по orderId
export function buildOrderGroups(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const oid = r.orderId || `${r.client}-${r.orderDate}`;
    if (!map.has(oid)) {
      map.set(oid, {
        oid,
        client: r.client,
        market: r.market,
        orderDate: r.orderDate,
        deliveryDate: r.deliveryDate,
        status: r.status,
        paidAmount: Number(r.paidAmount || 0),
        returnedAmount: Number(r.returnedAmount || 0),
        rows: [],
        totalSum: 0,
      });
    }
    const g = map.get(oid);
    g.rows.push(r);
    g.totalSum += Number(r.total || 0);
    g.paidAmount = Math.max(g.paidAmount, Number(r.paidAmount || 0));
    g.returnedAmount = Math.max(
      g.returnedAmount,
      Number(r.returnedAmount || 0),
    );
  });
  return [...map.values()];
}

export const parseDate = (s) => {
  const p = String(s || "")
    .split(" ")[0]
    .split(".");
  return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime() : 0;
};

// Распределяет "непривязанные" прямые оплаты и взаимозачёты клиента
// по его заказам — от старых к новым (старый долг гасится первым).
// Нужно, чтобы статус оплаты заказа совпадал на всех страницах,
// даже если оплата была внесена без привязки к конкретному заказу
// (кнопка "Внести оплату" на карточке клиента/должника).
//
// Приоритет гашения: СНАЧАЛА заказы (от старого к новому), и только
// то, что осталось сверх — уходит в начальный остаток. Так и работает
// на практике: клиент платит за конкретную (обычно недавнюю) поставку,
// эта поставка/заказ закрывается полностью, а излишек уменьшает старый
// долг. Если оплата ровно по сумме заказа — весь заказ просто оплачен,
// нач. остаток не трогается.
//
// Возвращает { groups, openingRemainingByClient } — groups мутируется
// на месте (как и раньше), поэтому старые вызовы, игнорирующие
// возвращаемое значение, продолжают работать без изменений.
export function distributeClientCredits(
  groups,
  payments,
  offsets,
  openingBalances,
) {
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();
  const arrP = Array.isArray(payments) ? payments : [];
  const arrO = Array.isArray(offsets) ? offsets : [];
  const arrOB = Array.isArray(openingBalances) ? openingBalances : [];

  const unassignedPayByClient = {};
  arrP.forEach((p) => {
    const orderId = String(p.orderId || "").trim();
    if (orderId) return; // уже учтено бэкендом в paidAmount заказа
    const key = norm(p.client);
    if (!key) return;
    unassignedPayByClient[key] =
      (unassignedPayByClient[key] || 0) + Number(p.amount || 0);
  });

  const offsetByClient = {};
  arrO.forEach((o) => {
    const key = norm(o.client);
    if (!key) return;
    offsetByClient[key] = (offsetByClient[key] || 0) + Number(o.amount || 0);
  });

  const openingByClient = {};
  arrOB.forEach((o) => {
    if (o.type && o.type !== "client") return;
    const key = norm(o.name || o.client);
    if (!key) return;
    openingByClient[key] = (openingByClient[key] || 0) + Number(o.amount || 0);
  });

  const byClient = {};
  groups.forEach((g) => {
    const key = norm(g.client);
    if (!byClient[key]) byClient[key] = [];
    byClient[key].push(g);
  });

  const openingRemainingByClient = {};

  // Клиенты могут иметь начальный остаток, но не иметь заказов в этом
  // наборе groups — всё равно нужно посчитать, сколько из остатка
  // уже погашено оплатами/взаимозачётами.
  const allClientKeys = new Set([
    ...Object.keys(byClient),
    ...Object.keys(openingByClient),
  ]);

  allClientKeys.forEach((key) => {
    let remainingCredit =
      (unassignedPayByClient[key] || 0) + (offsetByClient[key] || 0);
    let remainingOffset = offsetByClient[key] || 0;

    // 1) Сначала гасим заказы, от старого к новому.
    const clientGroups = [...(byClient[key] || [])].sort(
      (a, b) => parseDate(a.orderDate) - parseDate(b.orderDate),
    );

    clientGroups.forEach((g) => {
      const effectiveTotal = Math.max(
        0,
        Number(g.totalSum || 0) - Number(g.returnedAmount || 0),
      );
      const alreadyPaid = Number(g.paidAmount || 0);
      const remainingDebt = Math.max(0, effectiveTotal - alreadyPaid);
      const applied = Math.min(remainingCredit, remainingDebt);
      const offsetApplied = Math.min(remainingOffset, applied);

      remainingCredit -= applied;
      remainingOffset -= offsetApplied;

      g.offsetAmount = (g.offsetAmount || 0) + offsetApplied;
      g.totalPaidAmount = alreadyPaid + applied;
    });

    // 2) То, что осталось сверх всех заказов — уменьшает нач. остаток.
    const openingDebt = openingByClient[key] || 0;
    const appliedToOpening = Math.min(remainingCredit, openingDebt);
    remainingCredit -= appliedToOpening;
    openingRemainingByClient[key] = Math.max(0, openingDebt - appliedToOpening);
  });

  return { groups, openingRemainingByClient };
}
