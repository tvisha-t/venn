import { env } from "./env";
import { HttpError } from "./http";
/** Dev-only tools (sandbox inbox, time travel) exist only in EMAIL_MODE=sandbox. */
export function requireSandbox() {
  if (env.emailMode !== "sandbox") throw new HttpError(404, "Not found");
}
