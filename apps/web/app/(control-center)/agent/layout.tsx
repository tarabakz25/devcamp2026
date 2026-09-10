import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "エージェント — Roomi",
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
