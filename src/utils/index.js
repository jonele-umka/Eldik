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
export function distributeClientCredits(groups, payments, offsets) {
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();
  const arrP = Array.isArray(payments) ? payments : [];
  const arrO = Array.isArray(offsets) ? offsets : [];

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

  const byClient = {};
  groups.forEach((g) => {
    const key = norm(g.client);
    if (!byClient[key]) byClient[key] = [];
    byClient[key].push(g);
  });

  Object.keys(byClient).forEach((key) => {
    let remainingCredit =
      (unassignedPayByClient[key] || 0) + (offsetByClient[key] || 0);
    let remainingOffset = offsetByClient[key] || 0;

    const clientGroups = [...byClient[key]].sort(
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
  });

  return groups;
}
