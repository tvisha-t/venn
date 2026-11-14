// The ONLY module that reads contact_points. Used solely by the email sender.
// Every read is audit-logged. Addresses never leave this module except to the email provider.
import { sql } from "./db";
import { audit } from "./audit";

export type Deliverability =
  | { ok: true; address: string; kind: "primary" | "emfl" | "on_file" }
  | { ok: false; reason: "do_not_contact" | "bounced" | "no_address" };

export async function resolveRecipientAddress(profileId: string, actor: string, purpose: string): Promise<Deliverability> {
  const [r] = await sql`
    select p.status, cp.email_primary, cp.email_emfl_alias, cp.do_not_contact, cp.bounced
    from profiles p left join contact_points cp on cp.profile_id = p.id where p.id = ${profileId}`;
  await audit(actor, "contact.read", profileId, { purpose });
  if (!r) return { ok: false, reason: "no_address" };
  if (r.do_not_contact) return { ok: false, reason: "do_not_contact" };
  if (r.bounced) return { ok: false, reason: "bounced" };
  // claimed → email_primary; unclaimed → EMFL alias if present, else email on file (§8.1 step 3)
  if (r.status === "claimed" && r.email_primary) return { ok: true, address: r.email_primary, kind: "primary" };
  if (r.email_emfl_alias) return { ok: true, address: r.email_emfl_alias, kind: "emfl" };
  if (r.email_primary) return { ok: true, address: r.email_primary, kind: "on_file" };
  return { ok: false, reason: "no_address" };
}

/** Is this profile reachable at all? (no address returned, no audit needed) */
export async function isContactable(profileId: string): Promise<boolean> {
  const [r] = await sql`select (email_primary is not null or email_emfl_alias is not null) and not do_not_contact and not bounced ok
    from contact_points where profile_id = ${profileId}`;
  return Boolean(r?.ok);
}

export async function flagBounced(profileId: string) {
  await sql`update contact_points set bounced = true, updated_at = now() where profile_id = ${profileId}`;
}
