"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getFallbackAvatarSvg } from "./CommunicationTopicGraph";
import MaterialIcon from "./MaterialIcon";
import RoomiLogo from "./RoomiLogo";

const MENU = [
  { href: "/", label: "トップ", icon: "home" },
  { href: "/members", label: "メンバーリスト", icon: "group" },
  { href: "/discussions", label: "ディスカッション", icon: "forum" },
  { href: "/agent", label: "エージェント", icon: "smart_toy" },
] as const;

function isActivePath(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const accountActive = isActivePath("/account", pathname);

  return (
    <aside className="roomi-sidebar-nav" aria-label="ナビゲーション">
      <div className="roomi-workspace-header">
        <Link href="/" className="roomi-workspace-logo" aria-label="トップへ">
          <RoomiLogo size={44} />
        </Link>
        <div className="roomi-workspace-info">
          <span className="roomi-workspace-title">Roomi</span>
          <span className="roomi-workspace-meta">神山まるごと高専</span>
        </div>
      </div>

      <nav className="roomi-menu-list" aria-label="メインメニュー">
        {MENU.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`roomi-menu-item${active ? " active" : ""}`}
            >
              <MaterialIcon name={item.icon} className="roomi-menu-icon" filled={active} />
              <span className="roomi-menu-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="roomi-sidebar-spacer" />

      <div className="roomi-sidebar-footer">
        {session?.user ? (
          <Link
            href="/account"
            className={`roomi-footer-user${accountActive ? " active" : ""}`}
          >
            <img
              src={
                session.user.image ||
                getFallbackAvatarSvg(session.user.name || "ユーザー", session.user.id)
              }
              alt=""
              className="footer-avatar"
            />
            <div className="footer-user-meta">
              <span className="footer-user-name">{session.user.name}</span>
              <span className="footer-user-email">{session.user.email}</span>
            </div>
          </Link>
        ) : (
          <Link
            href="/account"
            className={`roomi-footer-user${accountActive ? " active" : ""}`}
          >
            <span className="footer-avatar placeholder" aria-hidden="true" />
            <div className="footer-user-meta">
              <span className="footer-user-name">ログイン</span>
              <span className="footer-user-email">Googleアカウント</span>
            </div>
          </Link>
        )}
      </div>
    </aside>
  );
}
