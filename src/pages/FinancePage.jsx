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
    const clean = String(item.total)
      .replace(/[\s\u00a0]/g, "")
      .replace(",", ".");
    groups[key].totalSum += parseFloat(clean) || 0;
  });
  return Object.values(groups).reduce(
    (s, o) => s + Math.max(0, o.totalSum - o.returnedAmount - o.paidAmount),
    0,
  );
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

export default function FinancePage({ data, orders }) {
  const report = data || {};
  const [closedMonths, setClosedMonths] = useState({});

  const totalDebt = calcDebt(orders);

  let allVolume = 0,
    allIncome = 0,
    allExpense = 0,
    allReturns = 0;
  Object.values(report).forEach((monthData) => {
    Object.values(monthData).forEach((d) => {
      allVolume += Number(d.totalVolume || 0);
      allIncome += Number(d.income || 0);
      allExpense += Number(d.expense || 0);
      allReturns += Number(d.returns || 0);
    });
  });
  const allBalance = allIncome - allExpense - allReturns;

  // Экспериментальный блок (по просьбе пользователя): 5% от выручки — доля
  // Урмата, остальное — чистая прибыль Акылбека. Коммуналка и зарплаты уже
  // вычтены из allBalance через обычные "Расходы" (категории "Коммуналка" /
  // "Зарплата: ...").
  const myCut = Math.max(0, allBalance) * 0.05;
  const akylbekNetProfit = allBalance - myCut;

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

      <div
        style={{
          ...S.card,
          marginBottom: 20,
          padding: "16px 18px",
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>
            Доля Урмата (5% от кассы)
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--purple)" }}>
            {fmtM(myCut)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>
            Чистая прибыль Акылбека
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: akylbekNetProfit >= 0 ? "var(--green)" : "var(--red)",
            }}
          >
            {fmtM(akylbekNetProfit)}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted2)", alignSelf: "center" }}>
          Коммуналка и зарплаты учитываются через «Расходы» и уже вычтены из
          кассы выше.
        </div>
      </div>

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
            totalReturns = 0;
          days.forEach((day) => {
            totalVolume += Number(monthData[day].totalVolume || 0);
            totalIncome += Number(monthData[day].income || 0);
            totalExpense += Number(monthData[day].expense || 0);
            totalReturns += Number(monthData[day].returns || 0);
          });
          const finalVolume = totalVolume - totalReturns - totalExpense;
          const balance = totalIncome - totalExpense - totalReturns;
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
                        const returns = Number(d.returns || 0);
                        const volume = Number(d.totalVolume || 0);
                        if (income === 0 && expense === 0 && returns === 0)
                          return null;
                        const dayBalance = income - expense - returns;
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
