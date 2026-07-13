#!/usr/bin/env node
//
// Multi-repo CodeHealth rollup — an org/portfolio dashboard backend. Reads each
// repo's `codehealth-stamp.json` (written by codehealth-report.mjs) and emits a
// single "worst first" Markdown table (Repo · Grade · Score · Top hotspot · Doc% ·
// Security) plus a `portfolio-stamp.json` aggregate (mean score, count by grade,
// the per-repo list). Repo-agnostic: point it at repo paths, or a config file. A
// missing/unreadable stamp is skipped with a warning line, never a crash — so one
// un-instrumented repo doesn't sink the whole rollup.
//
//   node portfolio-report.mjs <repoPathA> <repoPathB> ...
//   node portfolio-report.mjs --config portfolio.config.json
//
// portfolio.config.json is an array of { name, path } (stamp resolved under the
// repo's historyDir) or { name, stampPath } (an explicit stamp file).
//
import fs from 'node:fs';
import path from 'node:path';

const OUT_STAMP = 'portfolio-stamp.json';
const argv = process.argv.slice(2);

// ── Resolve the list of { name, ... } repo entries from args or a config file ──
let entries = [];
const cfgIdx = argv.indexOf('--config');
if (cfgIdx >= 0) {
  const cfgPath = argv[cfgIdx + 1];
  if (!cfgPath || !fs.existsSync(cfgPath)) { console.error(`portfolio: --config file not found: ${cfgPath}`); process.exit(1); }
  try { entries = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
  catch (e) { console.error(`portfolio: could not parse ${cfgPath} (${e.message})`); process.exit(1); }
  if (!Array.isArray(entries)) { console.error('portfolio: config must be a JSON array of { name, path } | { name, stampPath }'); process.exit(1); }
} else {
  const paths = argv.filter((a) => !a.startsWith('--'));
  if (!paths.length) { console.error('usage: portfolio-report.mjs <repoPathA> <repoPathB> ...  |  --config portfolio.config.json'); process.exit(1); }
  entries = paths.map((p) => ({ name: path.basename(path.resolve(p)), path: p }));
}

// Each repo may set its own historyDir in code-health.config.json (default 'code-health').
function historyDirFor(repoPath) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(repoPath, 'code-health.config.json'), 'utf8'));
    if (cfg.historyDir) return cfg.historyDir;
  } catch { /* default below */ }
  return 'code-health';
}
function resolveStamp(entry) {
  if (entry.stampPath) return entry.stampPath;
  if (entry.path) return path.join(entry.path, historyDirFor(entry.path), 'codehealth-stamp.json');
  return null;
}

// "A · 92.5 / 100" → { grade: 'A', score: 92.5 }
function parseBadge(badge) {
  const m = String(badge || '').match(/([A-F])\s*·\s*([\d.]+)/);
  return m ? { grade: m[1], score: Number(m[2]) } : { grade: '?', score: null };
}

const rows = [];
for (const entry of entries) {
  const name = entry.name || (entry.path ? path.basename(path.resolve(entry.path)) : '(unnamed)');
  const stampPath = resolveStamp(entry);
  if (!stampPath || !fs.existsSync(stampPath)) { console.warn(`⚠ ${name}: no stamp at ${stampPath || '(unresolved)'} — skipping`); continue; }
  let s;
  try { s = JSON.parse(fs.readFileSync(stampPath, 'utf8')); }
  catch (e) { console.warn(`⚠ ${name}: unreadable stamp ${stampPath} (${e.message}) — skipping`); continue; }
  const { grade, score } = parseBadge(s.badge);
  rows.push({
    name, grade, score,
    top_hotspot: s.top_hotspot || '—',
    doc_pct: s.doc_pct != null ? `${s.doc_pct}%` : '—',
    security: s.security != null ? String(s.security) : '—',
  });
}

if (!rows.length) { console.error('portfolio: no readable stamps — nothing to report'); process.exit(0); }

// Worst first (ascending score; nulls last).
rows.sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));

const md = [];
md.push('| Repo | Grade | Score | Top hotspot | Doc% | Security |');
md.push('|---|:--:|--:|---|--:|--:|');
for (const r of rows) {
  md.push(`| ${r.name} | ${r.grade} | ${r.score != null ? r.score : '—'} | ${r.top_hotspot} | ${r.doc_pct} | ${r.security} |`);
}
const table = md.join('\n');
console.log(`\n${table}\n`);

const scored = rows.filter((r) => r.score != null);
const meanScore = scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 10) / 10 : null;
const byGrade = {};
for (const r of rows) byGrade[r.grade] = (byGrade[r.grade] || 0) + 1;

const aggregate = {
  generated: new Date().toISOString().slice(0, 10),
  repos: rows.length,
  mean_score: meanScore,
  by_grade: byGrade,
  table,
  list: rows,
};
fs.writeFileSync(OUT_STAMP, JSON.stringify(aggregate, null, 2) + '\n');
console.log(`portfolio: ${rows.length} repos · mean score ${meanScore ?? 'n/a'} · grades ${Object.entries(byGrade).map(([g, n]) => `${g}:${n}`).join(' ')}`);
console.log(`wrote aggregate → ${OUT_STAMP}`);
