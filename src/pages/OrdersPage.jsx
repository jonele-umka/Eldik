import { useState, useMemo, useEffect } from "react";
import {
  fmtM,
  filterSearch,
  unique,
  buildOrderGroups,
  getMonth,
  distributeClientCredits,
} from "../utils/index.js";
import { dateTimeKey } from "../utils/ledger.js";

import { KPI, Select } from "../components/UI.jsx";
import { Btn } from "../components/Form.jsx";
import CreateOrderModal from "../components/CreateOrderModal.jsx";
import OrderDetailModal from "../components/OrderDetailModal.jsx";
import { OrderCard } from "../components/OrderCard.jsx";
import { S } from "../utils/styles.js";
import { ClientAutocomplete } from "../components/ClientAutocomplete.jsx";
import { useData } from "../store/DataContext.jsx";

const GPAGE = 10;

export default function OrdersPage({
  data,
  expenses,
  search,
  isMobile,
  onSelectClient,
  payments,
  offsets,
  openingBalances,
}) {
  const arr = data || [];
  const { data: store } = useData();
  const prices = Array.isArray(store.prices) ? store.prices : [];

  // key "дата доставки::товар" -> сколько не хватает (шт), отмечено на
  // странице производства/развозки — показываем ту же отметку в заказах.
  const stockOutMap = useMemo(() => {
    const m = new Map();
    (Array.isArray(store.stockOuts) ? store.stockOuts : []).forEach((r) => {
      if (r.date && r.product && Number(r.qty) > 0)
        m.set(`${r.date}::${r.product}`, Number(r.qty));
    });
    return m;
  }, [store.stockOuts]);

  // filters
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");

  // 🔥 split client logic (IMPORTANT FIX)
  const [client, setClient] = useState("");
  const [clientQuery, setClientQuery] = useState("");

  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState("desc");

  // модалки создания/редактирования заказа
  const [createOpen, setCreateOpen] = useState(false);
  const [openOrder, setOpenOrder] = useState(null);

  // base client list (NEVER filtered by table state)
  const clients = useMemo(() => {
    return unique(arr, "client").sort();
  }, [arr]);

  // main filtered rows
  const filteredRows = useMemo(() => {
    let r = filterSearch(
      arr,
      ["client", "product", "market", "orderId", "comment"],
      search,
    );

    if (market) r = r.filter((x) => x.market === market);
    if (status) r = r.filter((x) => x.status === status);
    if (month) r = r.filter((x) => getMonth(x.orderDate) === month);

    if (client) {
      r = r.filter((x) => x.client === client);
    }

    return r;
  }, [arr, search, market, status, month, client]);

  // Поиск (глобальная строка сверху) и переключение сортировки меняют
  // набор/порядок заказов так же, как фильтры рынка/статуса/месяца —
  // значит и страницу тоже нужно сбрасывать на первую, иначе после
  // поиска можно застрять на пустой странице №3.
  useEffect(() => {
    setPage(1);
  }, [search, sortDir]);

  const allGroups = useMemo(() => {
    const groups = buildOrderGroups(filteredRows);
    distributeClientCredits(groups, payments, offsets, openingBalances);

    // Сортируем по дате ДОСТАВКИ (не создания заказа) — иначе если
    // сегодня после обеда оформляешь вчерашний заказ, он попадёт наверх
    // списка, а более ранние сегодняшние заказы окажутся внизу.
    return groups.sort((a, b) => {
      const diff = dateTimeKey(b.deliveryDate) - dateTimeKey(a.deliveryDate);
      if (diff !== 0) return sortDir === "desc" ? diff : -diff;
      const diff2 = dateTimeKey(b.orderDate) - dateTimeKey(a.orderDate);
      return sortDir === "desc" ? diff2 : -diff2;
    });
  }, [filteredRows, sortDir, payments, offsets, openingBalances]);

  const totalPages = Math.ceil(allGroups.length / GPAGE);
  const groups = allGroups.slice((page - 1) * GPAGE, page * GPAGE);

  // Сколько не хватает по заказу (сумма недостачи по всем его строкам) —
  // та же логика, что в OrderCard, нужна и тут, чтобы общий долг по
  // списку заказов совпадал с долгом, который показывает каждая карточка.
  const stockOutDeductionFor = (g) => {
    if (!g.deliveryDate) return 0;
    return (g.rows || []).reduce((s, r) => {
      const qty = Number(r.paidQuantity ?? r.quantity ?? 0);
      const missing = Number(stockOutMap.get(`${g.deliveryDate}::${r.product}`) || 0);
      return s + Math.min(qty, missing) * Number(r.price || 0);
    }, 0);
  };

  // KPIs
  const kpiTotal = allGroups.reduce((s, g) => s + g.totalSum, 0);
  const kpiPaid = allGroups.reduce((s, g) => s + g.paidAmount, 0);
  const kpiRet = allGroups.reduce((s, g) => s + g.returnedAmount, 0);
  const kpiDebt = allGroups.reduce((s, g) => {
    const effectiveTotal = Math.max(
      0,
      g.totalSum - g.returnedAmount - stockOutDeductionFor(g),
    );
    const paid =
      g.totalPaidAmount !== undefined ? g.totalPaidAmount : g.paidAmount;
    return s + Math.max(0, effectiveTotal - paid);
  }, 0);

  const totalExpenses = (expenses || []).reduce(
    (s, r) => s + Number(r.amount || 0),
    0,
  );

  const balance = kpiPaid - kpiRet - totalExpenses;

  const monthOptions = [
    ...new Set(arr.map((r) => getMonth(r.orderDate)).filter(Boolean)),
  ]
    .sort()
    .reverse();

  const kpiGrid = isMobile ? S.kpiGridMobile : S.kpiGrid;

  return (
    <>
      {/* Панель действий */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Нажмите «Открыть» на карточке, чтобы изменить состав, внести оплату
          или оформить возврат.
        </div>
        <Btn variant="primary" onClick={() => setCreateOpen(true)}>
          + Новый заказ
        </Btn>
      </div>

      {/* KPI */}
      <div style={kpiGrid}>
        <KPI label="Заказов" value={allGroups.length} color="var(--accent)" />
        <KPI label="Сумма" value={fmtM(kpiTotal)} color="var(--accent)" />
        <KPI label="Оплачено" value={fmtM(kpiPaid)} color="var(--green)" />
        <KPI label="Возвраты" value={fmtM(kpiRet)} color="var(--yellow)" />
        <KPI label="Долг" value={fmtM(kpiDebt)} color="var(--red)" />
        <KPI
          label="Расходы"
          value={fmtM(totalExpenses)}
          color="var(--yellow)"
        />
        <KPI
          label="Касса"
          value={fmtM(balance)}
          color={balance >= 0 ? "var(--green)" : "var(--red)"}
        />
      </div>

      {/* filters */}
      <div style={{ ...S.filters, justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Select
            value={market}
            onChange={(v) => {
              setMarket(v);
              setPage(1);
            }}
            options={unique(arr, "market")}
            placeholder="Рынок"
          />

          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={unique(arr, "status")}
            placeholder="Статус"
          />

          {!isMobile && (
            <Select
              value={month}
              onChange={(v) => {
                setMonth(v);
                setPage(1);
              }}
              options={monthOptions}
              placeholder="Месяц"
            />
          )}
        </div>

        {/* sort */}
        <div style={{ display: "flex", gap: 6 }}>
          {isMobile && (
            <Select
              value={month}
              onChange={(v) => {
                setMonth(v);
                setPage(1);
              }}
              options={monthOptions}
              placeholder="Месяц"
            />
          )}

          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            style={{
              background: "var(--s2)",
              border: "1px solid var(--b1)",
              borderRadius: 8,
              padding: "7px 10px",
              color: "var(--text)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>
      </div>

      {/* legend */}
      {!isMobile && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 12,
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          {[
            ["var(--green)", "Оплачен"],
            ["var(--yellow)", "Частично"],
            ["var(--red)", "Не оплачен"],
          ].map(([color, label]) => (
            <span key={label} style={{ display: "flex", gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                }}
              />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* info */}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        {allGroups.length} заказов · стр. {page} из {Math.max(1, totalPages)}
      </div>

      {/* list */}
      {groups.length === 0 ? (
        <div style={{ ...S.card, padding: 40, textAlign: "center" }}>
          Нет данных
        </div>
      ) : (
        groups.map((g) => (
          <OrderCard
            key={g.oid}
            group={g}
            prices={prices}
            stockOutMap={stockOutMap}
            isMobile={isMobile}
            onSelectClient={onSelectClient}
            onOpen={setOpenOrder}
          />
        ))
      )}

      {createOpen && (
        <CreateOrderModal open onClose={() => setCreateOpen(false)} />
      )}

      {openOrder && (
        <OrderDetailModal
          group={allGroups.find((g) => g.oid === openOrder.oid) || openOrder}
          onClose={() => setOpenOrder(null)}
        />
      )}

      {/* pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            ‹
          </button>

          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;

            return (
              <button key={p} onClick={() => setPage(p)}>
                {p}
              </button>
            );
          })}

          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}
