// Главная / Дашборд — один экран со всеми ключевыми цифрами бизнеса,
// собранными из уже загруженных данных (заказы, должники, производство,
// финансы). Ничего не запрашивает отдельно.
import { useMemo } from "react";
import { fmtM, fmt, getMonth } from "../utils/index.js";
import { KPI, TableWrap, TR, TD, TH, ProductThumb } from "../components/UI.jsx";
import { todayString } from "../components/Form.jsx";
import { S } from "../utils/styles.js";
import {
  BarChart,
  LineChart,
  HBarChart,
  Empty,
} from "../components/Charts.jsx";

export default function DashboardPage({
  orders,
  debtors,
  finance,
  production,
  prices,
  isMobile,
  onGo,
}) {
  const today = todayString();
  const thisMonth = getMonth(today);

  const ordersArr = Array.isArray(orders) ? orders : [];
  const debtorsArr = Array.isArray(debtors) ? debtors : [];
  const pricesArr = Array.isArray(prices) ? prices : [];
  const prodData = production || {};

  const imageByProduct = useMemo(() => {
    const m = {};
    pricesArr.forEach((p) => {
      if (p.product) m[p.product] = p.image || "";
    });
    return m;
  }, [prices]);

  const salesToday = useMemo(
    () =>
      ordersArr
        .filter((o) => String(o.orderDate || "").split(" ")[0] === today)
        .reduce((s, o) => s + Number(o.total || 0), 0),
    [ordersArr, today],
  );

  const salesMonth = useMemo(
    () =>
      ordersArr
        .filter((o) => getMonth(o.orderDate) === thisMonth)
        .reduce((s, o) => s + Number(o.total || 0), 0),
    [ordersArr, thisMonth],
  );

  const monthFinance = finance?.[thisMonth] || {};
  const profitMonth = useMemo(() => {
    return Object.values(monthFinance).reduce(
      (s, d) =>
        s +
        (Number(d.income || 0) -
          Number(d.expense || 0) -
          Number(d.returns || 0)),
      0,
    );
  }, [monthFinance]);

  const totalDebt = useMemo(
    () => debtorsArr.reduce((s, d) => s + Number(d.debt || 0), 0),
    [debtorsArr],
  );

  const topDebtors = useMemo(
    () =>
      [...debtorsArr]
        .sort((a, b) => Number(b.debt || 0) - Number(a.debt || 0))
        .slice(0, 5),
    [debtorsArr],
  );

  // Производство на сегодняшнюю дату доставки — то, что нужно собрать сегодня.
  const todayProduction = useMemo(() => {
    const dayData = prodData[today] || {};
    return Object.entries(dayData)
      .map(([product, info]) => ({
        product,
        total: info.total,
        markets: info.markets || {},
      }))
      .sort((a, b) => b.total - a.total);
  }, [prodData, today]);

  const producedToday = todayProduction.reduce(
    (s, r) => s + Number(r.total || 0),
    0,
  );

  // ── данные для графиков ──────────────────────────────────────────────
  const parseDay = (d) => {
    const [dd, mm, yy] = String(d || "")
      .split(" ")[0]
      .split(".");
    return yy ? new Date(Number(yy), Number(mm) - 1, Number(dd)) : null;
  };
  const dayKey = (dt) =>
    `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;

  // продажи за последние 14 дней
  const salesByDay = useMemo(() => {
    const now = parseDay(today);
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(now);
      dt.setDate(now.getDate() - i);
      days.push({
        key: dayKey(dt),
        label:
          String(dt.getDate()).padStart(2, "0") +
          "." +
          String(dt.getMonth() + 1).padStart(2, "0"),
        full: dayKey(dt),
        value: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    ordersArr.forEach((o) => {
      const i = idx.get(String(o.orderDate || "").split(" ")[0]);
      if (i !== undefined) days[i].value += Number(o.total || 0);
    });
    return days;
  }, [ordersArr, today]);

  // доходы и расходы по дням текущего месяца
  const finDays = useMemo(() => {
    const keys = Object.keys(monthFinance).sort(
      (a, b) => parseDay(a) - parseDay(b),
    );
    return {
      labels: keys.map((k) => k.split(".")[0]),
      income: keys.map((k) => Number(monthFinance[k].income || 0)),
      expense: keys.map((k) => Number(monthFinance[k].expense || 0)),
    };
  }, [monthFinance]);

  // продажи по рынкам за месяц
  const salesByMarket = useMemo(() => {
    const m = {};
    ordersArr
      .filter((o) => getMonth(o.orderDate) === thisMonth)
      .forEach((o) => {
        const k = o.market || "—";
        m[k] = (m[k] || 0) + Number(o.total || 0);
      });
    return Object.entries(m)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [ordersArr, thisMonth]);

  const MONTHS = [
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
  const monthName = (() => {
    const [y, m] = thisMonth.split("-");
    return MONTHS[Number(m) - 1] ? `${MONTHS[Number(m) - 1]} ${y}` : thisMonth;
  })();

  const debtorBars = topDebtors.map((d) => ({
    label: d.client,
    value: Number(d.debt || 0),
  }));
  const prodBars = todayProduction
    .slice(0, 8)
    .map((r) => ({ label: r.product, value: Number(r.total || 0) }));

  const sectionStyle = { ...S.card, marginBottom: 20 };
  const sectionHeader = {
    padding: "13px 18px",
    borderBottom: "1px solid var(--b1)",
    fontSize: 14,
    fontWeight: 600,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };
  const linkStyle = {
    fontSize: 12,
    color: "var(--accent)",
    cursor: "pointer",
    fontWeight: 500,
  };

  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
        Данные на {today}
      </div>
      <div style={isMobile ? S.kpiGridMobile : S.kpiGrid}>
        <KPI
          label="Продажи сегодня"
          value={fmtM(salesToday)}
          color="var(--accent)"
        />
        <KPI
          label="Продажи за месяц"
          value={fmtM(salesMonth)}
          color="var(--accent)"
        />
        <KPI
          label="Прибыль за месяц"
          value={fmtM(profitMonth)}
          color={profitMonth >= 0 ? "var(--green)" : "var(--red)"}
        />
        <KPI
          label="Общая дебиторка"
          value={fmtM(totalDebt)}
          color="var(--red)"
        />
        <KPI
          label="К производству сегодня"
          value={`${fmt(producedToday)} шт.`}
          color="var(--purple)"
        />
        <KPI
          label="Должников"
          value={debtorsArr.length}
          color="var(--yellow)"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div style={{ ...S.card }}>
          <div style={sectionHeader}>Продажи за 14 дней</div>
          <div style={{ padding: 14 }}>
            {salesByDay.some((d) => d.value) ? (
              <BarChart data={salesByDay} />
            ) : (
              <Empty />
            )}
          </div>
        </div>
        <div style={{ ...S.card }}>
          <div style={sectionHeader}>Доходы и расходы · {monthName}</div>
          <div style={{ padding: 14 }}>
            {finDays.labels.length ? (
              <LineChart
                labels={finDays.labels}
                series={[
                  {
                    name: "Доходы",
                    color: "var(--green)",
                    values: finDays.income,
                  },
                  {
                    name: "Расходы",
                    color: "var(--red)",
                    dash: "5 4",
                    values: finDays.expense,
                  },
                ]}
              />
            ) : (
              <Empty />
            )}
          </div>
        </div>
        <div style={{ ...S.card }}>
          <div style={sectionHeader}>Продажи по рынкам · месяц</div>
          <div style={{ padding: 14 }}>
            {salesByMarket.length ? (
              <HBarChart data={salesByMarket} />
            ) : (
              <Empty />
            )}
          </div>
        </div>
        <div style={{ ...S.card }}>
          <div style={sectionHeader}>Производство сегодня, шт.</div>
          <div style={{ padding: 14 }}>
            {prodBars.length ? (
              <HBarChart data={prodBars} color="var(--purple)" unit="шт" />
            ) : (
              <Empty text="На сегодня заказов нет" />
            )}
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeader}>
          Крупнейшие должники
          {onGo && (
            <span style={linkStyle} onClick={() => onGo("debtors")}>
              Все должники →
            </span>
          )}
        </div>
        {debtorBars.length > 0 && (
          <div style={{ padding: "12px 18px 4px" }}>
            <HBarChart data={debtorBars} color="var(--red)" />
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {["Клиент", "Долг"].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {topDebtors.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    style={{
                      textAlign: "center",
                      padding: 30,
                      color: "var(--muted)",
                    }}
                  >
                    Должников нет 🎉
                  </td>
                </tr>
              ) : (
                topDebtors.map((r, i) => (
                  <TR key={i}>
                    <TD>
                      <b>{r.client}</b>
                    </TD>
                    <TD
                      style={{
                        color: "var(--red)",
                        fontFamily: "JetBrains Mono,monospace",
                      }}
                    >
                      {fmtM(r.debt)}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeader}>
          Производство на сегодня ({today})
          {onGo && (
            <span style={linkStyle} onClick={() => onGo("production")}>
              Всё производство →
            </span>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {["Товар", "Всего произвести", "По рынкам"].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {todayProduction.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    style={{
                      textAlign: "center",
                      padding: 30,
                      color: "var(--muted)",
                    }}
                  >
                    На сегодня заказов с доставкой нет
                  </td>
                </tr>
              ) : (
                todayProduction.map((r) => (
                  <TR key={r.product}>
                    <TD>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <ProductThumb
                          src={imageByProduct[r.product]}
                          size={28}
                        />
                        <b>{r.product}</b>
                      </div>
                    </TD>
                    <TD
                      style={{
                        fontFamily: "JetBrains Mono,monospace",
                        fontWeight: 700,
                        color: "var(--accent)",
                      }}
                    >
                      {fmt(r.total)}
                    </TD>
                    <TD style={{ color: "var(--muted)" }}>
                      {Object.entries(r.markets)
                        .map(([m, q]) => `${m}: ${q}`)
                        .join(", ") || "—"}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
