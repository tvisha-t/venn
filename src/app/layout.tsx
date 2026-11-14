import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "venn · Find your people",
  description: "Your agent for the Georgia Tech network: find the right Yellow Jackets and send an intro they can answer by email.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${mono.variable}`}>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
