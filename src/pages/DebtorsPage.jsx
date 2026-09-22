import { useMemo, useState } from "react";
import { fmtM, filterSearch } from "../utils/index.js";
import { KPI, TableWrap, TR, TD, TH, MoneyCell } from "../components/UI.jsx";
import { S } from "../utils/styles.js";
import { Btn, Toolbar } from "../components/Form.jsx";
import OpeningBalanceModal from "../components/OpeningBalanceModal.jsx";

export default function DebtorsPage({ data, search, onSelectClient }) {
  const arr = data || [];
  const [openBalance, setOpenBalance] = useState(false);
  const filtered = useMemo(
    () =>
      filterSearch(arr, ["client"], search)
        .slice()
        .sort((a, b) => Number(b.debt || 0) - Number(a.debt || 0)),
    [arr, search],
  );

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
              "Нач. остаток",
              "Долг по новым заказам",
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
                colSpan={5}
                style={{
                  textAlign: "center",
                  padding: 40,
                  color: "var(--muted)",
                }}
              >
                Должников нет 🎉
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
                  </TD>
                  <TD>
                    <MoneyCell n={r.openingBalance} pos={false} />
                  </TD>
                  <TD>
                    <MoneyCell n={r.newOrdersDebt ?? r.debt} pos={false} />
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
