import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "./AppShell";
import { AuthGate } from "../components/AuthGate";

const AccountDetailPage = lazy(() =>
  import("../pages/AccountDetailPage").then((module) => ({ default: module.AccountDetailPage }))
);
const AccountSettingsPage = lazy(() =>
  import("../pages/AccountSettingsPage").then((module) => ({ default: module.AccountSettingsPage }))
);
const AssetsPage = lazy(() => import("../pages/AssetsPage").then((module) => ({ default: module.AssetsPage })));
const CategoryManagementPage = lazy(() =>
  import("../pages/CategoryManagementPage").then((module) => ({ default: module.CategoryManagementPage }))
);
const DataClearPage = lazy(() => import("../pages/DataClearPage").then((module) => ({ default: module.DataClearPage })));
const DataToolsPage = lazy(() => import("../pages/DataToolsPage").then((module) => ({ default: module.DataToolsPage })));
const EntryEditorPage = lazy(() =>
  import("../pages/EntryEditorPage").then((module) => ({ default: module.EntryEditorPage }))
);
const LedgerCalendarPage = lazy(() =>
  import("../pages/LedgerCalendarPage").then((module) => ({ default: module.LedgerCalendarPage }))
);
const LedgerHome = lazy(() => import("../pages/LedgerHome").then((module) => ({ default: module.LedgerHome })));
const LoansPage = lazy(() => import("../pages/LoansPage").then((module) => ({ default: module.LoansPage })));
const MorePage = lazy(() => import("../pages/MorePage").then((module) => ({ default: module.MorePage })));
const ReportCategoryDetailPage = lazy(() =>
  import("../pages/ReportCategoryDetailPage").then((module) => ({ default: module.ReportCategoryDetailPage }))
);
const ReportsPage = lazy(() => import("../pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const SearchPage = lazy(() => import("../pages/SearchPage").then((module) => ({ default: module.SearchPage })));
const TransactionDetailPage = lazy(() =>
  import("../pages/TransactionDetailPage").then((module) => ({ default: module.TransactionDetailPage }))
);

function RouteFallback() {
  return (
    <div className="route-fallback" aria-label="页面加载中">
      <span />
    </div>
  );
}

function withPageFallback(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      { index: true, element: withPageFallback(<LedgerHome />) },
      { path: "assets", element: withPageFallback(<AssetsPage />) },
      { path: "reports", element: withPageFallback(<ReportsPage />) },
      { path: "loans", element: withPageFallback(<LoansPage />) },
      { path: "more", element: withPageFallback(<MorePage />) },
      { path: "search", element: withPageFallback(<SearchPage />) }
    ]
  },
  {
    path: "/assets/accounts/:accountId",
    element: (
      <AuthGate>
        {withPageFallback(<AccountDetailPage />)}
      </AuthGate>
    )
  },
  {
    path: "/assets/accounts/:accountId/settings",
    element: (
      <AuthGate>
        {withPageFallback(<AccountSettingsPage />)}
      </AuthGate>
    )
  },
  {
    path: "/reports/categories/:categoryId",
    element: (
      <AuthGate>
        {withPageFallback(<ReportCategoryDetailPage />)}
      </AuthGate>
    )
  },
  {
    path: "/calendar",
    element: (
      <AuthGate>
        {withPageFallback(<LedgerCalendarPage />)}
      </AuthGate>
    )
  },
  {
    path: "/entry",
    element: (
      <AuthGate>
        {withPageFallback(<EntryEditorPage />)}
      </AuthGate>
    )
  },
  {
    path: "/entry/:id",
    element: (
      <AuthGate>
        {withPageFallback(<EntryEditorPage />)}
      </AuthGate>
    )
  },
  {
    path: "/categories",
    element: (
      <AuthGate>
        {withPageFallback(<CategoryManagementPage />)}
      </AuthGate>
    )
  },
  {
    path: "/data",
    element: (
      <AuthGate>
        {withPageFallback(<DataToolsPage />)}
      </AuthGate>
    )
  },
  {
    path: "/data-clear",
    element: (
      <AuthGate>
        {withPageFallback(<DataClearPage />)}
      </AuthGate>
    )
  },
  {
    path: "/transactions/:id",
    element: (
      <AuthGate>
        {withPageFallback(<TransactionDetailPage />)}
      </AuthGate>
    )
  }
]);
