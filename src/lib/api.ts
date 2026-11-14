"use client";
// Client-side fetch helpers + shared response types.

export type PublicProfile = {
  id: string; status: "claimed" | "unclaimed"; source: string; firstName: string; lastName: string; roles: string[];
  classYear: number | null; degree: string | null; major: string | null; gtPrograms: string[]; csThreads: string[];
  activities: string[]; industry: string | null; employer: string | null; jobTitle: string | null; city: string | null;
  state: string | null; country: string | null; summary: string | null; openTo: string[]; interests: string[]; acceptingIntros: boolean;
};
export type OwnProfile = PublicProfile & { summaryApproved: boolean };
export type Match = { profile: PublicProfile; score: number; reason: string; rank: number; isNew?: boolean };
export type IntroStatus = "draft" | "sent" | "replied" | "not_interested" | "no_response" | "bounced" | "suppressed";
export type SharedContact = { preferredEmail: string | null; phone: string | null; linkedinUrl: string | null; websiteUrl: string | null };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    window.location.href = "/signin";
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong.", (data as { code?: string }).code);
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const ROLE_LABEL: Record<string, string> = {
  student: "Student", alum: "Alum", faculty: "Faculty", staff: "Staff", lifetime_learner: "Lifetime learner",
};

export function roleLine(p: Pick<PublicProfile, "jobTitle" | "employer" | "roles" | "major">) {
  if (p.jobTitle && p.employer) return `${p.jobTitle} @ ${p.employer}`;
  if (p.employer) return `Role not listed @ ${p.employer}`;
  if (p.roles.includes("student")) return `${p.major ?? "GT"} student`;
  return "Role not listed";
}

export function classTag(p: Pick<PublicProfile, "classYear">) {
  return p.classYear ? `'${String(p.classYear).slice(2)}` : "";
}
