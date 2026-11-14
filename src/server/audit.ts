import { sql as defaultSql, type Sql } from "./db";

export type AuditAction =
  | "contact.read" | "intro.send" | "intro.reminder" | "intro.reply_forward" | "profile.remove"
  | "profile.claim" | "profile.approve" | "aa.import" | "intro.decline" | "email.bounce"
  | "shared_contact.view" | "shared_contact.update";

export async function audit(
  actor: string,
  action: AuditAction,
  targetId: string | null,
  meta: Record<string, unknown> = {},
  db: Sql = defaultSql,
) {
  await db`insert into audit_log (actor, action, target_id, meta) values (${actor}, ${action}, ${targetId}, ${db.json(meta as never)})`;
}
