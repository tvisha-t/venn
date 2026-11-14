import Link from "next/link";
import { VennLogo } from "@/components/brand/VennLogo";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <main id="main" className="mx-auto max-w-[680px] rounded-xl border border-line bg-surface px-6 py-10 sm:px-12">
        <VennLogo size="nav" href="/signin" />
        <h1 className="mt-8 text-title-1">{title}</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-text [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-text-muted [&_li]:text-text-muted">
          {children}
        </div>
        <p className="mt-10 text-meta text-text-muted">Venn is a student project for the GT SGA × College of Lifetime Learning Campus Solutions Challenge. Demo data is fictional. <Link href="/signin" className="text-primary underline underline-offset-2">Back to sign in</Link></p>
      </main>
    </div>
  );
}
