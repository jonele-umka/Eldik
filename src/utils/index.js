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
  // Защита от падения экрана целиком, если данные ещё не загрузились
  // (например бэкенд временно недоступен) и arr — не массив.
  if (!Array.isArray(arr)) return [];
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

// Позволяет писать количество прямо как в тетради — "100х50", "50х3х5",
// через х/×/* — и само перемножает в одно итоговое число. Обычное число
// (без множителей) возвращается как есть.
export function parseQtyExpr(str) {
  const parts = String(str || "")
    .split(/[x×хX*]/)
    .map((p) => Number(String(p).trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) return 0;
  return parts.reduce((a, b) => a * b, 1);
}

export const parseDate = (s) => {
  const p = String(s || "")
    .split(" ")[0]
    .split(".");
  return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime() : 0;
};

// Распределяет "непривязанные" прямые оплаты и взаимозачёты клиента по
// его долгам (заказы + нач. остаток) — от старых к новым, но строго по
// датам: оплата гасит только те долги, которые УЖЕ существовали на
// момент этой оплаты. Нужно, чтобы статус оплаты заказа совпадал на
// всех страницах, даже если оплата была внесена без привязки к
// конкретному заказу (кнопка "Внести оплату" на карточке клиента/должника).
//
// Раньше было проще: сначала гасились ВСЕ текущие заказы (от старого к
// новому), и только остаток уходил в нач. остаток. Из-за этого уже
// улёгшийся излишек (ушедший в нач. остаток) при появлении НОВОГО
// заказа задним числом пересчитывался и "перетягивался" на этот новый
// заказ — хотя оплата была внесена раньше, чем заказ вообще появился.
// Пример: заказ на 79500, оплатили 100000 — 79500 закрывает заказ,
// 20500 уходит в нач. остаток. Появляется второй заказ — эти 20500 не
// должны никуда переезжать, они уже "потрачены" на нач. остаток.
//
// Возвращает { groups, openingRemainingByClient } — groups мутируется
// на месте (как и раньше), поэтому старые вызовы, игнорирующие
// возвращаемое значение, продолжают работать без изменений.
// Возврат по уже ОПЛАЧЕННОМУ заказу: оплата получается больше, чем осталось
// после возврата. Эта переплата не пропадает — становится зачётом (с
// датой возврата) и гасит другие долги клиента. Та же логика, что и в
// getDebtors (Code.gs), чтобы цифры совпадали. groups — ВСЕ заказы
// (не отфильтрованные), returns — список возвратов.
export function buildReturnCredits(groups, returns) {
  const arrR = Array.isArray(returns) ? returns : [];
  const out = [];
  (Array.isArray(groups) ? groups : []).forEach((g) => {
    const sum = Number(g.totalSum || 0);
    const paid = Number(g.paidAmount || 0);
    const ret = Number(g.returnedAmount || 0);
    const byReturn = Math.max(0, paid + ret - sum) - Math.max(0, paid - sum);
    if (!(byReturn > 0)) return;
    let date = 0;
    arrR.forEach((r) => {
      if (String(r.orderId || "").trim() === String(g.oid).trim()) {
        date = Math.max(date, parseDate(r.date));
      }
    });
    out.push({
      client: g.client,
      amount: byReturn,
      date: date || parseDate(g.orderDate),
    });
  });
  return out;
}

export function distributeClientCredits(
  groups,
  payments,
  offsets,
  openingBalances,
  returnCredits,
  returns,
) {
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();
  const arrP = Array.isArray(payments) ? payments : [];
  const arrO = Array.isArray(offsets) ? offsets : [];
  const arrOB = Array.isArray(openingBalances) ? openingBalances : [];

  // Каждая непривязанная оплата/зачёт — своей записью со своей датой
  // (а не одной суммой на клиента), чтобы её нельзя было применить к
  // долгу, которого на тот момент ещё не было.
  const creditsByClient = {};
  const pushCredit = (key, amount, date, isOffset) => {
    if (!key || !(amount > 0)) return;
    if (!creditsByClient[key]) creditsByClient[key] = [];
    creditsByClient[key].push({
      amount,
      date: (typeof date === "number" ? date : parseDate(date)) || 0,
      isOffset,
    });
  };
  const openingPaidByClient = {};
  arrP.forEach((p) => {
    const orderId = String(p.orderId || "").trim();
    if (orderId === "OPENING") {
      // оплата, внесённая специально на нач. остаток
      const key = norm(p.client);
      openingPaidByClient[key] =
        (openingPaidByClient[key] || 0) + Number(p.amount || 0);
      return;
    }
    if (orderId) return; // уже учтено бэкендом в paidAmount заказа
    // У оплаты дата лежит в paymentDate (а не date, как у заказа/зачёта/
    // нач. остатка) — раньше здесь было p.date, которого на объекте
    // оплаты не существует, поэтому дата "терялась" (uходила в 0 —
    // раньше вообще всех долгов) и оплата просто нигде не засчитывалась:
    // ни заказ, ни нач. остаток не уменьшались, хотя оплата числилась
    // внесённой.
    pushCredit(norm(p.client), Number(p.amount || 0), p.paymentDate, false);
  });
  arrO.forEach((o) => {
    pushCredit(norm(o.client), Number(o.amount || 0), o.date, true);
  });
  (Array.isArray(returnCredits) ? returnCredits : []).forEach((c) => {
    pushCredit(norm(c.client), Number(c.amount || 0), c.date, false);
  });

  const openingByClient = {};
  const openingDateByClient = {};
  arrOB.forEach((o) => {
    if (o.type && o.type !== "client") return;
    const key = norm(o.name || o.client);
    if (!key) return;
    openingByClient[key] = (openingByClient[key] || 0) + Number(o.amount || 0);
    const d = parseDate(o.date) || 0;
    openingDateByClient[key] =
      key in openingDateByClient ? Math.min(openingDateByClient[key], d) : d;
  });

  // Ручные возвраты (OrderID = "OPENING": товара нет в заказах) сначала
  // гасят начальный остаток клиента; излишек — зачёт в долги по заказам.
  // Та же логика, что в getDebtors (Code.gs).
  const openingRet = {};
  (Array.isArray(returns) ? returns : []).forEach((r) => {
    if (String(r.orderId || "").trim() !== "OPENING") return;
    const key = norm(r.client);
    if (!key) return;
    const o = openingRet[key] || (openingRet[key] = { sum: 0, date: 0 });
    o.sum += Number(r.amount || 0);
    o.date = Math.max(o.date, parseDate(r.date));
  });
  Object.keys(openingRet).forEach((key) => {
    const have = openingByClient[key] || 0;
    const applied = Math.min(openingRet[key].sum, Math.max(0, have));
    openingByClient[key] = have - applied;
    pushCredit(key, openingRet[key].sum - applied, openingRet[key].date, false);
  });

  Object.keys(openingPaidByClient).forEach((key) => {
    openingByClient[key] = Math.max(
      0,
      (openingByClient[key] || 0) - openingPaidByClient[key],
    );
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
    ...Object.keys(creditsByClient),
  ]);

  allClientKeys.forEach((key) => {
    const openingDebt = openingByClient[key] || 0;

    // Долги клиента — заказы (от старого к новому) и нач. остаток. Внутри
    // заказов сортируем по дате, но заказы как группа всегда идут ПЕРЕД
    // нач. остатком (а не по чистой дате долга) — нач. остаток почти
    // всегда старше самих заказов по дате, а приоритет тут другой: клиент
    // платит за конкретную (обычно недавнюю) поставку, она закрывается
    // полностью, и только излишек уменьшает старый долг.
    const debts = (byClient[key] || [])
      .slice()
      .sort((a, b) => parseDate(a.orderDate) - parseDate(b.orderDate))
      .map((g) => ({
        kind: "order",
        date: parseDate(g.orderDate) || 0,
        group: g,
        remaining: Math.max(
          0,
          Number(g.totalSum || 0) -
            Number(g.returnedAmount || 0) -
            Number(g.paidAmount || 0),
        ),
      }));
    if (openingDebt > 0) {
      debts.push({
        kind: "opening",
        date: openingDateByClient[key] || 0,
        remaining: openingDebt,
      });
    }
    debts.sort((a, b) =>
      a.kind !== b.kind ? (a.kind === "order" ? -1 : 1) : a.date - b.date,
    );

    // Оплаты/зачёты — от старой к новой. Каждая гасит долги, которые
    // существовали НА МОМЕНТ этой оплаты (или раньше) — заказ, оформленный
    // позже, более ранней оплатой закрыт быть не может.
    const credits = (creditsByClient[key] || [])
      .slice()
      .sort((a, b) => a.date - b.date);

    // Оплаты гасят ТОЛЬКО заказы (от старых к новым), нач. остаток не
    // трогают (только оплата с галочкой «на начальный остаток» и ручной
    // возврат). Сначала — долги на момент оплаты, остаток оплаты — на любые
    // неоплаченные заказы по порядку. Та же логика, что в getDebtors.
    const apply = (credit, item, remaining) => {
      const applied = Math.min(remaining, item.remaining);
      item.remaining -= applied;
      if (item.kind === "order") {
        const g = item.group;
        g.totalPaidAmount =
          (g.totalPaidAmount ?? Number(g.paidAmount || 0)) + applied;
        if (credit.isOffset) g.offsetAmount = (g.offsetAmount || 0) + applied;
      }
      return remaining - applied;
    };
    credits.forEach((credit) => {
      let remaining = credit.amount;
      for (const item of debts) {
        if (remaining <= 0) break;
        if (item.date > credit.date) continue;
        if (item.kind === "opening") continue;
        if (item.remaining <= 0) continue;
        remaining = apply(credit, item, remaining);
      }
      for (const item of debts) {
        if (remaining <= 0) break;
        if (item.kind !== "order" || item.remaining <= 0) continue;
        remaining = apply(credit, item, remaining);
      }
    });

    const openingItem = debts.find((d) => d.kind === "opening");
    openingRemainingByClient[key] = openingItem
      ? openingItem.remaining
      : Math.max(0, openingDebt);
  });

  return { groups, openingRemainingByClient };
}

// Карты "не хватает" / "не поместилось" по ключу "orderId::товар" — те же,
// что строят карточки заказов.
export function buildMissingMap(list) {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((r) => {
    if (r.orderId && r.product && Number(r.qty) > 0)
      m.set(`${r.orderId}::${r.product}`, Number(r.qty));
  });
  return m;
}

// Сумма заказа "К оплате": итог минус возвраты, нехватка и "не поместилось".
// Та же формула, что в карточке заказа (OrderCard) — чтобы суммы на всех
// страницах совпадали.
export function orderEffectiveTotal(group, stockOutMap, notFitMap) {
  const rows = group.rows || [];
  let deduction = 0;
  rows.forEach((r) => {
    if (!r.product) return;
    const qty = Number(r.paidQuantity ?? r.quantity ?? 0);
    const missing = Math.min(
      qty,
      Number(
        (stockOutMap && stockOutMap.get(`${group.oid}::${r.product}`)) || 0,
      ),
    );
    const notFit = Math.min(
      Math.max(0, qty - missing),
      Number((notFitMap && notFitMap.get(`${group.oid}::${r.product}`)) || 0),
    );
    deduction += (missing + notFit) * Number(r.price || 0);
  });
  return Math.max(
    0,
    Number(group.totalSum || 0) - Number(group.returnedAmount || 0) - deduction,
  );
}

export const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
export function monthTitle(key) {
  const [y, m] = String(key || "").split("-");
  return `${MONTH_NAMES_RU[Number(m) - 1] || m} ${y || ""}`.trim();
}
