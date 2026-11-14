import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { updateOwnProfile } from "@/server/profiles";
import { audit } from "@/server/audit";
import { rerunStandingGoals } from "@/server/agent/orchestrator";
import { clearVocabCache } from "@/server/agent/vocab";

const S = (n: number) => z.string().trim().max(n).nullable().transform((v) => (v === "" ? null : v));
const Body = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  roles: z.array(z.enum(["student", "alum", "faculty", "staff", "lifetime_learner"])).min(1),
  classYear: z.number().int().min(1940).max(2040).nullable(),
  degree: S(40), major: S(100), industry: S(60), employer: S(100), jobTitle: S(100), city: S(60), state: S(40),
  gtPrograms: z.array(z.string().max(60)).max(20),
  csThreads: z.array(z.string().max(60)).max(10),
  activities: z.array(z.string().max(60)).max(20),
  summary: z.string().trim().min(10).max(600),
  openTo: z.array(z.string().max(60)).max(10),
  interests: z.array(z.string().max(40)).max(15),
});

// Nothing goes public until this is called with the user's reviewed fields.
export const POST = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  const b = Body.parse(await req.json());
  const summary = b.summary.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "").replace(/\+?\d[\d\s().-]{8,}\d/g, "");
  const profile = await updateOwnProfile(s.profileId, { ...b, summary, country: "US" }, { approve: true });
  await audit(`user:${s.userId}`, "profile.approve", s.profileId);
  clearVocabCache();
  // A new or newly-claimed member may match someone's standing goal (§7.5).
  rerunStandingGoals().catch((e) => console.warn("[standing]", e));
  return NextResponse.json({ profile });
});
