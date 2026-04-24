import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

type FindingKind = 'ellipsis' | 'wildcard' | 'short-backticked-primitive-like';

interface Finding {
  file: string;
  line: number;
  column: number;
  kind: FindingKind;
  match: string;
}

function usage(): void {
  console.error('Usage: tsx src/audit/primitive-integrity-scan.ts <file> [file...]');
  console.error('');
  console.error('Scans investigation writeups for shortened, wildcarded, or ellipsized on-chain primitives.');
  console.error('Run on new reports, handoffs, review artifacts, and docs before treating them as evidence.');
}

function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak };
}

function hasMixedPrimitiveShape(value: string): boolean {
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /[1-9]/.test(value);
  const humanWord = /^[A-Z]?[a-z]+(?:[A-Z][a-z]+)*$/.test(value);
  const codeIdentifier = /^[a-z]+(?:[A-Z][a-z]+)+$/.test(value);
  return hasDigit || (hasLower && hasUpper && !humanWord && !codeIdentifier);
}

function collectMatches(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const patterns: Array<{ kind: FindingKind; regex: RegExp }> = [
    {
      kind: 'ellipsis',
      regex: /[1-9A-HJ-NP-Za-km-z]{3,}(?:\.\.\.|…)[1-9A-HJ-NP-Za-km-z]*/g,
    },
    {
      kind: 'ellipsis',
      regex: /[1-9A-HJ-NP-Za-km-z]*(?:\.\.\.|…)[1-9A-HJ-NP-Za-km-z]{3,}/g,
    },
    {
      kind: 'wildcard',
      // Negative lookahead skips markdown bold close (`**`); single trailing `*` is still flagged.
      regex: /[1-9A-HJ-NP-Za-km-z]{2,}\*(?!\*)/g,
    },
    {
      kind: 'short-backticked-primitive-like',
      regex: /`([1-9A-HJ-NP-Za-km-z]{8,31})`/g,
    },
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const raw = match[0] ?? '';
      const value = match[1] ?? raw.replaceAll('`', '');
      if (pattern.kind === 'short-backticked-primitive-like' && !hasMixedPrimitiveShape(value)) {
        continue;
      }
      const { line, column } = lineColumn(text, match.index ?? 0);
      findings.push({ file, line, column, kind: pattern.kind, match: raw });
    }
  }

  findings.sort((a, b) => a.line - b.line || a.column - b.column || a.kind.localeCompare(b.kind));
  return findings;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const allFindings: Finding[] = [];
let hadMissingFile = false;

for (const arg of args) {
  const file = resolve(arg);
  if (!existsSync(file)) {
    console.error(`primitive-integrity: missing file: ${arg}`);
    hadMissingFile = true;
    continue;
  }
  const text = readFileSync(file, 'utf8');
  allFindings.push(...collectMatches(arg, text));
}

if (allFindings.length > 0) {
  console.error('PRIMITIVE INTEGRITY SCAN FAILED');
  console.error('Do not publish shortened, wildcarded, ellipsized, or memory-reconstructed primitives.');
  for (const finding of allFindings) {
    console.error(
      `${finding.file}:${finding.line}:${finding.column} ${finding.kind} ${JSON.stringify(finding.match)}`,
    );
  }
  process.exit(1);
}

if (hadMissingFile) {
  process.exit(1);
}

console.log(`PRIMITIVE INTEGRITY SCAN PASSED (${args.length} file${args.length === 1 ? '' : 's'})`);
