import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomi Control Center",
  description: "AIの判断・関係性・記憶の可視化",
  icons: {
    icon: "/roomi-logo.svg",
    apple: "/roomi-logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Poppins:wght@600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
