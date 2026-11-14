import { redirect } from "next/navigation";
import { getSession } from "@/server/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSession())) redirect("/signin");
  return <AppShell>{children}</AppShell>;
}
