import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Jot - paste the mess. publish the page.", template: "%s · Jot" },
  description:
    "Bring notes from Google Docs, Notion, Word, Apple Notes or plain Markdown. Jot keeps your headings, lists, tables and code, and gives the page its own link.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="bg-background font-sans text-foreground antialiased selection:bg-sky/30">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
