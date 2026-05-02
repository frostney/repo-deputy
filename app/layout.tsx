import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Repo Deputy",
  description: "A whole-repository drift scanner for app and MCP workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
