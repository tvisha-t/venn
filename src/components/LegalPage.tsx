import Link from "next/link";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8F3F7] px-4 py-10">
      <main id="main" className="mx-auto max-w-[680px] rounded-[24px] border border-[#EADFE6] bg-surface px-6 py-10 sm:px-12">
        <Link href="/signin" className="text-[26px] font-bold tracking-[-0.045em] text-brand">venn</Link>
        <h1 className="mt-8 text-title">{title}</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-ink-2 [&_li]:text-ink-2">
          {children}
        </div>
        <p className="mt-10 text-meta text-ink-2">Venn is a student project for the GT SGA × College of Lifetime Learning Campus Solutions Challenge. Demo data is fictional. <Link href="/signin" className="text-brand underline underline-offset-2">Back to sign in</Link></p>
      </main>
    </div>
  );
}
