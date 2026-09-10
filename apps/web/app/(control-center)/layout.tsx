import AppShell from "../components/AppShell";

export default function ControlCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
