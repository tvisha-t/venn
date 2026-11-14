import { redirect } from "next/navigation";
import { getSession } from "@/server/session";

export default async function Root() {
  const s = await getSession();
  redirect(s ? "/home" : "/signin");
}
