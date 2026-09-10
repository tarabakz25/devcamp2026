import type { Metadata } from "next";
import SlackDemoChat from "../components/SlackDemoChat";

export const metadata: Metadata = {
  title: "Roomi Demo Chat",
  description: "実Slack不要のデモ用チャット。朝食会場スレの再生とAI介入を見せる",
};

export default function DemoPage() {
  return <SlackDemoChat />;
}
