import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const MONITOR_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(MONITOR_ROOT, "..");

export function resolveFromMonitor(p: string): string {
  return isAbsolute(p) ? p : resolve(MONITOR_ROOT, p);
}
