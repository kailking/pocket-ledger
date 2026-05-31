import { BarChart3, FileText, MessageSquare, MoreHorizontal, Plus, WalletCards } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { to: "/assets", label: "资产", icon: WalletCards },
  { to: "/reports", label: "报表", icon: BarChart3 },
  { to: "/loans", label: "借贷", icon: MessageSquare },
  { to: "/more", label: "更多", icon: MoreHorizontal }
];

export function BottomTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const ledgerActive = location.pathname === "/";

  return (
    <nav className="bottom-tabs" aria-label="主导航">
      {tabs.slice(0, 2).map((tab) => (
        <NavLink className="bottom-tabs__item" key={tab.to} to={tab.to}>
          <tab.icon aria-hidden="true" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
      <button
        className={`bottom-tabs__add ${ledgerActive ? "is-active" : ""}`}
        onClick={() => navigate(ledgerActive ? "/entry" : "/")}
        type="button"
        aria-label={ledgerActive ? "记一笔" : "账单"}
      >
        {ledgerActive ? <Plus aria-hidden="true" /> : <FileText aria-hidden="true" />}
        <span>账单</span>
      </button>
      {tabs.slice(2).map((tab) => (
        <NavLink className="bottom-tabs__item" key={tab.to} to={tab.to}>
          <tab.icon aria-hidden="true" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
