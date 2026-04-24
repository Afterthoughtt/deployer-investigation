import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export type ClaimFindingKind =
  | 'absolute-negative-claim'
  | 'known-registry-wallet-missing-verdict'
  | 'known-registry-wallet-verdict-conflict';

export interface ClaimFinding {
  file: string;
  line: number;
  column: number;
  kind: ClaimFindingKind;
  match: string;
  detail: string;
}

interface RegistryRecord {
  address: string;
  verdict: string | null;
  role: string | null;
  label: string | null;
}

const absoluteNegativePatterns: RegExp[] = [
  /\bnone\b[^.\n]*(?:related|linked|network|deployer|control|counterpart(?:y|ies)|infrastructure|activity)\b/gi,
  /\bno\s+(?:recent\s+)?activity\b/gi,
  /\bno\s+counterpart(?:y|ies)\b/gi,
  /\bno\s+(?:new\s+)?(?:network\s+)?infrastructure\b/gi,
  /\bnot\s+(?:related|linked|network|deployer[- ]?controlled|deployer[- ]?related)\b/gi,
  /\bnothing\s+(?:found|at all)\b/gi,
];

const allowedScopeQualifiers = [
  /not revalidated/i,
  /not checked/i,
  /not evaluated/i,
  /not observed in/i,
  /not established from/i,
  /bounded/i,
  /sample/i,
  /window/i,
  /latest/i,
  /parsed/i,
  /partial/i,
  /incomplete/i,
  /provider-limited/i,
  /not enough evidence/i,
  /needs? further review/i,
  /requires? further review/i,
];

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

function lineTextAt(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', offset) + 1;
  const endIndex = text.indexOf('\n', offset);
  const end = endIndex === -1 ? text.length : endIndex;
  return text.slice(start, end);
}

function isScopedLine(line: string): boolean {
  if (/broad negative claims/i.test(line)) return true;
  return allowedScopeQualifiers.some((qualifier) => qualifier.test(line));
}

export function collectTextClaimFindings(file: string, text: string): ClaimFinding[] {
  const findings: ClaimFinding[] = [];

  for (const pattern of absoluteNegativePatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[0] ?? '';
      const index = match.index ?? 0;
      const line = lineTextAt(text, index);
      if (isScopedLine(line)) continue;
      const pos = lineColumn(text, index);
      findings.push({
        file,
        line: pos.line,
        column: pos.column,
        kind: 'absolute-negative-claim',
        match: raw,
        detail: 'Broad negative relationship/activity claims need an explicit evidence scope or must be rewritten as not checked/not revalidated.',
      });
    }
  }

  return findings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function walkObjects(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const child of Object.values(value)) walkObjects(child, visit);
}

export function collectRegistryRecords(networkMap: unknown): Map<string, RegistryRecord> {
  const records = new Map<string, RegistryRecord>();
  walkObjects(networkMap, (record) => {
    if (typeof record.address !== 'string') return;
    records.set(record.address, {
      address: record.address,
      verdict: typeof record.verdict === 'string' ? record.verdict : null,
      role: typeof record.role === 'string' ? record.role : null,
      label: typeof record.label === 'string' ? record.label : null,
    });
  });
  return records;
}

function shouldEnforceRegistryReconciliation(json: unknown): boolean {
  if (!isRecord(json)) return false;
  const metadata = json.metadata;
  if (!isRecord(metadata)) return false;
  const type = metadata.artifact_type;
  if (typeof type !== 'string') return false;
  return /investigation|classification|classifications|wallet_review_summary/.test(type);
}

function isClassifiedWalletObject(record: Record<string, unknown>): boolean {
  if (typeof record.address !== 'string') return false;
  return [
    'control_confidence',
    'operational_usefulness',
    'registry_verdict',
    'registry_role',
  ].some((key) => key in record);
}

function objectLineForAddress(text: string, address: string): { line: number; column: number } {
  const quoted = `"address": "${address}"`;
  const index = text.indexOf(quoted);
  return lineColumn(text, index === -1 ? 0 : index);
}

export function collectRegistryClaimFindings(
  file: string,
  text: string,
  json: unknown,
  registry: Map<string, RegistryRecord>,
): ClaimFinding[] {
  if (!shouldEnforceRegistryReconciliation(json)) return [];

  const findings: ClaimFinding[] = [];
  walkObjects(json, (record) => {
    if (!isClassifiedWalletObject(record)) return;
    const address = record.address as string;
    const registryRecord = registry.get(address);
    if (!registryRecord) return;

    const registryVerdict = typeof record.registry_verdict === 'string' ? record.registry_verdict : null;
    const proposedChange = record.proposed_registry_change === true;
    const pos = objectLineForAddress(text, address);

    if (!registryVerdict) {
      findings.push({
        file,
        line: pos.line,
        column: pos.column,
        kind: 'known-registry-wallet-missing-verdict',
        match: address,
        detail: `Classified wallet exists in network-map; carry registry_verdict=${JSON.stringify(registryRecord.verdict)} before assigning conclusions.`,
      });
      return;
    }

    if (registryRecord.verdict && registryVerdict !== registryRecord.verdict && !proposedChange) {
      findings.push({
        file,
        line: pos.line,
        column: pos.column,
        kind: 'known-registry-wallet-verdict-conflict',
        match: address,
        detail: `Artifact registry_verdict=${JSON.stringify(registryVerdict)} conflicts with network-map verdict=${JSON.stringify(registryRecord.verdict)} without proposed_registry_change=true.`,
      });
    }
  });

  return findings;
}

export function readJsonIfPossible(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function loadRegistry(cwd = process.cwd()): Map<string, RegistryRecord> {
  const path = resolve(cwd, 'data/network-map.json');
  if (!existsSync(path)) return new Map();
  return collectRegistryRecords(JSON.parse(readFileSync(path, 'utf8')));
}

export function collectClaimFindings(file: string, text: string, registry: Map<string, RegistryRecord>): ClaimFinding[] {
  const findings = collectTextClaimFindings(file, text);
  const json = readJsonIfPossible(text);
  if (json) findings.push(...collectRegistryClaimFindings(file, text, json, registry));
  findings.sort((a, b) => a.line - b.line || a.column - b.column || a.kind.localeCompare(b.kind));
  return findings;
}
