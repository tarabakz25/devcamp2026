import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "メンバーリスト — Roomi",
};

export default function MembersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
