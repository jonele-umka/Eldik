import { useState, useEffect } from "react";
import { NavItem } from "./components/UI.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import DebtorsPage from "./pages/DebtorsPage.jsx";
import {
  ReturnsPage,
  ExpensesPage,
  ClientsPage,
  NotesPage,
} from "./pages/MiscPages";
import ClientDetailPage from "./pages/ClientDetailPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import { ProductionDeliveryPage } from "./pages/ProductionPage.jsx";
import CatalogPage from "./pages/CatalogPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { S } from "./utils/styles.js";
import { useBreakpoint } from "./hooks/useBreakpoint.js";
import { DEFAULT_API_URL } from "./config.js";
import FinancePage from "./pages/FinancePage.jsx";
import {
  getStoredUser,
  setStoredUser,
  checkPassword,
  getAllowedPages,
} from "./utils/auth.js";
import SuppliersPage from "./pages/SuppliersPage.jsx";
import SupplierDetailPage from "./pages/SupplierDetailPage.jsx";
import { DataProvider, useData } from "./store/DataContext.jsx";
import { Spinner as UISpinner } from "./components/UI.jsx";
import { UIProvider } from "./store/UIContext.jsx";

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const PAGES = [
  { key: "dashboard", icon: "🏠", label: "Главная" },
  { key: "orders", icon: "📋", label: "Заказы" },
  { key: "finance", icon: "💰", label: "Финансы" },
  { key: "payments", icon: "💳", label: "Платежи" },
  { key: "debtors", icon: "⚠️", label: "Должники" },
  { key: "suppliers", icon: "🚛", label: "Поставщики" },
  { key: "returns", icon: "↩️", label: "Возвраты" },
  { key: "expenses", icon: "💸", label: "Расходы" },
  { key: "clients", icon: "👥", label: "Клиенты" },
  { key: "analytics", icon: "📊", label: "Аналитика" },
  { key: "production", icon: "🏭", label: "Производство/Развозка" },
  { key: "catalog", icon: "🗂️", label: "Каталог" },
  { key: "notes", icon: "📝", label: "Заметки" },
  { key: "settings", icon: "⚙️", label: "Настройки" },
];

// Главные страницы в нижней навигации на мобильном
const BOTTOM_NAV_PAGES = [
  "dashboard",
  "orders",
  "debtors",
  "production",
  "finance",
];

function firstAllowedPage(allowed) {
  if (allowed === "all") return "dashboard";
  return allowed[0] || "orders";
}

// ── Боковая панель: полная (десктоп) ──────────────────
function Sidebar({ page, setPage, setSearch, updatedAt, pages }) {
  return (
    <aside style={S.sidebar}>
      <div style={S.logo}>📦 Бизнес</div>
      <nav style={S.nav}>
        {pages.map((p) => (
          <NavItem
            key={p.key}
            icon={p.icon}
            label={p.label}
            active={page === p.key}
            onClick={() => {
              setSearch("");
              setPage(p.key);
            }}
          />
        ))}
      </nav>
      {updatedAt && (
        <div
          style={{
            padding: "12px 18px",
            fontSize: 11.5,
            color: "var(--muted2)",
            borderTop: "1px solid var(--b1)",
          }}
        >
          Обновлено в {updatedAt}
        </div>
      )}
    </aside>
  );
}

