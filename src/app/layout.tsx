import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "venn · Find your people",
  description: "Your agent for the Georgia Tech network: find the right Yellow Jackets and send an intro they can answer by email.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Light by default; applies a saved dark choice before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${jakarta.variable} ${mono.variable}`}>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
