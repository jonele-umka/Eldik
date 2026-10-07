import { useMemo, useState } from "react";
import { fmtM } from "../utils/index.js";
import {
  BarChart,
  LineChart,
  HBarChart,
  Empty,
} from "../components/Charts.jsx";
import { KPI, TR, TD, TH, MoneyCell } from "../components/UI.jsx";
import { S } from "../utils/styles.js";

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
const MONTHS_SHORT = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
];
// родительный падеж: "лучше сентября", "1–7 октября"
const GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const pad = (n) => String(n).padStart(2, "0");
const pctText = (a, b) => Math.round((Math.abs(a - b) / b) * 100);

export default function AnalyticsPage({ analytics, months, expenses, orders }) {
  const [range, setRange] = useState(30);
  const arr = analytics || [];
  const mon = months || [];
  const exp = expenses || [];

  const totRev = arr.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const totInc = arr.reduce((s, r) => s + Number(r.income || 0), 0);
  const totExp = exp.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totRet = arr.reduce((s, r) => s + Number(r.returns || 0), 0);
  const balance = totInc - totRet - totExp;

  const sorted = [...arr].sort(
    (a, b) => Number(b.revenue || 0) - Number(a.revenue || 0),
  );
  const sortedMon = [...mon].sort((a, b) =>
    (b.month || "").localeCompare(a.month || ""),
  );

  // ── Топ товары / топ клиенты (агрегация по всем месяцам) ────────────────
  const productTotals = {};
  mon.forEach((m) =>
    (m.products || []).forEach((p) => {
      if (!productTotals[p.name])
        productTotals[p.name] = { name: p.name, qty: 0, revenue: 0 };
      productTotals[p.name].qty += Number(p.qty || 0);
      productTotals[p.name].revenue += Number(p.revenue || 0);
    }),
  );
  const topProducts = Object.values(productTotals).sort(
    (a, b) => b.revenue - a.revenue,
  );

  const clientTotals = {};
  mon.forEach((m) =>
    (m.clients || []).forEach((c) => {
      if (!clientTotals[c.name])
        clientTotals[c.name] = { name: c.name, orders: 0, revenue: 0 };
      clientTotals[c.name].orders += Number(c.orders || 0);
      clientTotals[c.name].revenue += Number(c.revenue || 0);
    }),
  );
  const topClients = Object.values(clientTotals).sort(
    (a, b) => b.revenue - a.revenue,
  );

  // ── данные для графиков и выводов ───────────────────────────────────
  // продажи (приход по дате заказа) по каждому дню
  const byDay = useMemo(() => {
    const m = new Map();
    (Array.isArray(orders) ? orders : []).forEach((o) => {
      const k = String(o.orderDate || "").split(" ")[0];
      if (k) m.set(k, (m.get(k) || 0) + Number(o.total || 0));
    });
    return m;
  }, [orders]);

  const dailyBars = useMemo(() => {
    const now = new Date();
    const out = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const full = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
      out.push({
        label: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`,
        full,
        value: byDay.get(full) || 0,
      });
    }
    return out;
  }, [byDay, range]);

  // этот месяц против прошлого — нарастающим итогом по дням
  const cmp = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const day = now.getDate();
    const pm = new Date(y, m - 1, 1);
    const dimCur = new Date(y, m + 1, 0).getDate();
    const dimPrev = new Date(y, m, 0).getDate();
    const len = Math.max(dimCur, dimPrev);
    const cur = [];
    const prev = [];
    let cs = 0;
    let ps = 0;
    for (let d = 1; d <= len; d++) {
      if (d <= dimCur && d <= day) {
        cs += byDay.get(`${pad(d)}.${pad(m + 1)}.${y}`) || 0;
        cur.push(cs);
      } else cur.push(null);
      if (d <= dimPrev) {
        ps +=
          byDay.get(
            `${pad(d)}.${pad(pm.getMonth() + 1)}.${pm.getFullYear()}`,
          ) || 0;
        prev.push(ps);
      } else prev.push(null);
    }
    // Если в прошлом месяце продажи начались не с 1-го числа (например,
    // с 21-го), сравнивать "первые 7 дней" с пустыми днями бессмысленно —
    // берём окно той же длины, но с первого дня продаж.
    const dayKeyPrev = (d) =>
      `${pad(d)}.${pad(pm.getMonth() + 1)}.${pm.getFullYear()}`;
    let startPrev = 1;
    while (startPrev <= dimPrev && !(byDay.get(dayKeyPrev(startPrev)) > 0))
      startPrev++;
    const hadPrev = startPrev <= dimPrev;
    if (!hadPrev) startPrev = 1;
    const endPrev = Math.min(dimPrev, startPrev + day - 1);
    let prevWin = 0;
    for (let d = startPrev; d <= endPrev; d++)
      prevWin += byDay.get(dayKeyPrev(d)) || 0;
    return {
      labels: Array.from({ length: len }, (_, i) => String(i + 1)),
      cur,
      prev,
      curToDate: cur[day - 1] || 0,
      prevToDate: prevWin,
      startPrev,
      endPrev,
      day,
      m,
      pm: pm.getMonth(),
      key: `${y}-${pad(m + 1)}`,
    };
  }, [byDay]);

  const monthsAsc = useMemo(
    () => [...mon].sort((a, b) => (a.month || "").localeCompare(b.month || "")),
    [months],
  );
  const monthLabel = (key) => {
    const [y, mo] = String(key || "").split("-");
    return MONTHS[Number(mo) - 1]
      ? {
          short: MONTHS_SHORT[Number(mo) - 1],
          full: `${MONTHS[Number(mo) - 1]} ${y}`,
          i: Number(mo) - 1,
        }
      : { short: key, full: key, i: -1 };
  };
  const last12 = monthsAsc.slice(-12);
  const monthBars = last12.map((r) => ({
    label: monthLabel(r.month).short,
    full: monthLabel(r.month).full,
    value: Number(r.revenue || 0),
  }));

  // текстовые выводы
  const insights = useMemo(() => {
    const lines = [];
    const { curToDate, prevToDate, day, m, pm, startPrev, endPrev } = cmp;
    if (prevToDate > 0) {
      const p = pctText(curToDate, prevToDate);
      const dir = p < 3 ? "flat" : curToDate > prevToDate ? "up" : "down";
      const range1 = day === 1 ? `1 ${GEN[m]}` : `1–${day} ${GEN[m]}`;
      const head =
        dir === "up"
          ? `${MONTHS[m]} идёт лучше, чем ${GEN[pm]}`
          : dir === "down"
            ? `${MONTHS[m]} идёт хуже, чем ${GEN[pm]}`
            : `${MONTHS[m]} идёт на уровне ${GEN[pm]}`;
      const diff =
        dir === "up"
          ? `на ${p}% больше`
          : dir === "down"
            ? `на ${p}% меньше`
            : `разница всего ${p}%`;
      // чем сравниваем: те же числа или (если продажи начались позже) первые дни продаж
      const nPrev = endPrev - startPrev + 1;
      const base =
        startPrev === 1
          ? `за те же дни ${GEN[pm]} (${fmtM(prevToDate)})`
          : nPrev < day
            ? `за все дни продаж в ${GEN[pm].replace(/а$/, "е").replace(/я$/, "е")} — ${startPrev}–${endPrev} (${fmtM(prevToDate)}); они начались ${startPrev}-го числа`
            : `за первые ${nPrev} дн. продаж в ${GEN[pm].replace(/а$/, "е").replace(/я$/, "е")}, ${startPrev}–${endPrev} (${fmtM(prevToDate)}); они начались ${startPrev}-го числа`;
      lines.push({
        dir,
        text: `${head}: за ${range1} продано ${fmtM(curToDate)} — ${diff}, чем ${base}.`,
      });
    } else if (curToDate > 0) {
      lines.push({
        dir: "flat",
        text: `В прошлом месяце продаж нет, сравнивать пока не с чем. За ${MONTHS[m].toLowerCase()} продано ${fmtM(curToDate)}.`,
      });
    }

    const done = monthsAsc.filter((r) => r.month !== cmp.key);
    if (done.length >= 2) {
      const a = done[done.length - 1];
      const b = done[done.length - 2];
      const ra = Number(a.revenue || 0);
      const rb = Number(b.revenue || 0);
      if (rb > 0) {
        const p = pctText(ra, rb);
        const dir = p < 3 ? "flat" : ra > rb ? "up" : "down";
        const la = monthLabel(a.month);
        const lb = monthLabel(b.month);
        const verb =
          dir === "up"
            ? "закрыт лучше"
            : dir === "down"
              ? "закрыт хуже"
              : "закрыт на уровне";
        lines.push({
          dir,
          text: `${la.full.split(" ")[0]} ${verb}, чем ${GEN[lb.i]}: приход ${fmtM(ra)} против ${fmtM(rb)}${dir === "flat" ? "" : ` (${dir === "up" ? "+" : "−"}${p}%)`}, касса ${fmtM(a.profit)} против ${fmtM(b.profit)}.`,
        });
      }
    }
    if (done.length >= 3) {
      const best = [...done].sort(
        (x, y) => Number(y.revenue || 0) - Number(x.revenue || 0),
      )[0];
      lines.push({
        dir: "flat",
        text: `Лучший месяц за всё время — ${monthLabel(best.month).full}: приход ${fmtM(best.revenue)}.`,
      });
    }
    return lines;
  }, [cmp, monthsAsc]);

  const marketBars = sorted
    .slice(0, 6)
    .map((r) => ({ label: r.market, value: Number(r.revenue || 0) }));
  const productBars = topProducts
    .slice(0, 8)
    .map((p) => ({ label: p.name, value: p.revenue }));
  const clientBars = topClients
    .slice(0, 8)
    .map((c) => ({ label: c.name, value: c.revenue }));

  const sectionStyle = { ...S.card, marginBottom: 20 };
  const sectionHeader = {
    padding: "13px 18px",
    borderBottom: "1px solid var(--b1)",
    fontSize: 14,
    fontWeight: 600,
  };

  return (
    <>
      <div style={S.kpiGrid}>
        <KPI label="Приход" value={fmtM(totRev)} color="var(--accent)" />
        <KPI label="Выручка" value={fmtM(totInc)} color="var(--green)" />
        <KPI label="Возвраты" value={fmtM(totRet)} color="var(--yellow)" />
        <KPI label="Расходы" value={fmtM(totExp)} color="var(--red)" />
        <KPI
          label="Касса"
          value={fmtM(balance)}
          color={balance >= 0 ? "var(--green)" : "var(--red)"}
        />
      </div>

      {insights.length > 0 && (
        <div style={{ ...S.card, marginBottom: 20, padding: "14px 18px" }}>
          {insights.map((l, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 10,
                fontSize: 13.5,
                lineHeight: 1.5,
                marginTop: i ? 8 : 0,
              }}
            >
              <span
                style={{
                  color:
                    l.dir === "up"
                      ? "var(--green)"
                      : l.dir === "down"
                        ? "var(--red)"
                        : "var(--muted)",
                  fontWeight: 700,
                  width: 14,
                  flexShrink: 0,
                }}
              >
                {l.dir === "up" ? "▲" : l.dir === "down" ? "▼" : "●"}
              </span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div style={{ ...S.card, gridColumn: "1 / -1" }}>
          <div
            style={{
              ...sectionHeader,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            Продажи по дням
            <span style={{ display: "flex", gap: 6 }}>
              {[14, 30, 90].map((n) => (
                <button
                  key={n}
                  onClick={() => setRange(n)}
                  style={{
                    border:
                      "1px solid " +
                      (range === n ? "var(--accent)" : "var(--b1)"),
                    background: range === n ? "var(--accent)" : "transparent",
                    color: range === n ? "#fff" : "var(--muted)",
                    borderRadius: 7,
                    padding: "3px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {n} дн.
                </button>
              ))}
            </span>
          </div>
          <div style={{ padding: 14 }}>
            {dailyBars.some((d) => d.value) ? (
              <BarChart data={dailyBars} />
            ) : (
              <Empty />
            )}
          </div>
        </div>

        <div style={S.card}>
          <div style={sectionHeader}>
            {MONTHS[cmp.m]} и {MONTHS[cmp.pm].toLowerCase()} · нарастающим
            итогом
          </div>
          <div style={{ padding: 14 }}>
            {byDay.size ? (
              <LineChart
                labels={cmp.labels}
                series={[
                  {
                    name: MONTHS[cmp.m],
                    color: "var(--accent)",
                    values: cmp.cur,
                  },
                  {
                    name: MONTHS[cmp.pm],
                    color: "var(--muted)",
                    dash: "5 4",
                    values: cmp.prev,
                  },
                ]}
              />
            ) : (
              <Empty />
            )}
          </div>
        </div>

        <div style={S.card}>
          <div style={sectionHeader}>Приход по месяцам</div>
          <div style={{ padding: 14 }}>
            {monthBars.length ? <BarChart data={monthBars} /> : <Empty />}
          </div>
        </div>

        <div style={S.card}>
          <div style={sectionHeader}>Приход, выручка и расходы по месяцам</div>
          <div style={{ padding: 14 }}>
            {last12.length ? (
              <LineChart
                labels={last12.map((r) => monthLabel(r.month).short)}
                series={[
                  {
                    name: "Приход",
                    color: "var(--accent)",
                    values: last12.map((r) => Number(r.revenue || 0)),
                  },
                  {
                    name: "Выручка",
                    color: "var(--green)",
                    values: last12.map((r) => Number(r.income || 0)),
                  },
                  {
                    name: "Расходы",
                    color: "var(--red)",
                    dash: "5 4",
                    values: last12.map((r) => Number(r.expense || 0)),
                  },
                ]}
              />
            ) : (
              <Empty />
            )}
          </div>
        </div>

        <div style={S.card}>
          <div style={sectionHeader}>Приход по рынкам</div>
          <div style={{ padding: 14 }}>
            {marketBars.length ? <HBarChart data={marketBars} /> : <Empty />}
          </div>
        </div>
        <div style={S.card}>
          <div style={sectionHeader}>Топ товары</div>
          <div style={{ padding: 14 }}>
            {productBars.length ? (
              <HBarChart data={productBars} color="var(--purple)" />
            ) : (
              <Empty />
            )}
          </div>
        </div>
        <div style={S.card}>
          <div style={sectionHeader}>Топ клиенты</div>
          <div style={{ padding: 14 }}>
            {clientBars.length ? (
              <HBarChart data={clientBars} color="var(--green)" />
            ) : (
              <Empty />
            )}
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeader}>По рынкам</div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {[
                  "Рынок",
                  "Приход",
                  "Выручка",
                  "Расход",
                  "Возвраты",
                  "Касса",
                ].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--muted)",
                    }}
                  >
                    Нет данных
                  </td>
                </tr>
              ) : (
                <>
                  {sorted.map((r, i) => (
                    <TR key={i}>
                      <TD>
                        <b>{r.market}</b>
                      </TD>
                      <TD>
                        <MoneyCell n={r.revenue} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.income} pos={true} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.expense} pos={false} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.returns} pos={false} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.profit} pos={Number(r.profit) >= 0} />
                      </TD>
                    </TR>
                  ))}
                  <tr
                    style={{
                      background: "var(--s2)",
                      borderTop: "2px solid var(--b1)",
                    }}
                  >
                    <td
                      style={{
                        padding: "9px 13px",
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      Итого
                    </td>
                    <td style={{ padding: "9px 13px" }}>
                      <MoneyCell n={totRev} />
                    </td>
                    <td style={{ padding: "9px 13px" }}>
                      <MoneyCell n={totInc} pos={true} />
                    </td>
                    <td style={{ padding: "9px 13px" }}>
                      <MoneyCell
                        n={arr.reduce((s, r) => s + Number(r.expense || 0), 0)}
                        pos={false}
                      />
                    </td>
                    <td style={{ padding: "9px 13px" }}>
                      <MoneyCell n={totRet} pos={false} />
                    </td>
                    <td style={{ padding: "9px 13px" }}>
                      <MoneyCell
                        n={arr.reduce((s, r) => s + Number(r.profit || 0), 0)}
                        pos={
                          arr.reduce((s, r) => s + Number(r.profit || 0), 0) >=
                          0
                        }
                      />
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeader}>По месяцам</div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {[
                  "Месяц",
                  "Приход",
                  "Выручка",
                  "Расход",
                  "Возвраты",
                  "Касса",
                ].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMon.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--muted)",
                    }}
                  >
                    Нет данных
                  </td>
                </tr>
              ) : (
                sortedMon.map((r, i) => {
                  const [yr, mn] = (r.month || "").split("-");
                  const label = mn && yr ? `${mn}.${yr}` : r.month;
                  return (
                    <TR key={i}>
                      <TD>
                        <b>{label}</b>
                      </TD>
                      <TD>
                        <MoneyCell n={r.revenue} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.income} pos={true} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.expense} pos={false} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.returns} pos={false} />
                      </TD>
                      <TD>
                        <MoneyCell n={r.profit} pos={Number(r.profit) >= 0} />
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Топ товары ────────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>Топ товары</div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {["#", "Товар", "Кол-во", "Приход"].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {topProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--muted)",
                    }}
                  >
                    Нет данных
                  </td>
                </tr>
              ) : (
                topProducts.map((p, i) => (
                  <TR key={p.name}>
                    <TD style={{ color: "var(--muted)" }}>{i + 1}</TD>
                    <TD>
                      <b>{p.name}</b>
                    </TD>
                    <TD>{p.qty.toLocaleString()}</TD>
                    <TD>
                      <MoneyCell n={p.revenue} pos={true} />
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Топ клиенты ───────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>Топ клиенты</div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                {["#", "Клиент", "Заказов", "Приход"].map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </tr>
            </thead>
            <tbody>
              {topClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--muted)",
                    }}
                  >
                    Нет данных
                  </td>
                </tr>
              ) : (
                topClients.map((c, i) => (
                  <TR key={c.name}>
                    <TD style={{ color: "var(--muted)" }}>{i + 1}</TD>
                    <TD>
                      <b>{c.name}</b>
                    </TD>
                    <TD>{c.orders.toLocaleString()}</TD>
                    <TD>
                      <MoneyCell n={c.revenue} pos={true} />
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
