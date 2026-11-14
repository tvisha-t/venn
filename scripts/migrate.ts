import "dotenv/config";
import { sql } from "../src/server/db";
import { migrate } from "../src/server/seed";

migrate()
  .then(() => console.log("✓ migrations applied"))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());
