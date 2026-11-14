import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { viewerIsAlum } from "@/server/roles";

// Alumni-only area (see src/lib/roles.ts). Students are sent home before anything renders;
// the APIs behind these pages also return 403 for students.
export default async function AlumniOnlyLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s || !(await viewerIsAlum(s.profileId))) redirect("/home");
  return <>{children}</>;
}
