// LinkedIn "Get a copy of your data" import (the member's OWN export).
// Only an allowlist of files is ever decompressed: Profile, Positions, Education, Skills.
// Connections, messages, email addresses, phone numbers, invitations etc. contain other
// people's data or private contact data and are never opened.
import { unzipSync } from "fflate";
import Papa from "papaparse";
import { GT_CONFIG } from "./seed";
import { findCity } from "./geo";
import { scrubResume, type Extracted } from "./resume";

export const LINKEDIN_ALLOWED = ["Profile.csv", "Positions.csv", "Education.csv", "Skills.csv"] as const;
type Allowed = (typeof LINKEDIN_ALLOWED)[number];

export class LinkedInExportError extends Error {}

const baseName = (p: string) => p.split("/").pop() ?? p;

/** Unzip only allowlisted CSVs. Returns their text by file name. */
export function readLinkedInZip(buf: Uint8Array): Partial<Record<Allowed, string>> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, {
      filter: (f) => (LINKEDIN_ALLOWED as readonly string[]).includes(baseName(f.name)) && f.originalSize < 5 * 1024 * 1024,
    });
  } catch {
    throw new LinkedInExportError("That doesn't look like a LinkedIn data export (.zip).");
  }
  const out: Partial<Record<Allowed, string>> = {};
  const dec = new TextDecoder();
  for (const [name, data] of Object.entries(files)) out[baseName(name) as Allowed] = dec.decode(data);
  if (!out["Profile.csv"] && !out["Positions.csv"] && !out["Education.csv"]) {
    throw new LinkedInExportError("We couldn't find Profile, Positions or Education in that file. Download your LinkedIn data and upload the .zip.");
  }
  return out;
}

function rows(csv: string | undefined): Record<string, string>[] {
  if (!csv) return [];
  // LinkedIn exports sometimes start with "Notes:" lines before the header.
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const start = lines.findIndex((l) => /,/.test(l) && !/^notes:/i.test(l));
  const res = Papa.parse<Record<string, string>>(lines.slice(Math.max(0, start)).join("\n"), { header: true, skipEmptyLines: true });
  return res.data;
}

const get = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(r).find((x) => x.trim().toLowerCase() === k.toLowerCase());
    if (hit && r[hit]?.trim()) return r[hit].trim();
  }
  return "";
};

/** "Jan 2019", "2019-01", "2019" → 2019 */
const year = (s: string) => { const m = s.match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; };

const STATES: Record<string, string> = {
  georgia: "GA", california: "CA", "new york": "NY", texas: "TX", washington: "WA", illinois: "IL", massachusetts: "MA",
  colorado: "CO", "north carolina": "NC", florida: "FL", virginia: "VA", "district of columbia": "DC", pennsylvania: "PA", oregon: "OR",
};

const INDUSTRY_MAP: [RegExp, string][] = [
  [/financ|bank|payment|fintech|insur/i, "Fintech"],
  [/aero|aviation|airline|defense|space/i, "Aerospace"],
  [/health|medic|pharma|biotech|hospital/i, "Healthcare & Biotech"],
  [/logistic|retail|supply|transport|e-?commerce/i, "Logistics & Retail"],
  [/consult/i, "Consulting"],
  [/energy|climate|utilit|renewable|oil|solar/i, "Energy & Climate"],
  [/research|higher education|academ|university/i, "Research & Academia"],
  [/venture|capital|startup/i, "Venture & Startups"],
  [/architect|design|construction|civil/i, "Architecture & Design"],
  [/software|internet|computer|it services|technology|information/i, "Software"],
];

function degreeShort(d: string): string | null {
  if (/ph\.?\s?d|doctor/i.test(d)) return "PhD";
  if (/master|m\.?s\.?\b|mba|m\.eng/i.test(d)) return /mba/i.test(d) ? "MBA" : "MS";
  if (/bachelor|b\.?s\.?\b|b\.?a\.?\b|b\.eng/i.test(d)) return "BS";
  return d ? d.slice(0, 20) : null;
}

const isGT = (school: string) => /georgia (institute of technology|tech)\b|\bgatech\b/i.test(school);

