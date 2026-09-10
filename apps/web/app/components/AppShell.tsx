"use client";

import { usePathname } from "next/navigation";
import AppSidebar from "./AppSidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isGraphHome = pathname === "/";

  return (
    <div className={`roomi-app-shell${isGraphHome ? "" : " is-paged"}`}>
      <AppSidebar />
      {children}
    </div>
  );
}
