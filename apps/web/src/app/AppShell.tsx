import { Outlet } from "react-router-dom";

import { BottomTabs } from "../components/BottomTabs";

export function AppShell() {
  return (
    <div className="app-frame">
      <main className="app-screen">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}

