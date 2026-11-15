// Run work after the HTTP response is sent (Vercel keeps the function alive until it finishes), so
// the user isn't left waiting on slow I/O like sending email. Outside a request (scripts, tests) it
// just runs inline.
import { after } from "next/server";

export async function afterResponse(label: string, fn: () => Promise<unknown>) {
  const run = () => fn().catch((e) => console.warn(`[${label}]`, (e as Error).message));
  try {
    after(run);
  } catch {
    await run(); // not inside a request (e.g. unit tests)
  }
}
