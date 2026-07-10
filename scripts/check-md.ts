#!/usr/bin/env bun
/**
 * check-md.ts — enforces "every tracked .md has a rule".
 *
 * Walks git-tracked .md files, parses the `appliesTo` glob column
 * from .agents/RULES.md, and fails on any path outside the explicit
 * allowlist that is not matched by a rule's glob.
 *
 * Pure Bun + hand-rolled glob matching; no markdown library.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..');
const RULES_PATH = resolve(REPO_ROOT, '.agents/RULES.md');

const ALLOWLIST = new Set<string>([
  'AGENTS.md',
  '.agents/RULES.md',
  '.vscode/settings.json',
  '.vscode/extensions.json',
]);

interface Rule {
  glob: string;
  re: RegExp;
}

function globToRegExp(glob: string): RegExp {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '{') {
      const close = glob.indexOf('}', i);
      if (close === -1) {
        out += '\\{';
      } else {
        const inner = glob.slice(i + 1, close);
        out += '(?:' + inner.split(',').map((s) => s.trim()).join('|') + ')';
        i = close;
      }
    } else if (ch === '<') {
      const close = glob.indexOf('>', i);
      if (close === -1) {
        out += '\\<';
      } else {
        out += '[^/]+';
        i = close;
      }
    } else if ('.+^$()|[]\\'.includes(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  out += '$';
  return new RegExp(out);
}

function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  const inTable = { value: false };
  const lines = text.split('\n');
  for (const line of lines) {
    if (/^##\s+Rules\s+index/.test(line)) {
      inTable.value = true;
      continue;
    }
    if (inTable.value && /^##\s+/.test(line)) break;
    if (!inTable.value) continue;
    if (!line.startsWith('|')) continue;
    if (/^\|\s*-/.test(line)) continue;
    const cols = line
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (cols.length < 2) continue;
    const glob = cols[0]!.replace(/`/g, '').trim();
    if (!glob) continue;
    rules.push({ glob, re: globToRegExp(glob) });
  }
  return rules;
}

function listTrackedMd(): string[] {
  const r = spawnSync('git', ['ls-files', '--', '*.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) {
    console.error('git ls-files failed:', r.stderr);
    process.exit(2);
  }
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => p.replaceAll('\\', '/'));
}

function isAllowlisted(path: string): boolean {
  if (ALLOWLIST.has(path)) return true;
  if (path.startsWith('.agents/rules/') && path.endsWith('.md.rule')) return true;
  if (path.startsWith('.agents/skills/') && path.endsWith('/SKILL.md')) return true;
  return false;
}

async function main(): Promise<number> {
  const rulesText = await Bun.file(RULES_PATH).text();
  const rules = parseRules(rulesText);
  const paths = listTrackedMd();
  const violations: string[] = [];

  for (const path of paths) {
    if (isAllowlisted(path)) continue;
    const matched = rules.some((r) => r.re.test(path));
    if (!matched) {
      violations.push(path);
    }
  }

  if (violations.length > 0) {
    console.error(`\ncheck-md: ${violations.length} .md file(s) without a rule:\n`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      `\nFix: add a rule to .agents/rules/<file>.md.rule and a row to .agents/RULES.md.`,
      `See .agents/skills/maintaining-agents-dir/SKILL.md.`,
    );
    return 1;
  }

  console.log(`check-md: OK (${paths.length} .md files matched)`);
  return 0;
}

process.exit(await main());