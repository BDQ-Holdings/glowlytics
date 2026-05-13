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

for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
