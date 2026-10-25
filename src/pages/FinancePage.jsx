import { useState } from "react";
import {
  fmtM,
  buildOrderGroups,
  buildMissingMap,
  orderEffectiveTotal,
} from "../utils/index.js";
import { useData } from "../store/DataContext.jsx";
import { KPI, TR, TD, TH, MoneyCell } from "../components/UI.jsx";
import { S } from "../utils/styles.js";

const MONTHS = {
  "01": "Январь",
  "02": "Февраль",
  "03": "Март",
  "04": "Апрель",
  "05": "Май",
  "06": "Июнь",
  "07": "Июль",
  "08": "Август",
  "09": "Сентябрь",
  10: "Октябрь",
  11: "Ноябрь",
  12: "Декабрь",
};

function monthName(key) {
  const [year, month] = (key || "").split("-");
  return `${MONTHS[month] || month} ${year || ""}`.trim();
}

const cleanNum = (v) =>
  parseFloat(
    String(v)
      .replace(/[\s\u00a0]/g, "")
      .replace(",", "."),
  ) || 0;

function calcDebt(rawOrders) {
  if (!Array.isArray(rawOrders)) return 0;
  const groups = {};
  rawOrders.forEach((item) => {
    const key = item.orderId;
    if (!key || !item.client) return;
    if (!groups[key]) {
      groups[key] = {
        totalSum: 0,
        paidAmount: Number(item.paidAmount || 0),
        returnedAmount: Number(item.returnedAmount || 0),
      };
    }
    groups[key].totalSum += cleanNum(item.total);
  });
  return Object.values(groups).reduce(
    (s, o) => s + Math.max(0, o.totalSum - o.returnedAmount - o.paidAmount),
    0,
  );
}

const normClient = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

// \u0410\u043c\u0430\u043d \u2014 \u044d\u0442\u043e \u0430\u0433\u0435\u043d\u0442: \u0432\u0441\u0435 \u0435\u0433\u043e \u0441\u043e\u0431\u0441\u0442\u0432\u0435\u043d\u043d\u044b\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u044b \u0437\u0430\u043f\u0438\u0441\u044b\u0432\u0430\u044e\u0442\u0441\u044f \u0432 \u0431\u0430\u0437\u0443 \u043f\u043e\u0434
// \u043e\u0434\u043d\u0438\u043c \u0438\u043c\u0435\u043d\u0435\u043c "\u0410\u043c\u0430\u043d", \u0447\u0442\u043e\u0431\u044b \u043d\u0435 \u0437\u0430\u0432\u043e\u0434\u0438\u0442\u044c \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e. \u0415\u0433\u043e \u0437\u0430\u043a\u0430\u0437\u044b (\u0438
// \u0432\u043e\u0437\u0432\u0440\u0430\u0442\u044b \u043f\u043e \u043d\u0438\u043c) \u043d\u0435 \u0434\u043e\u043b\u0436\u043d\u044b \u0443\u0447\u0438\u0442\u044b\u0432\u0430\u0442\u044c\u0441\u044f \u0432 \u043e\u0431\u044a\u0451\u043c\u0435, \u043e\u0442 \u043a\u043e\u0442\u043e\u0440\u043e\u0433\u043e \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f
// \u0434\u043e\u043b\u044f \u0423\u0440\u043c\u0430\u0442\u0430 \u2014 \u0433\u0440\u0443\u043f\u043f\u0438\u0440\u0443\u0435\u043c \u0437\u0430\u043a\u0430\u0437\u044b \u043f\u043e orderId (\u0447\u0442\u043e\u0431\u044b \u043d\u0435 \u0437\u0430\u0434\u0432\u043e\u0438\u0442\u044c \u0441\u0443\u043c\u043c\u0443 \u043f\u043e
// \u0441\u0442\u0440\u043e\u043a\u0430\u043c \u043e\u0434\u043d\u043e\u0433\u043e \u0437\u0430\u043a\u0430\u0437\u0430 \u0438 \u043d\u0435 \u0437\u0430\u0434\u0432\u043e\u0438\u0442\u044c \u0435\u0433\u043e returnedAmount, \u043a\u043e\u0442\u043e\u0440\u044b\u0439 \u0432
// \u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u0440\u043e\u0434\u0443\u0431\u043b\u0438\u0440\u043e\u0432\u0430\u043d \u043d\u0430 \u043a\u0430\u0436\u0434\u0443\u044e \u0441\u0442\u0440\u043e\u043a\u0443 \u0437\u0430\u043a\u0430\u0437\u0430), \u0437\u0430\u0442\u0435\u043c \u0441\u0443\u043c\u043c\u0438\u0440\u0443\u0435\u043c \u0432\u0441\u0451,
// \u043a\u0440\u043e\u043c\u0435 \u0437\u0430\u043a\u0430\u0437\u043e\u0432 \u043a\u043b\u0438\u0435\u043d\u0442\u0430 "\u0410\u043c\u0430\u043d".
function calcVolumeExcludingAman(rawOrders) {
  if (!Array.isArray(rawOrders)) return { volume: 0, returns: 0 };
  const groups = {};
  rawOrders.forEach((item) => {
    const key = item.orderId;
    if (!key) return;
    if (!groups[key]) {
      groups[key] = {
        client: item.client,
        totalSum: 0,
        returnedAmount: Number(item.returnedAmount || 0),
      };
    }
    groups[key].totalSum += cleanNum(item.total);
  });
  let volume = 0,
    returns = 0;
  Object.values(groups).forEach((g) => {
    if (normClient(g.client) === "\u0430\u043c\u0430\u043d") return;
    volume += g.totalSum;
    returns += g.returnedAmount;
  });
  return { volume, returns };
}

