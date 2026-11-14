import { NextResponse } from "next/server";
import { identityProvider } from "@/server/identity";
import { route, throttle } from "@/server/http";

export const GET = route(async (req: Request) => {
  throttle(req, "auth");
  return NextResponse.json({ identities: await identityProvider.listIdentities() });
});