// ── Боковая панель: иконки (планшет) ──────────────────
function SidebarCollapsed({ page, setPage, setSearch, pages }) {
  return (
    <aside style={S.sidebarCollapsed}>
      <div style={S.logoCollapsed}>📦</div>
      <nav style={S.navCollapsed}>
        {pages.map((p) => {
          const active = page === p.key;
          return (
            <div
              key={p.key}
              title={p.label}
              onClick={() => {
                setSearch("");
                setPage(p.key);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 40,
                borderRadius: 8,
                marginBottom: 2,
                cursor: "pointer",
                fontSize: 18,
                background: active ? "rgba(88,166,255,.15)" : "transparent",
                transition: "background .15s",
              }}
            >
              {p.icon}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Нижняя навигация (мобильный) ──────────────────────
function BottomNav({ page, setPage, setSearch, pages }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const mainPages = pages.filter((p) => BOTTOM_NAV_PAGES.includes(p.key));
  const morePages = pages.filter((p) => !BOTTOM_NAV_PAGES.includes(p.key));

  return (
    <>
      {/* Шторка "Ещё" */}
      {moreOpen && morePages.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(0,0,0,0.5)",
          }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            style={{
              position: "absolute",
              bottom: 60,
              left: 0,
              right: 0,
              background: "var(--s1)",
              borderTop: "1px solid var(--b1)",
              borderRadius: "16px 16px 0 0",
              padding: "12px 8px 8px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                padding: "4px 12px 10px",
              }}
            >
              Все разделы
            </div>
            {morePages.map((p) => (
              <div
                key={p.key}
                onClick={() => {
                  setSearch("");
                  setPage(p.key);
                  setMoreOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 14,
                  color: page === p.key ? "var(--accent)" : "var(--text)",
                  background:
                    page === p.key ? "rgba(88,166,255,.08)" : "transparent",
                  marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>
                  {p.icon}
                </span>
                {p.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Нижняя панель */}
      <div style={S.bottomNav}>
        {mainPages.map((p) => {
          const active = page === p.key;
          return (
            <button
              key={p.key}
              onClick={() => {
                setSearch("");
                setPage(p.key);
                setMoreOpen(false);
              }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: active ? "var(--accent)" : "var(--muted)",
                padding: "6px 2px",
                transition: "color .15s",
              }}
            >
              <span style={{ fontSize: 20 }}>{p.icon}</span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: active ? 600 : 400,
                  letterSpacing: ".02em",
                }}
              >
                {p.label}
              </span>
            </button>
          );
        })}
        {/* Кнопка "Ещё" — только если есть, что показать */}
        {morePages.length > 0 && (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              color:
                !BOTTOM_NAV_PAGES.includes(page) && !moreOpen
                  ? "var(--accent)"
                  : moreOpen
                    ? "var(--accent)"
                    : "var(--muted)",
              padding: "6px 2px",
              transition: "color .15s",
            }}
          >
            <span style={{ fontSize: 20 }}>☰</span>
            <span
              style={{ fontSize: 9.5, fontWeight: 400, letterSpacing: ".02em" }}
            >
              Ещё
            </span>
          </button>
        )}
      </div>
    </>
  );
}

// ── Топбар ─────────────────────────────────────────────
function Topbar({
  label,
  search,
  setSearch,
  onRefresh,
  onLogout,
  loading,
  isMobile,
}) {
  return (
    <div
      style={{
        ...S.topbar,
        padding: isMobile ? "10px 14px" : "13px 24px",
      }}
    >
      <h1 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, margin: 0 }}>
        {label}
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "var(--s2)",
            border: "1px solid var(--b1)",
            borderRadius: 8,
            padding: "7px 10px",
            color: "var(--text)",
            fontSize: 13,
            width: isMobile ? 130 : 220,
            outline: "none",
            fontFamily: "Inter, sans-serif",
          }}
        />
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Обновить"
          style={{
            background: "var(--s2)",
            border: "1px solid var(--b1)",
            borderRadius: 8,
            padding: "7px 10px",
            color: "var(--text)",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            opacity: loading ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              display: "inline-block",
              animation: loading ? "spin .7s linear infinite" : "none",
              fontSize: 16,
            }}
          >
            ⟳
          </span>
          {!isMobile && "Обновить"}
        </button>
        <button
          onClick={onLogout}
          title="Выйти"
          style={{
            background: "var(--s2)",
            border: "1px solid var(--b1)",
            borderRadius: 8,
            padding: "7px 10px",
            color: "var(--text)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          🚪
        </button>
      </div>
    </div>
  );
}

// ── Root App ────────────────────────────────────────────
export default function App() {
  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem("gsApiUrl") || DEFAULT_API_URL,
  );

  return (
    <UIProvider>
      <DataProvider apiUrl={apiUrl}>
        <Shell apiUrl={apiUrl} setApiUrl={setApiUrl} />
      </DataProvider>
    </UIProvider>
  );
}

function Shell() {
  const { data, ready, loading, mutating, updatedAt, boot, refreshAll } = useData();

  const [user, setUser] = useState(() => getStoredUser());
  const [page, setPage] = useState(() =>
    firstAllowedPage(getAllowedPages(getStoredUser())),
  );
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [clientReturnPage, setClientReturnPage] = useState("clients");
  const [supplierReturnPage, setSupplierReturnPage] = useState("suppliers");

  const { isMobile, isTablet, isDesktop } = useBreakpoint();

  const allowedPages = user ? getAllowedPages(user) : [];
  const visiblePages =
    allowedPages === "all"
      ? PAGES
      : PAGES.filter((p) => allowedPages.includes(p.key));

  // Данные грузятся ОДИН раз при входе. Переключение страниц ничего не
  // перезапрашивает — всё уже лежит в памяти.
  useEffect(() => {
    if (!user) return;
    const allowed = getAllowedPages(user);
    if (allowed !== "all" && !allowed.includes(page)) {
      setPage(firstAllowedPage(allowed));
    }
    boot();
  }, []);

  const handleLogin = (pwd) => {
    const u = checkPassword(pwd);
    if (!u) return false;
    setStoredUser(u);
    setUser(u);
    setPage(firstAllowedPage(getAllowedPages(u)));
    boot();
    return true;
  };

  const handleLogout = () => {
    setStoredUser("");
    setUser("");
    setSearch("");
  };

  const openClientDetail = (clientName, fromPage = page) => {
    setClientReturnPage(fromPage);
    setSelectedClient(clientName);
    setPage("clientDetail");
  };

  const openSupplierDetail = (supplierName, fromPage = page) => {
    setSupplierReturnPage(fromPage);
    setSelectedSupplier(supplierName);
    setPage("supplierDetail");
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;

  // Полная блокировка интерфейса на время первой загрузки всех данных —
  // чтобы не открывать страницы с пустыми/неполными данными и не заставлять
  // вручную обновлять каждую страницу отдельно.
  if (!ready) {
    return (
      <div className="app-loading-overlay">
        <UISpinner />
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Загрузка данных…
        </div>
      </div>
    );
  }

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return (
          <DashboardPage
            orders={data.orders}
            debtors={data.debtors}
            finance={data.finance}
            production={data.production}
            prices={data.prices}
            isMobile={isMobile}
            onGo={setPage}
          />
        );
      case "orders":
        return (
          <OrdersPage
            data={data.orders}
            expenses={data.expenses}
            search={search}
            isMobile={isMobile}
            onSelectClient={openClientDetail}
            payments={data.payments} // ← добавить
            offsets={data.offsets} // ← добавить
            openingBalances={data.openingBalances}
          />
        );
      case "finance":
        return <FinancePage data={data.finance} orders={data.orders} />;
      case "payments":
        return <PaymentsPage data={data.payments} search={search} />;
      case "debtors":
        return (
          <DebtorsPage
            data={data.debtors}
            clients={data.clients}
            search={search}
            onSelectClient={openClientDetail}
          />
        );
      case "returns":
        return <ReturnsPage data={data.returns} search={search} />;
      case "expenses":
        return <ExpensesPage data={data.expenses} search={search} />;
      case "notes":
        return <NotesPage data={data.notes} search={search} />;
      case "suppliers":
        return (
          <SuppliersPage
            suppliers={data.suppliers}
            debts={data.suppliersDebt}
            search={search}
            onSelectSupplier={openSupplierDetail}
          />
        );

      case "supplierDetail":
        return (
          <SupplierDetailPage
            supplier={selectedSupplier}
            purchases={data.purchases}
            payments={data.supplierPayments}
            offsets={data.offsets}
            openingBalances={data.openingBalances}
            debtors={data.debtors}
            debtRow={(data.suppliersDebt || []).find(
              (d) => norm(d.supplier) === norm(selectedSupplier),
            )}
            onBack={() => setPage(supplierReturnPage)}
          />
        );
      case "clients":
        return (
          <ClientsPage
            data={data.clients}
            search={search}
            onSelectClient={openClientDetail}
          />
        );
      case "clientDetail":
        return (
          <ClientDetailPage
            client={selectedClient}
            orders={data.orders}
            payments={data.payments}
            returns={data.returns}
            offsets={data.offsets}
            openingBalances={data.openingBalances}
            debtRow={(data.debtors || []).find(
              (d) => norm(d.client) === norm(selectedClient),
            )}
            isMobile={isMobile}
            onBack={() => setPage(clientReturnPage)}
          />
        );
      case "analytics":
        return (
          <AnalyticsPage
            analytics={data.analytics}
            months={data.months}
            expenses={data.expenses}
          />
        );
      case "production":
        return (
          <ProductionDeliveryPage
            data={data.production}
            prices={data.prices}
            search={search}
            isMobile={isMobile}
            isTablet={isTablet}
          />
        );
      case "catalog":
        return <CatalogPage data={data.prices} search={search} isMobile={isMobile} />;
      case "settings":
        return <SettingsPage user={user} onLogout={handleLogout} />;
      default:
        return null;
    }
  };

  const currentPage = PAGES.find((p) => p.key === page);
  const topbarLabel =
    page === "clientDetail"
      ? selectedClient || "Клиент"
      : page === "supplierDetail"
        ? selectedSupplier || "Поставщик"
        : currentPage?.label;

  const contentStyle = isMobile ? S.contentMobile : S.content;

  return (
    <div style={S.layout}>
      {isDesktop && (
        <Sidebar
          page={page}
          setPage={setPage}
          setSearch={setSearch}
          updatedAt={updatedAt}
          pages={visiblePages}
        />
      )}
      {isTablet && (
        <SidebarCollapsed
          page={page}
          setPage={setPage}
          setSearch={setSearch}
          pages={visiblePages}
        />
      )}

      <div style={S.main}>
        <Topbar
          label={topbarLabel}
          search={search}
          setSearch={setSearch}
          onRefresh={refreshAll}
          onLogout={handleLogout}
          loading={loading}
          isMobile={isMobile}
        />
        <div style={contentStyle}>{renderPage()}</div>
      </div>

      {isMobile && (
        <BottomNav
          page={page}
          setPage={setPage}
          setSearch={setSearch}
          pages={visiblePages}
        />
      )}

      {/* Блокировка интерфейса на время сохранения/удаления/правки —
          не только при первой загрузке всего сайта. */}
      {mutating && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            background: "rgba(0,0,0,.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--s1)",
              border: "1px solid var(--b1)",
              borderRadius: 12,
              padding: "14px 22px",
              boxShadow: "0 12px 32px rgba(0,0,0,.45)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              color: "var(--text)",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                border: "2px solid var(--b1)",
                borderTopColor: "var(--accent)",
                borderRadius: "50%",
                animation: "spin .7s linear infinite",
                display: "inline-block",
              }}
            />
            Сохранение…
          </div>
        </div>
      )}
    </div>
  );
}
