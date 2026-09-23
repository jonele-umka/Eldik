// =============================================================================
// DataContext — единое хранилище данных.
//
// Всё грузится ОДИН раз при входе и живёт в памяти: переключение страниц
// не вызывает новых запросов. После любой записи (заказ, оплата, расход...)
// обновляются ТОЛЬКО затронутые таблицы — точечно, через refresh([...]).
// =============================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiGet, setApiUrl } from "../services/api.js";

const CACHE_KEY = "app_data_cache_v2";
const CACHE_TIME_KEY = "app_data_cache_time_v2";
const CACHE_TTL = 1000 * 60 * 5; // 5 минут — потом тихо обновляем в фоне

// ключ в data -> action бэкенда
export const ENDPOINTS = {
  orders: "orders",
  finance: "financeReport",
  payments: "payments",
  debtors: "debtors",
  returns: "returns",
  expenses: "expensesList",
  clients: "clients",
  analytics: "analytics",
  months: "analyticsMonths",
  production: "production",
  deliveryDetail: "deliveryDetail",
  stockOuts: "stockOuts",
  prices: "prices",
  suppliers: "suppliers",
  suppliersDebt: "suppliersDebt",
  purchases: "purchases",
  supplierPayments: "supplierPayments",
  offsets: "offsets",
  openingBalances: "openingBalances",
  rawMaterials: "rawMaterials",
  notes: "notes",
};

const ALL_KEYS = Object.keys(ENDPOINTS);

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DataProvider({ apiUrl, children }) {
  const [data, setData] = useState({});
  const [ready, setReady] = useState(false);   // первая загрузка завершена
  const [loading, setLoading] = useState(false); // идёт фоновое обновление
  const [busyKeys, setBusyKeys] = useState([]); // какие таблицы обновляются
  const [updatedAt, setUpdatedAt] = useState("");
  const [mutating, setMutating] = useState(0); // счётчик: сколько операций сохранения/удаления идёт сейчас
  const dataRef = useRef({});

  useEffect(() => {
    setApiUrl(apiUrl);
  }, [apiUrl]);

  const writeCache = useCallback((next) => {
    dataRef.current = next;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    } catch (_) {
      /* превышен лимит localStorage — не страшно */
    }
  }, []);

  // Загрузка конкретных таблиц. Остальные данные остаются в памяти.
  const refresh = useCallback(
    async (keys = ALL_KEYS) => {
      if (!apiUrl) return;
      const list = keys.filter((k) => ENDPOINTS[k]);
      if (!list.length) return;

      setBusyKeys((p) => [...new Set([...p, ...list])]);
      setLoading(true);

      const results = await Promise.allSettled(
        list.map((key) =>
          apiGet(ENDPOINTS[key]).then((d) => ({ key, d })),
        ),
      );

      const patch = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") patch[r.value.key] = r.value.d;
      });

      setData((prev) => {
        const next = { ...prev, ...patch };
        writeCache(next);
        return next;
      });

      setBusyKeys((p) => p.filter((k) => !list.includes(k)));
      setLoading(false);
      setUpdatedAt(timeLabel(Date.now()));
      setReady(true);
    },
    [apiUrl, writeCache],
  );

  // Старт: мгновенно показываем кеш, затем тихо обновляем в фоне.
  const boot = useCallback(async () => {
    if (!apiUrl) return;
    let hadCache = false;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const ts = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
      if (raw && ts) {
        const cached = JSON.parse(raw);
        dataRef.current = cached;
        setData(cached);
        setUpdatedAt(timeLabel(ts));
        setReady(true);
        hadCache = true;
        // свежий кеш — всё равно догружаем в фоне, но интерфейс не ждёт
        if (Date.now() - ts < CACHE_TTL) {
          refresh(ALL_KEYS);
          return;
        }
      }
    } catch (_) {}
    await refresh(ALL_KEYS);
    if (!hadCache) setReady(true);
  }, [apiUrl, refresh]);

  // Обёртка для мутаций: выполняет запрос и обновляет только нужные таблицы.
  // Пока идёт сохранение/удаление/правка — mutating > 0, чтобы UI мог
  // заблокировать интерфейс (не только при первой загрузке всего сайта).
  const mutate = useCallback(
    async (fn, keys = []) => {
      setMutating((n) => n + 1);
      try {
        const res = await fn();
        if (keys.length) await refresh(keys);
        return res;
      } finally {
        setMutating((n) => Math.max(0, n - 1));
      }
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      data,
      ready,
      loading,
      busyKeys,
      updatedAt,
      mutating: mutating > 0,
      refresh,
      refreshAll: () => refresh(ALL_KEYS),
      boot,
      mutate,
    }),
    [data, ready, loading, busyKeys, updatedAt, mutating, refresh, boot, mutate],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// Наборы таблиц, которые нужно перечитать после конкретной операции.
export const AFFECTS = {
  order: [
    "orders",
    "debtors",
    "finance",
    "analytics",
    "months",
    "production",
    "deliveryDetail",
  ],
  price: ["prices"],
  payment: ["payments", "orders", "debtors", "finance", "analytics", "months"],
  return: ["returns", "orders", "debtors", "finance", "analytics", "months"],
  expense: ["expenses", "finance", "analytics", "months"],
  client: ["clients"],
  supplier: ["suppliers", "suppliersDebt"],
  purchase: ["purchases", "suppliersDebt"],
  supplierPayment: ["supplierPayments", "suppliersDebt"],
  offset: ["offsets", "payments", "supplierPayments", "debtors", "suppliersDebt", "finance"],
  opening: ["openingBalances", "debtors", "suppliersDebt"],
  raw: ["rawMaterials"],
  note: ["notes"],
  stockOut: ["stockOuts"],
};
