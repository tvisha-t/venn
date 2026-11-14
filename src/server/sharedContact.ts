// Opt-in contact details (preferred email, phone, LinkedIn, website).
// - Only claimed members can set them, only for their own profile.
// - Readable only by signed-in GT users via GET /api/profiles/:id/contact; every view is audited.
// - Never part of PublicProfile, never sent to the LLM. Unclaimed people are relay-only.
import { z } from "zod";
import { sql } from "./db";
import { audit } from "./audit";
import { VISIBLE_PREDICATE } from "./dto";

export type SharedContact = { preferredEmail: string | null; phone: string | null; linkedinUrl: string | null; websiteUrl: string | null };

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);

export const SharedContactInput = z.object({
  preferredEmail: z.preprocess(emptyToNull, z.string().email().max(120).nullable()),
  phone: z.preprocess(emptyToNull, z.string().regex(/^\+?[\d\s().-]{7,20}$/, "Enter a valid phone number").nullable()),
  linkedinUrl: z.preprocess(emptyToNull, z.string().url().max(200).refine((u) => /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(u), "Must be a https://linkedin.com/ link").nullable()),
  websiteUrl: z.preprocess(emptyToNull, z.string().url().max(200).refine((u) => u.startsWith("https://"), "Must start with https://").nullable()),
});

function toDto(r: Record<string, string | null> | undefined): SharedContact {
  return {
    preferredEmail: r?.preferred_email ?? null,
    phone: r?.phone ?? null,
    linkedinUrl: r?.linkedin_url ?? null,
    websiteUrl: r?.website_url ?? null,
  };
}

export async function getOwnSharedContact(profileId: string): Promise<SharedContact> {
  const [r] = await sql`select preferred_email, phone, linkedin_url, website_url from shared_contact where profile_id = ${profileId}`;
  return toDto(r as never);
}

export async function setOwnSharedContact(profileId: string, input: z.infer<typeof SharedContactInput>, actor: string) {
  const [p] = await sql`select status from profiles where id = ${profileId}`;
  if (p?.status !== "claimed") throw new Error("Only claimed profiles can share contact details");
  const all = Object.values(input).every((v) => v == null);
  if (all) await sql`delete from shared_contact where profile_id = ${profileId}`;
  else
    await sql`
      insert into shared_contact (profile_id, preferred_email, phone, linkedin_url, website_url)
      values (${profileId}, ${input.preferredEmail}, ${input.phone}, ${input.linkedinUrl}, ${input.websiteUrl})
      on conflict (profile_id) do update set preferred_email = excluded.preferred_email, phone = excluded.phone,
        linkedin_url = excluded.linkedin_url, website_url = excluded.website_url, updated_at = now()`;
  // Log which fields are shared, never the values.
  await audit(actor, "shared_contact.update", profileId, { fields: Object.entries(input).filter(([, v]) => v != null).map(([k]) => k) });
  return getOwnSharedContact(profileId);
}

/** What a signed-in viewer may see of another member's opted-in details. Audited. */
export async function viewSharedContact(profileId: string, viewerUserId: string): Promise<SharedContact | null> {
  const [r] = await sql`
    select sc.preferred_email, sc.phone, sc.linkedin_url, sc.website_url
    from shared_contact sc join profiles p on p.id = sc.profile_id
    where sc.profile_id = ${profileId} and p.status = 'claimed' and ${sql.unsafe(VISIBLE_PREDICATE)}`;
  if (!r) return null;
  await audit(`user:${viewerUserId}`, "shared_contact.view", profileId);
  return toDto(r as never);
}

export async function hasSharedContact(profileId: string): Promise<boolean> {
  const [r] = await sql`select 1 from shared_contact where profile_id = ${profileId}`;
  return Boolean(r);
}
