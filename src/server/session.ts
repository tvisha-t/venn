import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession, verifySession, type Session } from "./crypto";
import { HttpError } from "./http";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Please sign in with GT.");
  return s;
}

export async function setSession(s: { userId: string; profileId: string }) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 86400,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
