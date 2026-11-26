import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";
import { AppInit } from "./components/AppInit";
import { BottomNav } from "./components/nav/BottomNav";
import { NavRail } from "./components/nav/NavRail";
import { Toaster } from "./components/Toast";

export const metadata: Metadata = {
  title: "split-it",
  description: "Split an itemized bill at the table, quickly and fairly.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f1e8", // the `ground` token
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="bg-ground font-body text-ink antialiased">
        <AppInit />
        <NavRail />
        {/* Rail offset + reading column, set once here rather than per route. */}
        <div className="md:pl-60">
          <div className="mx-auto min-h-dvh w-full max-w-[720px] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </div>
        </div>
        <BottomNav />
        <Toaster />
      </body>
    </html>
  );
}
