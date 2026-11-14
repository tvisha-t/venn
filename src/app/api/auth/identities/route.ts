import { NextResponse } from "next/server";
import { identityProvider } from "@/server/identity";
import { HttpError, route, throttle } from "@/server/http";
import { env } from "@/server/env";

export const GET = route(async (req: Request) => {
  throttle(req, "auth");
  if (!env.demoLogin) throw new HttpError(404, "Not found");
  return NextResponse.json({ identities: await identityProvider.listIdentities() });
});
