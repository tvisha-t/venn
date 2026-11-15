import "dotenv/config"; import postgres from "postgres"; (async () => {
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const p = await sql`select id, status, user_id, summary_approved from profiles where id='9d53a2f7-e148-4853-8c8f-0a0289ff79ec'`;
const i = await sql`select id, status, relay_token, created_at from intro_requests where recipient_profile_id='9d53a2f7-e148-4853-8c8f-0a0289ff79ec'`;
const u = await sql`select id, auth_subject from users where auth_subject like 'mock|new-%'`;
console.log(JSON.stringify({ p, i, u }, null, 1));
})();
