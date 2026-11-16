import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Jot - a home for your words", template: "%s · Jot" },
  description: "Write freely. Make it yours. Publish a beautiful page for the world.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background font-sans text-foreground antialiased selection:bg-primary/20">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
