import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "statline — NBA performance search",
  description: "Find NBA player-games by stat ranges.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
