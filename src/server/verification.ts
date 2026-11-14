// Ways to show you're a Jacket. Sign-in stays GT-email only (that IS the "GT email" verification);
// the other methods add proof on top. For the demo, e-transcript and diploma uploads are only recorded
// as "in review": the file is hashed (to block reuse) and discarded immediately, never stored or shown.
// The quiz is real: questions are served one at a time and the answer key never leaves the server.
import { createHash, randomInt } from "node:crypto";
import { sql } from "./db";
import { audit } from "./audit";
import { HttpError } from "./http";

export type Method = "gt_email" | "etranscript" | "diploma_photo" | "quiz";
export const METHOD_BADGE: Record<Method, string> = {
  gt_email: "Verified · GT email", etranscript: "Verified · transcript", diploma_photo: "Verified · diploma", quiz: "Verified · quiz",
};

export const QUIZ_LEN = 5;
export const QUIZ_PASS = 4;
export const QUIZ_SECONDS = 20;
export const QUIZ_MAX_ATTEMPTS = 3;
export const QUIZ_RETRY_HOURS = 24;

/** Approved methods for a profile (first = how they got in). Shown as badges; never the evidence. */
export async function verificationBadges(profileId: string): Promise<{ method: Method; label: string }[]> {
  const rows = await sql`
    select verified_method m, 0 o from profiles where id = ${profileId} and verified_at is not null and verified_method is not null
    union select method m, 1 o from verifications where profile_id = ${profileId} and status = 'approved'
    order by o`;
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.m) && seen.add(r.m)).map((r) => ({ method: r.m as Method, label: METHOD_BADGE[r.m as Method] }));
}

async function quizState(profileId: string) {
  const attempts = await sql`select status, created_at, finished_at from quiz_attempts where profile_id = ${profileId} order by created_at desc`;
  const used = attempts.filter((a) => a.status !== "in_progress").length;
  const last = attempts.find((a) => a.status === "failed");
  const nextAt = last ? new Date(new Date(last.finished_at ?? last.created_at).getTime() + QUIZ_RETRY_HOURS * 3600_000) : null;
  const passed = attempts.some((a) => a.status === "passed");
  return {
    passed,
    attemptsLeft: Math.max(0, QUIZ_MAX_ATTEMPTS - used),
    retryAt: nextAt && nextAt.getTime() > Date.now() ? nextAt.toISOString() : null,
  };
}

export async function verifyStatus(profileId: string) {
  const [badges, pending, quiz] = await Promise.all([
    verificationBadges(profileId),
    sql`select method, created_at from verifications where profile_id = ${profileId} and status = 'pending' order by created_at desc`,
    quizState(profileId),
  ]);
  return { badges, pending: pending.map((p) => ({ method: p.method as Method, at: new Date(p.created_at).toISOString() })), quiz };
}

/** Per-account limit across /verify actions: 5 per hour. */
async function accountLimit(profileId: string) {
  const [{ n }] = await sql`select
    (select count(*) from verifications where profile_id = ${profileId} and created_at > now() - interval '1 hour')
    + (select count(*) from quiz_attempts where profile_id = ${profileId} and created_at > now() - interval '1 hour') as n`;
  if (Number(n) >= 5) throw new HttpError(429, "Too many verification attempts. Try again in an hour.", "rate_limited");
}

const UPLOAD_RULES = {
  etranscript: { max: 5 * 1024 * 1024, types: ["application/pdf"], label: "a PDF up to 5 MB" },
  diploma_photo: { max: 10 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/heic", "image/heif"], label: "a JPG, PNG or HEIC photo up to 10 MB" },
} as const;

/** Records an upload as "in review". The file itself is hashed and dropped; nothing is stored. */
export async function submitUpload(profileId: string, method: "etranscript" | "diploma_photo", file: File) {
  const rule = UPLOAD_RULES[method];
  const type = file.type || (/\.heic$/i.test(file.name) ? "image/heic" : "");
  if (!(rule.types as readonly string[]).includes(type) || file.size === 0 || file.size > rule.max) {
    throw new HttpError(400, `Upload ${rule.label}.`, "bad_file");
  }
  await accountLimit(profileId);
  const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  const [dup] = await sql`select 1 from verifications where evidence_sha256 = ${hash}`;
  if (dup) throw new HttpError(409, "This file was already used for a verification.", "reused");
  await sql`insert into verifications (profile_id, method, status, evidence, evidence_sha256)
    values (${profileId}, ${method}, 'pending', ${sql.json({ size_kb: Math.round(file.size / 1024) })}, ${hash})`;
  await audit(`profile:${profileId}`, "verify.started", profileId, { method });
  return { status: "pending" as const };
}

// ---------------------------------------------------------------- quiz
const shuffle = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; };

