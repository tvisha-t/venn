import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms · venn" };

export default function Terms() {
  return (
    <LegalPage title="Terms">
      <p>By using Venn you agree to use it to make genuine, respectful connections within the Georgia Tech community.</p>
      <ul>
        <li>Sign in only as yourself, with your own school or alumni email.</li>
        <li>Send intros with one specific, honest ask. No spam, recruiting blasts, sales pitches or harassment.</li>
        <li>Respect &ldquo;Not interested&rdquo; and don&apos;t try to contact people outside Venn who declined.</li>
        <li>Don&apos;t copy, scrape or export other members&apos; information.</li>
        <li>We may pause accounts that break these rules. Venn is a student demo and is provided as-is.</li>
      </ul>
    </LegalPage>
  );
}