/** Map a LinkedIn export to the same editable shape the PDF/resume importer produces. */
export function extractFromLinkedIn(files: Partial<Record<Allowed, string>>, majors: string[], now = new Date()): Extracted {
  const profile = rows(files["Profile.csv"])[0] ?? {};
  const positions = rows(files["Positions.csv"]);
  const education = rows(files["Education.csv"]);
  const skills = rows(files["Skills.csv"]).map((r) => get(r, "Name")).filter(Boolean);
  const thisYear = now.getFullYear();

  // Current role: open-ended position, else the most recent start.
  const sorted = [...positions].sort((a, b) => (year(get(b, "Started On")) ?? 0) - (year(get(a, "Started On")) ?? 0));
  const current = sorted.find((p) => !get(p, "Finished On")) ?? sorted[0];

  const gtEdu = education.filter((e) => isGT(get(e, "School Name")));
  const gtLatest = [...gtEdu].sort((a, b) => (year(get(b, "End Date")) ?? 0) - (year(get(a, "End Date")) ?? 0))[0];
  const classYear = gtLatest ? year(get(gtLatest, "End Date")) : null;
  const eduText = gtEdu.map((e) => `${get(e, "Degree Name")} ${get(e, "Notes")} ${get(e, "Activities")}`).join(" ");
  const major = majors.find((m) => eduText.toLowerCase().includes(m.toLowerCase())) ?? null;

  const programText = `${eduText} ${positions.map((p) => `${get(p, "Company Name")} ${get(p, "Title")} ${get(p, "Description")}`).join(" ")}`;
  const gtPrograms = GT_CONFIG.programs.filter((p) => programText.toLowerCase().includes(p.toLowerCase()) || (p === "Co-op" && /\bco-?op\b/i.test(programText)));
  const activities = gtEdu.flatMap((e) => get(e, "Activities").split(/[,;]|\band\b/).map((x) => x.trim())).filter((x) => x.length > 2 && x.length < 60).slice(0, 6);

  const geo = get(profile, "Geo Location", "Location");
  const [cityRaw, stateRaw] = geo.split(",").map((x) => x.trim());
  const city = findCity(cityRaw)?.city ?? (cityRaw || null);
  const state = stateRaw ? (STATES[stateRaw.toLowerCase()] ?? (stateRaw.length <= 3 ? stateRaw : null)) : findCity(cityRaw)?.state ?? null;

  const industryRaw = `${get(profile, "Industry")} ${current ? get(current, "Company Name") : ""}`;
  const industry = INDUSTRY_MAP.find(([re]) => re.test(industryRaw))?.[1] ?? null;

  const studentNow = gtLatest != null && (classYear == null || classYear >= thisYear) && !(current && !/intern/i.test(get(current, "Title")) && classYear != null && classYear < thisYear);
  const roles: Extracted["roles"] = gtEdu.length === 0 ? ["alum"] : studentNow ? ["student"] : ["alum"];
  const isStudent = roles.includes("student");

  const employer = !isStudent && current ? get(current, "Company Name") || null : null;
  const jobTitle = !isStudent && current ? get(current, "Title") || null : null;

  const rawSummary = scrubResume(get(profile, "Summary") || get(profile, "Headline"));
  const sentences = rawSummary.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((x) => !/\[(email|phone|link|address)\]/.test(x));
  let summary = sentences.slice(0, 2).join(" ").split(/\s+/).slice(0, 45).join(" ").trim();
  if (summary.length < 10) {
    summary = isStudent
      ? `${major ?? "Georgia Tech"} student${classYear ? ` graduating in ${classYear}` : ""}${gtPrograms.length ? `, involved in ${gtPrograms.slice(0, 2).join(" and ")}` : ""}.`
      : `${jobTitle ?? "Professional"}${employer ? ` at ${employer}` : ""}${major ? `; studied ${major} at Georgia Tech` : ""}.`;
  }

  return {
    roles,
    classYear,
    degree: gtLatest ? degreeShort(get(gtLatest, "Degree Name")) : null,
    major,
    gtPrograms,
    csThreads: GT_CONFIG.csThreads.filter((t) => eduText.includes(t)),
    activities,
    industry,
    employer,
    jobTitle,
    city,
    state,
    summary,
    openTo: isStudent ? ["being hired"] : ["giving career advice"],
    interests: skills.slice(0, 5),
    source: "linkedin_export",
  };
}
