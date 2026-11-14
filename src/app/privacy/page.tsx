import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy · venn" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>Venn helps Georgia Tech students, alumni, faculty, staff and lifetime learners find each other and send one-email intros. This page explains what we keep and who can see it.</p>
      <h2>What other members see</h2>
      <ul>
        <li>Your public profile: name, class year, major, GT programs, employer, title, industry and city. Students appear only after they sign up and approve their profile.</li>
        <li>Your email and phone are not part of your profile. If you choose to, you can show a preferred email, phone, LinkedIn or website to signed-in GT members from your Profile page. That is off by default, you can turn it off at any time, and every view is logged.</li>
      </ul>
      <h2>How intros work</h2>
      <ul>
        <li>Intros are sent by email through a private Venn relay address. The recipient sees your message, not your address.</li>
        <li>If they reply, their reply reaches you and shares their email with you. &ldquo;Not interested&rdquo; shares nothing.</li>
        <li>Venn never sends an intro without you clicking Send. People get at most one reminder.</li>
      </ul>
      <h2>Alumni Association records</h2>
      <ul>
        <li>Some alumni are listed from GT Alumni Association records before they join. We never list anyone who is deceased or opted out of the directory.</li>
        <li>Every email to a listed alum includes one-tap links to claim the profile or remove it. Removed people are never listed or contacted again.</li>
      </ul>
      <h2>Location, AI and retention</h2>
      <ul>
        <li>Locations are rounded to about 1 km, and the map never shows groups smaller than 3 people up close.</li>
        <li>AI helps parse goals, rank matches and draft intros. It never receives email addresses or phone numbers.</li>
        <li>Message bodies of declined or unanswered intros are deleted after 180 days, and their records after 1 year.</li>
      </ul>
    </LegalPage>
  );
}
