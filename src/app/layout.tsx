import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fare Finder",
  description: "Find the cheapest way into and out of a country: every airport priced, open-jaw trips included.",
};

// The system font stack (--font-ui) loads nothing, so there is no web font to fetch or swap in.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-ui text-[14px] text-text antialiased">{children}</body>
    </html>
  );
}
