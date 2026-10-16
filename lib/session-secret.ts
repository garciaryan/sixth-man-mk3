// Session secret: SESSION_SECRET from the environment, else made once on the data volume and reused, so sessions
// survive restarts and deploys. Server-side only (runs at boot).
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Env = Record<string, string | undefined>;

export function ensureSessionSecret(env: Env, dataDir: string): "env" | "file" {
  if (env.SESSION_SECRET?.trim()) return "env";
  const file = path.join(dataDir, "session-secret");
  mkdirSync(dataDir, { recursive: true });
  try {
    writeFileSync(file, randomBytes(32).toString("base64"), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  // Never quietly make a new one: that would sign everyone out with no explanation.
  const secret = readFileSync(file, "utf8").trim();
  if (!secret) throw new Error(`${file} is empty; delete it to make a new one (this signs everyone out).`);
  env.SESSION_SECRET = secret;
  return "file";
}
