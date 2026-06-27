import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidatePaths = [
  path.resolve(__dirname, "../../../../.env.local"),
  path.resolve(__dirname, "../../../../.env"),
  path.resolve(__dirname, "../../../../../../.env.local"),
  path.resolve(__dirname, "../../../../../../.env"),
  path.resolve(__dirname, "../../../../../glowlytics/backend/.env.local"),
  path.resolve(__dirname, "../../../../../glowlytics/backend/.env"),
];

// Earlier candidates win. For SEO engine the on-disk .env is the source of
// truth (cron jobs have no shell to override); we honor file values over any
// pre-existing process.env, including those leaked from an interactive shell.
const seenKeys = new Set<string>();
for (const envPath of candidatePaths) {
  if (!fs.existsSync(envPath)) continue;
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (seenKeys.has(key)) continue;
    process.env[key] = value;
    seenKeys.add(key);
  }
}
