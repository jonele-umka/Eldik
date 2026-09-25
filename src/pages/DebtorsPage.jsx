import { useMemo, useState } from "react";
import { fmtM, filterSearch, parseDate } from "../utils/index.js";
import { norm } from "../utils/ledger.js";
import { KPI, TableWrap, TR, TD, TH, MoneyCell } from "../components/UI.jsx";
import { S } from "../utils/styles.js";
import { Btn, Toolbar, Field, TextInput, SelectField } from "../components/Form.jsx";
import OpeningBalanceModal from "../components/OpeningBalanceModal.jsx";

export default function DebtorsPage({ data, clients, search, onSelectClient }) {
  const arr = data || [];
  const clientsArr = Array.isArray(clients) ? clients : [];
  const [openBalance, setOpenBalance] = useState(false);

  // Фильтры — по рынку, по сумме долга и по дате последнего заказа/долга.
  const [marketFilter, setMarketFilter] = useState("");
  const [minSum, setMinSum] = useState("");
  const [maxSum, setMaxSum] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Рынок клиента в самих должниках не хранится — берём из справочника
  // «Клиенты» по имени.
  const marketByClient = useMemo(() => {
    const m = {};
    clientsArr.forEach((c) => {
      if (c.name) m[norm(c.name)] = c.market || "";
    });
    return m;
  }, [clientsArr]);

  const markets = useMemo(
    () => [...new Set(clientsArr.map((c) => c.market).filter(Boolean))].sort(),
    [clientsArr],
  );

  const hasFilters = marketFilter || minSum || maxSum || dateFrom || dateTo;
  const resetFilters = () => {
    setMarketFilter("");
    setMinSum("");
    setMaxSum("");
    setDateFrom("");
    setDateTo("");
  };

  const filtered = useMemo(() => {
    let list = filterSearch(arr, ["client"], search);

    if (marketFilter) {
      list = list.filter((r) => marketByClient[norm(r.client)] === marketFilter);
    }

    const min = minSum !== "" ? Number(minSum) : -Infinity;
    const max = maxSum !== "" ? Number(maxSum) : Infinity;
    if (minSum !== "" || maxSum !== "") {
      list = list.filter((r) => Number(r.debt || 0) >= min && Number(r.debt || 0) <= max);
    }

    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
      const to = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
      list = list.filter((r) => {
        const d = parseDate(r.debtDate || r.lastOrderDate);
        return d >= from && d <= to;
      });
    }

    return list.slice().sort((a, b) => Number(b.debt || 0) - Number(a.debt || 0));
  }, [arr, search, marketFilter, minSum, maxSum, dateFrom, dateTo, marketByClient]);

  const totalDebt = filtered.reduce((s, r) => s + Number(r.debt || 0), 0);
  const maxDebt = Math.max(...filtered.map((r) => Number(r.debt || 0)), 1);

  return (
    <>
      <div style={S.kpiGrid}>
        <KPI label="Должников" value={filtered.length} color="var(--red)" />
        <KPI label="Общий долг" value={fmtM(totalDebt)} color="var(--red)" />
      </div>

      <Toolbar style={{ justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Нажмите на строку — откроется карточка клиента с оплатами и зачётами.
        </div>
        <Btn variant="ghost" onClick={() => setOpenBalance(true)}>
          + Начальный остаток
        </Btn>
      </Toolbar>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "flex-end",
          margin: "4px 0 14px",
        }}
      >
        <div style={{ width: 160 }}>
          <Field label="Рынок">
            <SelectField
              value={marketFilter}
              onChange={setMarketFilter}
              options={markets}
              placeholder="Все"
            />
          </Field>
        </div>
        <div style={{ width: 120 }}>
          <Field label="Долг от">
            <TextInput
              inputMode="numeric"
              placeholder="0"
              value={minSum}
              onChange={(e) => setMinSum(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>
        <div style={{ width: 120 }}>
          <Field label="Долг до">
            <TextInput
              inputMode="numeric"
              placeholder="∞"
              value={maxSum}
              onChange={(e) => setMaxSum(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>
        <div style={{ width: 150 }}>
          <Field label="Долг с даты">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                width: "100%",
                background: "var(--s1)",
                border: "1px solid var(--b1)",
                borderRadius: 8,
                color: "var(--text)",
                padding: "7px 8px",
                fontSize: 13,
                outline: "none",
              }}
            />
          </Field>
        </div>
        <div style={{ width: 150 }}>
          <Field label="по дату">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                width: "100%",
                background: "var(--s1)",
                border: "1px solid var(--b1)",
                borderRadius: 8,
                color: "var(--text)",
                padding: "7px 8px",
                fontSize: 13,
                outline: "none",
              }}
            />
          </Field>
        </div>
        {hasFilters && (
          <Btn variant="ghost" onClick={resetFilters}>
            ✕ Сбросить фильтры
          </Btn>
        )}
      </div>

      {openBalance && (
        <OpeningBalanceModal
          open
          type="client"
          onClose={() => setOpenBalance(false)}
        />
      )}

      <TableWrap title="Должники" count={`${filtered.length} человек`}>
        <thead>
          <tr style={{ background: "var(--s2)" }}>
            {[
              "Клиент",
              "Рынок",
              "Нач. остаток",
              "Долг по новым заказам",
              "Оплачено",
              "Взаимозачёт",
              "Общий долг",
              "Прогресс",
            ].map((h) => (
              <TH key={h}>{h}</TH>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                style={{
                  textAlign: "center",
                  padding: 40,
                  color: "var(--muted)",
                }}
              >
                {arr.length === 0 ? "Должников нет 🎉" : "Ничего не найдено по фильтрам"}
              </td>
            </tr>
          ) : (
            filtered.map((r, i) => {
              const pct = Math.round(
                (Number(r.paid || 0) / Math.max(Number(r.ordered || 0), 1)) *
                  100,
              );
              const barPct = Math.round((Number(r.debt || 0) / maxDebt) * 100);
              return (
                <TR
                  key={i}
                  bgColor="rgba(248,81,73,0.06)"
                  onClick={() => onSelectClient?.(r.client)}
                >
                  <TD>
                    <b>{r.client}</b>
                    {(r.debtDate || r.lastOrderDate) && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        посл. заказ: {r.debtDate || r.lastOrderDate}
                      </div>
                    )}
                  </TD>
                  <TD style={{ color: "var(--muted)" }}>
                    {marketByClient[norm(r.client)] || "—"}
                  </TD>
                  <TD>
                    <MoneyCell n={r.openingBalance} pos={false} />
                  </TD>
                  <TD>
                    <MoneyCell n={r.newOrdersDebt ?? r.debt} pos={false} />
                  </TD>
                  <TD>
                    <MoneyCell n={r.paid} pos />
                  </TD>
                  <TD>
                    <MoneyCell n={r.offsets} pos />
                  </TD>
                  <TD>
                    <MoneyCell n={r.debt} pos={false} />
                  </TD>
                  <TD>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        minWidth: 120,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 4,
                          background: "var(--s3)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${barPct}%`,
                            background: "var(--red)",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontFamily: "JetBrains Mono,monospace",
                          fontSize: 11,
                          color: "var(--muted)",
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </TD>
                </TR>
              );
            })
          )}
        </tbody>
      </TableWrap>
    </>
  );
}
