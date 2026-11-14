import postgres from "postgres";
import { env } from "./env";

// Single shared connection pool (survives Next.js dev hot reloads).
const g = globalThis as unknown as { __vennSql?: postgres.Sql };

export const sql: postgres.Sql =
  g.__vennSql ??
  postgres(env.databaseUrl, {
    prepare: false, // required for Supabase transaction pooler
    max: 5,
    // Serverless: functions freeze between requests, so pooled sockets can go stale.
    // Drop idle connections quickly, recycle old ones, and never wait forever to connect.
    idle_timeout: process.env.VERCEL ? 5 : 20,
    max_lifetime: 60 * 5,
    connect_timeout: 10,
    onnotice: () => {},
    types: {
      // return numeric as JS number (lat/lng/score)
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });

if (process.env.NODE_ENV !== "production") g.__vennSql = sql;

export type Sql = postgres.Sql | postgres.TransactionSql;
