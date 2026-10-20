import { useState } from "react";
import { fmtM } from "../utils/index.js";
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

function MiniStat({ label, value, color, bold }) {
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
    </div>
  );
}

export default function FinancePage({ data, orders, payments }) {
  const report = data || {};
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
  let discountTotal = 0;
  const urmatPeriods = {};
  let amanReceived = 0;
  (Array.isArray(payments) ? payments : []).forEach((p) => {
    const c = normClient(p.client);
    const amount = Number(p.amount || 0);
    if (c === "аман") {
      amanReceived += amount;
      return;
    }
    if (c !== "украина" && normClient(p.market) !== "дордой-фуд") return;
    const t = parseDay(p.paymentDate);
    if (!t) return;
    const key = periodKeyOf(t);
    // Скидка 3% для «Элдияр ДФ» и «Кубаныч ДФ»: доля считается от суммы
    // за вычетом скидки.
    const isDiscount = c.includes("элдияр") || c.includes("кубаныч");
    const disc = isDiscount ? amount * DISCOUNT : 0;
    discountTotal += disc;
    urmatPeriods[key] = (urmatPeriods[key] || 0) + amount - disc;
  });
  // Объём заказов рынка «Дордой-фуд» (без Амана) по тем же периодам.
  const volumePeriods = {};
  (Array.isArray(orders) ? orders : []).forEach((o) => {
    if (
      normClient(o.market) !== "дордой-фуд" ||
      normClient(o.client) === "аман"
    )
      return;
    const t = parseDay(o.orderDate);
    if (!t) return;
    const key = periodKeyOf(t);
    volumePeriods[key] = (volumePeriods[key] || 0) + cleanNum(o.total);
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
  const urmatTotal = periodKeys.reduce((s, k) => s + urmatPeriods[k] * 0.05, 0);
  const amanCut = amanReceived * 0.04;
  const akylbekNetProfit = allBalance - urmatTotal - amanCut;

  // Клиенты со скидкой 3%: периоды с 16-го по 15-е, по каждому периоду —
  // сколько заказано, сумма после скидки и сколько оплачено.
  const kPeriodKey = (t) => {
    let y = t.yy,
      m = t.mm;
    if (t.dd < 16) {
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return `${y}-${String(m).padStart(2, "0")}`;
  };
  const kLabel = (key) => {
    const [y, m] = key.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `16 ${MS[m - 1]} ${y} – 15 ${MS[nm - 1]} ${ny}`;
  };
  const discountClients = [
    { match: "кубаныч", title: "Кубаныч ДФ" },
    { match: "элдияр", title: "Элдияр ДФ" },
  ].map(({ match, title }) => {
    const periods = {};
    const row = (k) => periods[k] || (periods[k] = { orders: 0, paid: 0 });
    (Array.isArray(orders) ? orders : []).forEach((o) => {
      if (!normClient(o.client).includes(match)) return;
      const t = parseDay(o.orderDate);
      if (!t) return;
      const qty = Number(o.paidQuantity ?? o.quantity ?? 0);
      row(kPeriodKey(t)).orders += qty * Number(o.price || 0);
    });
    (Array.isArray(payments) ? payments : []).forEach((p) => {
      if (!normClient(p.client).includes(match)) return;
      const t = parseDay(p.paymentDate);
      if (!t) return;
      row(kPeriodKey(t)).paid += Number(p.amount || 0);
    });
    const keys = Object.keys(periods).sort().reverse();
    const orders_ = keys.reduce((a, k) => a + periods[k].orders, 0);
    const paid = keys.reduce((a, k) => a + periods[k].paid, 0);
    return { title, periods, keys, orders: orders_, paid };
  });

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

      <div style={{ ...S.card, marginBottom: 20, padding: "16px 18px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            marginBottom: 12,
          }}
        >
          <MiniStat
            label="Доля Амана (4%, всего)"
            value={amanCut}
            color="var(--purple)"
          />
          <MiniStat
            label="Доля Урмата (5%, всего)"
            value={urmatTotal}
            color="var(--purple)"
          />
          <MiniStat
            label="Объём заказов Дордой-фуд"
            value={dordoiVolume}
            color="var(--accent)"
          />
          <MiniStat
            label="Скидка 3% (Элдияр ДФ, Кубаныч ДФ)"
            value={discountTotal}
            color="var(--yellow)"
          />
          <MiniStat
            label="Из доходов — бартер (Украина)"
            value={allBarter}
            color="var(--yellow)"
          />
          <MiniStat
            label="Чистая прибыль Акылбека"
            value={akylbekNetProfit}
            color={akylbekNetProfit >= 0 ? "var(--green)" : "var(--red)"}
            bold
          />
        </div>
        {periodKeys.length > 0 && (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {[
                  "Период Урмата (с 15 по 14)",
                  "Объём заказов (Дордой-фуд)",
                  "Поступило (за вычетом скидки)",
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
        )}
        <div style={{ fontSize: 11.5, color: "var(--muted2)", marginTop: 10 }}>
          Доли считаются от поступивших денег. Урмат — рынок «Дордой-фуд» и
          клиент «Украина», без Амана. Аман — 4% от оплат клиента «Аман».
          Украина платит сырьём (бартер): это входит в «Доходы», «Кассу» и в
          долю Урмата, строка «Бартер» показывает, сколько из доходов пришло
          так. Для «Элдияр ДФ» и «Кубаныч ДФ» из оплат вычитается скидка 3%, и
          доля считается от остатка. Возвраты в долях не учитываются.
        </div>
      </div>

      {discountClients.map((dc) =>
        dc.keys.length === 0 ? null : (
          <div
            key={dc.title}
            style={{ ...S.card, marginBottom: 20, padding: "16px 18px" }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              {dc.title} — заказы по периодам (с 16-го по 15-е), скидка 3%
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
                    {["Период", "Заказано", "После скидки 3%", "Оплачено"].map(
                      (h) => (
                        <TH key={h}>{h}</TH>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dc.keys.map((k) => {
                    const r = dc.periods[k];
                    return (
                      <TR key={k}>
                        <TD>{kLabel(k)}</TD>
                        <TD>{fmtM(r.orders)}</TD>
                        <TD>{fmtM(r.orders * (1 - DISCOUNT))}</TD>
                        <TD>{fmtM(r.paid)}</TD>
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
                    <TD>
                      <b>{fmtM(dc.orders * (1 - DISCOUNT))}</b>
                    </TD>
                    <TD>
                      <b>{fmtM(dc.paid)}</b>
                    </TD>
                  </TR>
                  <TR>
                    <TD>
                      <b>Долг по заказам (после скидки − оплачено)</b>
                    </TD>
                    <TD></TD>
                    <TD>
                      <b>{fmtM(dc.orders * (1 - DISCOUNT) - dc.paid)}</b>
                    </TD>
                    <TD></TD>
                  </TR>
                </tbody>
              </table>
            </div>
            <div
              style={{ fontSize: 11.5, color: "var(--muted2)", marginTop: 10 }}
            >
              Заказано — по реально отгруженному количеству (без «нет в
              наличии»). Начальный остаток и возвраты не учитываются.
            </div>
          </div>
        ),
      )}

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
