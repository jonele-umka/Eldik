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

// Автообновление заказов, чтобы не приходилось жать "Обновить" самому.
// Раньше если страница просто открыта (вкладка держится) — новый заказ,
// добавленный кем-то другим, не появлялся сам, пока не обновишь вручную.
const ORDERS_POLL_MS = 30 * 1000; // пока вкладка открыта — каждые 30с

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
  notFits: "notFits",
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
  const [ready, setReady] = useState(false); // первая загрузка завершена
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
  // silent — для тихого автообновления в фоне (см. опрос заказов ниже):
  // не крутим общий индикатор загрузки, чтобы не мигало само по себе
  // каждые 30 секунд, пока человек просто держит вкладку открытой.
  const refresh = useCallback(
    async (keys = ALL_KEYS, { silent = false } = {}) => {
      if (!apiUrl) return;
      const list = keys.filter((k) => ENDPOINTS[k]);
      if (!list.length) return;

      if (!silent) {
        setBusyKeys((p) => [...new Set([...p, ...list])]);
        setLoading(true);
      }

      const results = await Promise.allSettled(
        list.map((key) => apiGet(ENDPOINTS[key]).then((d) => ({ key, d }))),
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

      if (!silent) {
        setBusyKeys((p) => p.filter((k) => !list.includes(k)));
        setLoading(false);
      }
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

  // Когда возвращаются на вкладку (сворачивали окно, переключались на
  // другую вкладку, комп выходил из сна) — сразу подтягиваем всё заново,
  // а не ждём, пока сам нажмёт "Обновить".
  useEffect(() => {
    if (!apiUrl) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(ALL_KEYS);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [apiUrl, refresh]);

  // Пока вкладка открыта — тихо подтягиваем заказы каждые 30 секунд сами,
  // без нажатий. Именно заказы, а не всё подряд: это то, что реально
  // должно появляться сразу (новый заказ), а не перегружать бэкенд
  // лишними запросами по всем таблицам разом.
  useEffect(() => {
    if (!apiUrl) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh(["orders"], { silent: true });
    }, ORDERS_POLL_MS);
    return () => clearInterval(id);
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
      } catch (err) {
        // Google Apps Script иногда отвечает ошибкой (например, 404) уже
        // ПОСЛЕ того, как сама операция на сервере отработала — рвётся
        // только доставка ответа обратно, не само сохранение. Поэтому
        // даже при ошибке подтягиваем актуальные данные: если на самом
        // деле всё сохранилось, это сразу видно на экране, а не только
        // после ручного обновления страницы (когда оно "само" поправится).
        if (keys.length) {
          try {
            await refresh(keys);
          } catch {
            /* обновить не удалось — не критично, ошибку показываем ниже */
          }
        }
        throw err;
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
    [
      data,
      ready,
      loading,
      busyKeys,
      updatedAt,
      mutating,
      refresh,
      boot,
      mutate,
    ],
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
    // Заказ бартерному клиенту (имя совпадает с поставщиком) может
    // автоматически создать зачёт на бэкенде — подтягиваем и эти данные.
    "payments",
    "supplierPayments",
    "offsets",
    "suppliersDebt",
  ],
  price: ["prices"],
  payment: ["payments", "orders", "debtors", "finance", "analytics", "months"],
  return: ["returns", "orders", "debtors", "finance", "analytics", "months"],
  expense: ["expenses", "finance", "analytics", "months"],
  client: ["clients"],
  supplier: ["suppliers", "suppliersDebt"],
  purchase: ["purchases", "suppliersDebt"],
  supplierPayment: ["supplierPayments", "suppliersDebt"],
  offset: [
    "offsets",
    "payments",
    "supplierPayments",
    "debtors",
    "suppliersDebt",
    "finance",
  ],
  opening: ["openingBalances", "debtors", "suppliersDebt"],
  raw: ["rawMaterials"],
  note: ["notes"],
  stockOut: ["stockOuts"],
  notFit: ["notFits"],
};
