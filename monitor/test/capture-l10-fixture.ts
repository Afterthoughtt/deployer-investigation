import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { REPO_ROOT } from "../src/paths.js";
import { getTransaction } from "../src/helius/rpc.js";

dotenv.config({ path: resolve(REPO_ROOT, ".env") });

const L10_FUNDING_SIG =
  "4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu";

const apiKey = process.env.HELIUS_API_KEY;
if (!apiKey) {
  console.error("HELIUS_API_KEY not set");
  process.exit(1);
}

const tx = await getTransaction(apiKey, L10_FUNDING_SIG);
if (!tx) {
  console.error("getTransaction returned null for L10 funding sig");
  process.exit(1);
}

const outPath = resolve(
  "/Users/error/Desktop/investigation/monitor/test/fixtures/l10-rpc.json",
);
writeFileSync(outPath, JSON.stringify(tx, null, 2));
console.log(`wrote ${outPath}`);