function SectionTitle({ icon, title, subtitle, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "34px 0 14px",
        paddingLeft: 12,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div>
        <div
          style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.3, color }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, bold, sub }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: bold ? 16 : 14,
          fontWeight: bold ? 800 : 700,
          color: color || "var(--text)",
        }}
      >
        {Number(value || 0).toLocaleString()} сом
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function FinancePage({
  data,
  orders,
  payments,
  onSelectClient,
}) {
  const report = data || {};
  const { data: store } = useData();
  const [closedMonths, setClosedMonths] = useState({});

  const totalDebt = calcDebt(orders);

  let allVolume = 0,
    allIncome = 0,
    allExpense = 0,
    allReturns = 0, // стоимость всех возвратов (по дате возврата)
    allCashReturns = 0, // из них уходит из кассы (по оплаченным заказам)
    allBarter = 0; // оплата сырьём (Украина) — гасит долг, но не деньги
  const valueOf = (d) =>
    d.returnsValue !== undefined
      ? Number(d.returnsValue || 0)
      : Number(d.returns || 0);
  Object.values(report).forEach((monthData) => {
    Object.values(monthData).forEach((d) => {
      allVolume += Number(d.totalVolume || 0);
      allIncome += Number(d.income || 0);
      allBarter += Number(d.barter || 0);
      allExpense += Number(d.expense || 0);
      allReturns += valueOf(d);
      allCashReturns += Number(d.returns || 0);
    });
  });
  const allBalance = allIncome - allExpense - allCashReturns;

  // Заказы с учётом возвратов, нехватки и «не поместилось» — как в карточках.
  const stockOutMap = buildMissingMap(store.stockOuts);
  const notFitMap = buildMissingMap(store.notFits);
  const orderGroups = buildOrderGroups(Array.isArray(orders) ? orders : []).map(
    (g) => ({
      ...g,
      effective: orderEffectiveTotal(g, stockOutMap, notFitMap),
    }),
  );

  // Доли считаются от ПОСТУПИВШИХ денег (платежей):
  //  • Урмат — 5% от платежей рынка «Дордой-фуд» (без Амана и Украины),
  //    по периодам с 15-го по 14-е число;
  //  • Аман — 4% от платежей клиента «Аман», за всё время;
  //  • «Украина» платит сырьём (бартер): входит в кассу и в долю Урмата.
  const parseDay = (str) => {
    const [dd, mm, yy] = String(str || "")
      .split(" ")[0]
      .split(".")
      .map(Number);
    return dd && mm && yy ? { dd, mm, yy } : null;
  };
  const MS = [
    "янв",
    "фев",
    "мар",
    "апр",
    "мая",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ];
  const periodKeyOf = (t) => {
    let y = t.yy,
      m = t.mm;
    if (t.dd < 15) {
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return `${y}-${String(m).padStart(2, "0")}`;
  };
  const DISCOUNT = 0.03;
  const urmatPeriods = {};
  let amanReceived = 0;
  let amanMonth = 0;
  const nowD = new Date();
  (Array.isArray(payments) ? payments : []).forEach((p) => {
    const c = normClient(p.client);
    const amount = Number(p.amount || 0);
    if (c === "аман") {
      amanReceived += amount;
      const ta = parseDay(p.paymentDate);
      if (ta && ta.mm === nowD.getMonth() + 1 && ta.yy === nowD.getFullYear())
        amanMonth += amount;
      return;
    }
    if (!c.includes("украина") && normClient(p.market) !== "дордой-фуд") return;
    const t = parseDay(p.paymentDate);
    if (!t) return;
    const key = periodKeyOf(t);
    // Зарплата — 5% от полученных денег; скидка 3% клиентам на неё не влияет.
    urmatPeriods[key] = (urmatPeriods[key] || 0) + amount;
  });
  // Объём заказов рынка «Дордой-фуд» (без Амана) по тем же периодам.
  const volumePeriods = {};
  orderGroups.forEach((g) => {
    if (
      normClient(g.market) !== "дордой-фуд" ||
      normClient(g.client) === "аман"
    )
      return;
    const t = parseDay(g.deliveryDate || g.orderDate);
    if (!t) return;
    const key = periodKeyOf(t);
    volumePeriods[key] = (volumePeriods[key] || 0) + g.effective;
  });
  const dordoiVolume = Object.values(volumePeriods).reduce((a, b) => a + b, 0);
  const periodLabel = (key) => {
    const [y, m] = key.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `15 ${MS[m - 1]} ${y} – 14 ${MS[nm - 1]} ${ny}`;
  };
  const periodKeys = [
    ...new Set([...Object.keys(urmatPeriods), ...Object.keys(volumePeriods)]),
  ]
    .sort()
    .reverse();
  const urmatTotal = periodKeys.reduce(
    (s, k) => s + (urmatPeriods[k] || 0) * 0.05,
    0,
  );
  const amanCut = amanReceived * 0.04;
  const amanMonthCut = amanMonth * 0.04;
  const curKey = periodKeyOf({
    dd: nowD.getDate(),
    mm: nowD.getMonth() + 1,
    yy: nowD.getFullYear(),
  });
  const curUrmat = (urmatPeriods[curKey] || 0) * 0.05;
  const curReceived = urmatPeriods[curKey] || 0;
  const curVolume = volumePeriods[curKey] || 0;
  const akylbekNetProfit = allBalance - urmatTotal - amanCut;

  // Клиенты со скидкой 3%: периоды с 16-го по 16-е включительно, по каждому периоду —
  // сколько заказано, сумма после скидки и сколько оплачено.
  const kPeriodKey = (t, startDay) => {
    let y = t.yy,
      m = t.mm;
    if (t.dd < startDay) {
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return `${y}-${String(m).padStart(2, "0")}`;
  };
  const kLabel = (key, startDay, endDay) => {
    const [y, m] = key.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${startDay} ${MS[m - 1]} ${y} – ${endDay} ${MS[nm - 1]} ${ny}`;
  };
  // Периоды, в которые попадает день. Если overlap — день границы (16-е)
  // входит и в закрывающийся, и в начинающийся период (16 по 16 включительно).
  const kPeriodKeys = (t, startDay, overlap) => {
    const ks = [kPeriodKey(t, startDay)];
    // 16-е входит и в предыдущий период, но не раньше первого (с 16 сентября)
    if (overlap && t.dd === startDay && !(t.yy === 2026 && t.mm === 9))
      ks.push(kPeriodKey({ ...t, dd: startDay - 1 }, startDay));
    return ks;
  };
  const discountClients = [
    {
      match: "кубаныч",
      title: "Кубаныч ДФ",
      discount: DISCOUNT,
      startDay: 16,
      endDay: 16,
      overlap: true,
      since: 20260916,
    },
    {
      match: "элдияр",
      title: "Элдияр ДФ",
      discount: DISCOUNT,
      startDay: 16,
      endDay: 16,
      overlap: true,
      since: 20260916,
    },
    // Бартер: «оплачено» — это приходы товаров от Украины (считаются как оплата)
    {
      match: "украина",
      title: "Украина ДФ — оплата товарами (бартер)",
      discount: 0,
      startDay: 15,
      endDay: 14,
      barter: true,
    },
  ].map(
    ({ match, title, discount, startDay, endDay, overlap, since, barter }) => {
      const periods = {};
      const row = (k) => periods[k] || (periods[k] = { orders: 0, paid: 0 });
      let realName = "";
      let totOrders = 0;
      let totPaid = 0;
      orderGroups.forEach((g) => {
        if (!normClient(g.client).includes(match)) return;
        const t = parseDay(g.deliveryDate || g.orderDate);
        if (!t) return;
        if (since && t.yy * 10000 + t.mm * 100 + t.dd < since) return;
        if (!realName) realName = g.client;
        totOrders += g.effective;
        kPeriodKeys(t, startDay, overlap).forEach((k) => {
          row(k).orders += g.effective;
        });
      });
      (Array.isArray(payments) ? payments : []).forEach((p) => {
        if (!normClient(p.client).includes(match)) return;
        const t = parseDay(p.paymentDate);
        if (!t) return;
        if (since && t.yy * 10000 + t.mm * 100 + t.dd < since) return;
        totPaid += Number(p.amount || 0);
        kPeriodKeys(t, startDay, overlap).forEach((k) => {
          row(k).paid += Number(p.amount || 0);
        });
      });
      const keys = Object.keys(periods).sort().reverse();
      const orders_ = totOrders;
      const paid = totPaid;
      return {
        title,
        periods,
        keys,
        orders: orders_,
        paid,
        discount,
        startDay,
        endDay,
        overlap,
        barter,
        realName: realName || title,
      };
    },
  );

  const sectionStyle = { ...S.card, marginBottom: 20 };
  const sectionHeader = {
    padding: "13px 18px",
    borderBottom: "1px solid var(--b1)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const months = Object.keys(report).sort().reverse();
  const toggle = (m) => setClosedMonths((o) => ({ ...o, [m]: !o[m] }));

  return (
    <>
      <div style={S.kpiGrid}>
        <KPI label="Объём" value={fmtM(allVolume)} color="var(--accent)" />
        <KPI label="Доходы" value={fmtM(allIncome)} color="var(--green)" />
        <KPI label="Расходы" value={fmtM(allExpense)} color="var(--red)" />
        <KPI label="Возвраты" value={fmtM(allReturns)} color="var(--yellow)" />
        <KPI label="Общий долг" value={fmtM(totalDebt)} color="var(--red)" />
        <KPI
          label="Касса"
          value={fmtM(allBalance)}
          color={allBalance >= 0 ? "var(--green)" : "var(--red)"}
        />
      </div>

      {/* ===== ЗАРПЛАТА / ДОЛИ ===== */}
      <SectionTitle
        icon="💼"
        color="var(--purple)"
        title="ЗАРПЛАТА И ДОЛИ"
        subtitle="Сколько причитается Урмату и Аману и что остаётся Акылбеку — от поступивших денег"
      />
      <div
        style={{
          ...S.card,
          marginBottom: 20,
          padding: "16px 18px",
          borderTop: "3px solid var(--purple)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            marginBottom: 12,
          }}
        >
          <MiniStat
            label={`Доля Урмата 5% · ${periodLabel(curKey)}`}
            value={curUrmat}
            color="var(--purple)"
            bold
            sub={`всего: ${fmtM(urmatTotal)}`}
          />
          <MiniStat
            label={`Доля Амана 4% · ${MONTHS[String(nowD.getMonth() + 1).padStart(2, "0")] || ""}`}
            value={amanMonthCut}
            color="var(--purple)"
            bold
            sub={`всего: ${fmtM(amanCut)}`}
          />
          <MiniStat
            label="Поступило за этот период (Дордой-фуд)"
            value={curReceived}
            color="var(--green)"
          />
          <MiniStat
            label="Объём заказов за этот период (Дордой-фуд)"
            value={curVolume}
            color="var(--accent)"
            sub={`всего: ${fmtM(dordoiVolume)}`}
          />
          <MiniStat
            label="Чистая прибыль Акылбека (всего)"
            value={akylbekNetProfit}
            color={akylbekNetProfit >= 0 ? "var(--green)" : "var(--red)"}
            bold
          />
        </div>
        {periodKeys.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "var(--s2)" }}>
                  {[
                    "Период Урмата (с 15 по 14)",
                    "Объём заказов (Дордой-фуд)",
                    "Поступило",
                    "5%",
                  ].map((h) => (
                    <TH key={h}>{h}</TH>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodKeys.map((k) => (
                  <TR key={k}>
                    <TD>{periodLabel(k)}</TD>
                    <TD>{fmtM(volumePeriods[k] || 0)}</TD>
                    <TD>{fmtM(urmatPeriods[k] || 0)}</TD>
                    <TD>{fmtM((urmatPeriods[k] || 0) * 0.05)}</TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--muted2)", marginTop: 10 }}>
          Доли считаются от поступивших денег. Урмат — рынок «Дордой-фуд» и
          клиент «Украина», без Амана. Аман — 4% от оплат клиента «Аман».
          Украина платит сырьём (бартер): это входит в «Доходы», «Кассу» и в
          долю Урмата. Скидка 3% для «Элдияр ДФ» и «Кубаныч ДФ» на зарплаты не
          влияет, она показана только в блоке «Деньги клиентов». Возвраты в
          долях не учитываются.
        </div>
      </div>

      {/* ===== ДЕНЬГИ КЛИЕНТОВ ===== */}
      {discountClients.some((dc) => dc.keys.length > 0) && (
        <SectionTitle
          icon="👥"
          color="var(--accent)"
          title="ДЕНЬГИ КЛИЕНТОВ"
          subtitle="Сколько заказали по периодам, сколько оплачено и что осталось — нажми на имя, чтобы открыть заказы"
        />
      )}
      {discountClients.map((dc) =>
        dc.keys.length === 0 ? null : (
          <div
            key={dc.title}
            style={{
              ...S.card,
              marginBottom: 20,
              padding: "16px 18px",
              borderTop: "3px solid var(--accent)",
            }}
          >
            <div
              onClick={() => onSelectClient && onSelectClient(dc.realName)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                cursor: onSelectClient ? "pointer" : "default",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700 }}>{dc.title}</span>
              {onSelectClient && (
                <span
                  style={{
                    fontSize: 12.5,
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  Открыть заказы →
                </span>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ background: "var(--s2)" }}>
                    {[
                      "Период",
                      "Заказано",
                      ...(dc.discount ? ["После скидки 3%"] : []),
                      dc.barter ? "Оплачено товарами" : "Оплачено",
                      "Остаток",
                    ].map((h) => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dc.keys.map((k) => {
                    const r = dc.periods[k];
                    const due = r.orders * (1 - dc.discount);
                    const diff = due - r.paid;
                    return (
                      <TR key={k}>
                        <TD>{kLabel(k, dc.startDay, dc.endDay)}</TD>
                        <TD>{fmtM(r.orders)}</TD>
                        {dc.discount ? <TD>{fmtM(due)}</TD> : null}
                        <TD>{fmtM(r.paid)}</TD>
                        <TD>
                          <span
                            style={{
                              color:
                                diff > 0
                                  ? "var(--red)"
                                  : diff < 0
                                    ? "var(--green)"
                                    : "inherit",
                              fontWeight: 600,
                            }}
                          >
                            {diff > 0
                              ? "должен "
                              : diff < 0
                                ? "переплата "
                                : ""}
                            {fmtM(Math.abs(diff))}
                          </span>
                        </TD>
                      </TR>
                    );
                  })}
                  <TR>
                    <TD>
                      <b>Всего</b>
                    </TD>
                    <TD>
                      <b>{fmtM(dc.orders)}</b>
                    </TD>
                    {dc.discount ? (
                      <TD>
                        <b>{fmtM(dc.orders * (1 - dc.discount))}</b>
                      </TD>
                    ) : null}
                    <TD>
                      <b>{fmtM(dc.paid)}</b>
                    </TD>
                    <TD>
                      <b>
                        {(() => {
                          const d = dc.orders * (1 - dc.discount) - dc.paid;
                          return (
                            (d > 0 ? "должен " : d < 0 ? "переплата " : "") +
                            fmtM(Math.abs(d))
                          );
                        })()}
                      </b>
                    </TD>
                  </TR>
                </tbody>
              </table>
            </div>
            <div
              style={{ fontSize: 11.5, color: "var(--muted2)", marginTop: 10 }}
            >
              Период — по дате доставки.
              {dc.overlap &&
                " Для этого клиента период с 16-го по 16-е включительно: заказы и оплаты за 16-е входят в оба соседних периода, а в строке «Всего» считаются один раз."}{" "}
              Сумма заказа — как «К оплате» в карточке: за вычетом возвратов,
              «нет в наличии» и «не поместилось». Начальный остаток не
              учитывается.
              {dc.barter &&
                " Оплата — приходы товаров от Украины по дате прихода; если привезли больше, чем заказали, или наоборот, разница видна в колонке «Остаток»."}
            </div>
          </div>
        ),
      )}

      {/* ===== ПО МЕСЯЦАМ ===== */}
      <SectionTitle
        icon="📅"
        color="var(--green)"
        title="ОБЩИЕ ИТОГИ ПО МЕСЯЦАМ"
        subtitle="Объём, доходы, расходы и касса за календарный месяц"
      />

      {months.length === 0 ? (
        <div
          style={{
            ...S.card,
            padding: 40,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          Нет данных
        </div>
      ) : (
        months.map((month) => {
          const monthData = report[month];
          const days = Object.keys(monthData).sort().reverse();

          let totalVolume = 0,
            totalIncome = 0,
            totalExpense = 0,
            totalReturns = 0,
            totalCashReturns = 0;
          days.forEach((day) => {
            totalVolume += Number(monthData[day].totalVolume || 0);
            totalIncome += Number(monthData[day].income || 0);
            totalExpense += Number(monthData[day].expense || 0);
            totalReturns += valueOf(monthData[day]);
            totalCashReturns += Number(monthData[day].returns || 0);
          });
          const finalVolume = totalVolume - totalReturns - totalExpense;
          const balance = totalIncome - totalExpense - totalCashReturns;
          const isOpen = !closedMonths[month];

          return (
            <div key={month} style={sectionStyle}>
              <div style={sectionHeader} onClick={() => toggle(month)}>
                <span>{monthName(month)}</span>
                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                  {isOpen ? "▲ Свернуть" : "▼ Развернуть"}
                </span>
              </div>

              <div
                style={{
                  padding: "12px 18px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 20,
                  borderBottom: isOpen ? "1px solid var(--b1)" : "none",
                }}
              >
                <MiniStat label="Объём" value={totalVolume} />
                <MiniStat
                  label="Доходы"
                  value={totalIncome}
                  color="var(--green)"
                />
                <MiniStat
                  label="Расходы"
                  value={totalExpense}
                  color="var(--red)"
                />
                <MiniStat
                  label="Возврат"
                  value={totalReturns}
                  color="var(--yellow)"
                />
                <MiniStat
                  label="Чистый объем"
                  value={finalVolume}
                  color="var(--purple)"
                />
                <MiniStat
                  label="Касса"
                  value={balance}
                  color={balance >= 0 ? "var(--green)" : "var(--red)"}
                  bold
                />
              </div>

              {isOpen && (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "var(--s2)" }}>
                        {[
                          "Дата",
                          "Объём",
                          "Доходы",
                          "Расходы",
                          "Возврат",
                          "Касса",
                        ].map((h) => (
                          <TH key={h}>{h}</TH>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((day) => {
                        const d = monthData[day];
                        const income = Number(d.income || 0);
                        const expense = Number(d.expense || 0);
                        const returns = valueOf(d);
                        const cashReturns = Number(d.returns || 0);
                        const volume = Number(d.totalVolume || 0);
                        if (income === 0 && expense === 0 && returns === 0)
                          return null;
                        const dayBalance = income - expense - cashReturns;
                        return (
                          <TR key={day}>
                            <TD>
                              <b>{day}</b>
                            </TD>
                            <TD>
                              <MoneyCell n={volume} />
                            </TD>
                            <TD>
                              <MoneyCell n={income} pos={true} />
                            </TD>
                            <TD>
                              <MoneyCell n={expense} pos={false} />
                            </TD>
                            <TD>
                              <MoneyCell n={returns} pos={false} />
                            </TD>
                            <TD>
                              <MoneyCell n={dayBalance} pos={dayBalance >= 0} />
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
