// The ONE place that decides who sees alumni-only areas. Nav, page guards and API guards all read this,
// so a future alumni-only tab is one line here. Role comes from the member's own profile (graduation
// year or their choice in the profile builder), never from their email address.
export const ALUMNI_ONLY_ROUTES = ["/events", "/groups"] as const;

export function isAlum(p: { roles: string[] } | null | undefined): boolean {
  return Boolean(p?.roles?.includes("alum"));
}

export function isAlumniOnlyPath(path: string): boolean {
  return ALUMNI_ONLY_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}
