import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { collectClaimFindings, loadRegistry } from './claim-integrity.js';

function usage(): void {
  console.error('Usage: tsx src/audit/claim-integrity-scan.ts <file> [file...]');
  console.error('');
  console.error('Scans investigation writeups for broad negative relationship claims and registry downshift risk.');
  console.error('Run on new reports, handoffs, review artifacts, and proposed registry patches before trusting them.');
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const registry = loadRegistry();
const allFindings = [];
let hadMissingFile = false;

for (const arg of args) {
  const file = resolve(arg);
  if (!existsSync(file)) {
    console.error(`claim-integrity: missing file: ${arg}`);
    hadMissingFile = true;
    continue;
  }

  const text = readFileSync(file, 'utf8');
  allFindings.push(...collectClaimFindings(arg, text, registry));
}

if (allFindings.length > 0) {
  console.error('CLAIM INTEGRITY SCAN FAILED');
  console.error('Do not publish broad negative relationship claims or classify known registry wallets without registry reconciliation.');
  for (const finding of allFindings) {
    console.error(
      `${finding.file}:${finding.line}:${finding.column} ${finding.kind} ${JSON.stringify(finding.match)} — ${finding.detail}`,
    );
  }
  process.exit(1);
}

if (hadMissingFile) {
  process.exit(1);
}

console.log(`CLAIM INTEGRITY SCAN PASSED (${args.length} file${args.length === 1 ? '' : 's'})`);