export async function startQuiz(profileId: string) {
  const st = await quizState(profileId);
  if (st.passed) throw new HttpError(409, "You already passed the quiz.", "already_passed");
  if (st.attemptsLeft <= 0) throw new HttpError(429, "No quiz attempts left. Use another way to verify.", "no_attempts");
  if (st.retryAt) throw new HttpError(429, "You can retry the quiz 24 hours after your last try.", "retry_later");
  await accountLimit(profileId);
  await sql`update quiz_attempts set status = 'failed', finished_at = now() where profile_id = ${profileId} and status = 'in_progress'`;
  // 5 random questions, spread across categories first.
  const all = shuffle(await sql`select id, category, correct, distractors from quiz_questions where active`);
  if (all.length < QUIZ_LEN) throw new HttpError(503, "The quiz isn't ready yet.");
  const picked: typeof all = [];
  for (const q of all) if (!picked.some((p) => p.category === q.category) && picked.length < QUIZ_LEN) picked.push(q);
  for (const q of all) if (!picked.includes(q) && picked.length < QUIZ_LEN) picked.push(q);
  const options = picked.map((q) => shuffle([q.correct as string, ...(q.distractors as string[]).slice(0, 3)]));
  const [a] = await sql`insert into quiz_attempts (profile_id, question_ids, options)
    values (${profileId}, ${picked.map((q) => q.id as string)}::uuid[], ${sql.json(options)}) returning id`;
  await audit(`profile:${profileId}`, "verify.started", profileId, { method: "quiz" });
  return nextQuestion(profileId, a.id);
}

/** Serves the current question (no answer key) and starts its 20-second timer. */
export async function nextQuestion(profileId: string, attemptId: string) {
  const [a] = await sql`select * from quiz_attempts where id = ${attemptId} and profile_id = ${profileId} and status = 'in_progress'`;
  if (!a) throw new HttpError(404, "Quiz not found. Start again.");
  const i = a.current as number;
  const [q] = await sql`select category, question from quiz_questions where id = ${(a.question_ids as string[])[i]}`;
  await sql`update quiz_attempts set served_at = now() where id = ${attemptId}`;
  return { attemptId, index: i, total: QUIZ_LEN, seconds: QUIZ_SECONDS, category: q.category as string, question: q.question as string, options: (a.options as string[][])[i] };
}

/** Checks one answer server-side. No answer or over time = wrong. Never reveals the right answer. */
export async function answerQuestion(profileId: string, attemptId: string, index: number, choice: string | null) {
  const [a] = await sql`select * from quiz_attempts where id = ${attemptId} and profile_id = ${profileId} and status = 'in_progress' and current = ${index}`;
  if (!a) throw new HttpError(409, "That question was already answered.");
  const [q] = await sql`select correct from quiz_questions where id = ${(a.question_ids as string[])[index]}`;
  const inTime = a.served_at && Date.now() - new Date(a.served_at).getTime() <= (QUIZ_SECONDS + 2) * 1000; // 2s grace for the network
  const right = Boolean(inTime && choice != null && choice === q.correct);
  const correct = (a.correct as number) + (right ? 1 : 0);
  const done = index + 1 >= QUIZ_LEN;
  const status = done ? (correct >= QUIZ_PASS ? "passed" : "failed") : "in_progress";
  const [u] = await sql`update quiz_attempts set current = ${index + 1}, correct = ${correct}, status = ${status},
      finished_at = ${done ? new Date() : null}, served_at = null
    where id = ${attemptId} and current = ${index} returning id`;
  if (!u) throw new HttpError(409, "That question was already answered.");
  if (!done) return { done: false as const, ...(await nextQuestion(profileId, attemptId)) };
  if (status === "passed") {
    await sql`insert into verifications (profile_id, method, status, evidence, decided_at)
      values (${profileId}, 'quiz', 'approved', ${sql.json({ score: `${correct}/${QUIZ_LEN}` })}, now())`;
    await audit(`profile:${profileId}`, "verify.approved", profileId, { method: "quiz" });
  } else {
    await audit(`profile:${profileId}`, "verify.rejected", profileId, { method: "quiz" });
  }
  return { done: true as const, passed: status === "passed", score: correct, total: QUIZ_LEN, quiz: await quizState(profileId) };
}
