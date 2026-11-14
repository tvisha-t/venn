// Thin wrapper over the Claude API for structured JSON calls.
// - Every call has a hard timeout; callers fall back to rule-based logic on any error.
// - Payloads are recorded (in memory) so the privacy tests can assert no contact data is ever sent.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../env";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey, maxRetries: 1 });
  return client;
}

export function llmEnabled() {
  return Boolean(env.anthropicKey) && process.env.VENN_DISABLE_LLM !== "1";
}

/** Recent LLM payloads (system + user text), for privacy tests and debugging. */
export const llmPayloadLog: string[] = [];
function record(s: string) {
  llmPayloadLog.push(s);
  if (llmPayloadLog.length > 50) llmPayloadLog.shift();
}

export class LlmUnavailable extends Error {}

export async function llmJson<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  user: string;
  timeoutMs?: number;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<S>> {
  record(`${opts.system}\n---\n${opts.user}`);
  if (!llmEnabled()) throw new LlmUnavailable("ANTHROPIC_API_KEY not set");

  const res = await getClient().beta.messages.parse(
    {
      model: env.anthropicModel,
      max_tokens: opts.maxTokens ?? 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if a safety classifier declines, the API retries on a fallback model
      output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    },
    { timeout: opts.timeoutMs ?? 20_000 },
  );
  if (res.stop_reason === "refusal") throw new LlmUnavailable("model declined");
  if (res.stop_reason === "max_tokens") throw new LlmUnavailable("output truncated");
  if (res.parsed_output == null) throw new LlmUnavailable("unparseable output");
  return res.parsed_output as z.infer<S>;
}

/** Wrap untrusted text as data so instructions inside profiles can't steer the model. */
export function asData(tag: string, value: unknown): string {
  const json = JSON.stringify(value, null, 0).replace(/<\/?[a-z_]+>/gi, "");
  return `<${tag}>\n${json}\n</${tag}>`;
}
