import { sql } from "./db";
import { identityProvider } from "./identity";
import { audit } from "./audit";

/**
 * Complete a (mock) GT Login. Creates the user on first sign-in. If a claim is
 * pending (from a signed /r/{token}/claim link), links the unclaimed AA profile
 * to this user instead of creating a new profile.
 */
export async function completeSignIn(input: { identityId: string } | { email: string }, claimProfileId?: string | null) {
  const id = await identityProvider.signIn(input);
  const [user] = await sql`
    insert into users (auth_subject, login_email) values (${id.subject}, ${id.email})
    on conflict (auth_subject) do update set login_email = excluded.login_email returning id`;

  let [profile] = await sql`select id from profiles where user_id = ${user.id} and status = 'claimed' limit 1`;

  if (!profile && claimProfileId) {
    const [claimed] = await sql`
      update profiles set user_id = ${user.id}, status = 'claimed', summary_approved = false, updated_at = now()
      where id = ${claimProfileId} and status = 'unclaimed' returning id`;
    if (claimed) {
      // The login email becomes their contact address; AA addresses stay as fallback alias.
      await sql`
        insert into contact_points (profile_id, email_primary) values (${claimed.id}, ${id.email})
        on conflict (profile_id) do update set email_primary = excluded.email_primary, updated_at = now()`;
      await audit(`user:${user.id}`, "profile.claim", claimed.id);
      profile = claimed;
    }
  }

  const claimedNow = Boolean(profile && claimProfileId && profile.id === claimProfileId);
  let isNew = false;
  if (!profile) {
    const [first, ...rest] = id.displayName.split(" ");
    const [school] = await sql`select id from schools where slug = 'gatech'`;
    [profile] = await sql`
      insert into profiles (school_id, user_id, status, source, first_name, last_name, roles, summary_approved)
      values (${school.id}, ${user.id}, 'claimed', 'self', ${first || "-"}, ${rest.join(" ") || "-"}, ${[id.affiliation]}, false)
      returning id`;
    await sql`insert into contact_points (profile_id, email_primary) values (${profile.id}, ${id.email}) on conflict do nothing`;
    isNew = true;
  }

  // Signing in with a school email (or GT login) is the "GT email" verification.
  await sql`update profiles set verified_method = coalesce(verified_method, 'gt_email'), verified_at = coalesce(verified_at, now()) where id = ${profile.id}`;
  const [p] = await sql`select summary_approved from profiles where id = ${profile.id}`;
  return {
    userId: user.id as string, profileId: profile.id as string, needsProfile: isNew || !p.summary_approved,
    isNew, joined: isNew || claimedNow, // joined = this sign-in created or claimed the profile (credits an invite)
  };
}
