#!/usr/bin/env node
// Keeps the translations up to date (docs/i18n.md). Finds every message of the game:
//   - tr('...'), tc('context', '...'), msg('...'), noun('...'), phrase('...') in src/ (the text in
//     the call, a literal),
//   - the elements marked data-t in index.html (their content and the attributes they name),
//   - the texts of the data tables (src/i18n/sources.js: item names, enemy kinds ...),
// and checks each language's catalog (src/i18n/<code>/) against them:
//   missing     a message without a translation (English shows in its place)
//   unused      a translation of a message that is gone (often: the English changed; the tool
//               names the likely new message)
//   broken      a translation that does not parse, or uses parameters, forms or markup the
//               English does not have
//   twice       a message in two parts of a catalog
//   glossary    a term of src/i18n/glossary.js translated otherwise than the glossary says
//
//   node tools/i18n.mjs              the problems, with where each message is used
//   node tools/i18n.mjs --todo de    the missing German messages as a ready-to-fill block
//   node tools/i18n.mjs --list       every message, with where it is used
// npm test runs the check (tests/i18n.test.js): every message has every translation.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => relative(ROOT, p);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// a JS string literal's value ('...', "...", `...` without ${})
function unquote(lit) {
  if (lit[0] === '`' && lit.includes('${')) return null;
  return Function(`"use strict"; return (${lit});`)();
}
const LITERAL = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`';
const CALL = new RegExp(String.raw`(?<![\w.$])(tr|msg|noun|phrase|tc)\(\s*(${LITERAL})(?:\s*,\s*(${LITERAL}))?`, 'g');

// { [message]: [where ...] }
export async function collect() {
  const found = new Map();
  const add = (text, where) => {
    if (!text) return;
    if (!found.has(text)) found.set(text, []);
    found.get(text).push(where);
  };
  // the code
  for (const file of walk(join(ROOT, 'src'))) {
    if (/src[\\/]i18n[\\/](?!sources\.js)/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(CALL)) {
      const line = src.slice(0, m.index).split('\n').length, where = `${rel(file)}:${line}`;
      const before = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index);
      if (/^\s*(\/\/|\*)|\s\/\/\s/.test(before)) continue;   // in a comment
      const first = unquote(m[2]);
      if (first == null) { add(`\u0000${m[2]}`, where); continue; }   // a template with ${}: an error
      if (m[1] === 'tc') { const second = m[3] && unquote(m[3]); if (second != null) add(`${first}|${second}`, where); }
      else add(first, where);
    }
  }
  // the page
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<(\w+)((?:[^>"]|"[^"]*")*?\sdata-t(?=[\s=>])(?:="([^"]*)")?(?:[^>"]|"[^"]*")*)>/g)) {
    const [, tag, attrs, what = ''] = m, line = html.slice(0, m.index).split('\n').length, where = `index.html:${line}`;
    const parts = what.split(/\s+/).filter(Boolean);
    if (!parts.length || parts.includes('text')) {
      const start = m.index + m[0].length, end = html.indexOf(`</${tag}>`, start);
      add(html.slice(start, end).replace(/\s+/g, ' ').trim(), where);
    }
    for (const a of parts.filter(p => p !== 'text')) {
      const v = new RegExp(`\\s${a}="([^"]*)"`).exec(attrs);
      if (v) add(v[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'), where);
    }
  }
  // the data tables
  const { sources } = await import(pathToFileURL(join(ROOT, 'src/i18n/sources.js')));
  for (const [where, texts] of Object.entries(sources())) for (const t of texts) add(t, where);
  return found;
}

const tags = s => [...String(s).matchAll(/<\/?([a-z0-9]+)/gi)].map(m => m[0].toLowerCase()).sort().join(' ');
// how alike two texts are (0..1): shared words
function alike(a, b) {
  const wa = new Set(a.toLowerCase().match(/\w+/g) ?? []), wb = new Set(b.toLowerCase().match(/\w+/g) ?? []);
  let same = 0;
  for (const w of wa) if (wb.has(w)) same++;
  return same / Math.max(1, Math.max(wa.size, wb.size));
}

// every problem: [{ kind, lang?, text, where?, detail? }]
export async function check() {
  const i18n = await import(pathToFileURL(join(ROOT, 'src/i18n/i18n.js')));
  const en = await import(pathToFileURL(join(ROOT, 'src/i18n/en.js')));
  const { GLOSSARY } = await import(pathToFileURL(join(ROOT, 'src/i18n/glossary.js')));
  const found = await collect(), problems = [];
  for (const [text, where] of found) {
    if (text.startsWith('\u0000')) { problems.push({ kind: 'broken', text: text.slice(1), where, detail: 'a message must be a plain string, without ${}: pass the values as parameters' }); continue; }
    try { i18n.parse(text); } catch (e) { problems.push({ kind: 'broken', text, where, detail: e.message }); }
  }
  const englishForms = new Set(en.grammar.forms);
  const formsOf = text => {
    const out = [];
    const walk = nodes => { for (const n of nodes) if (typeof n === 'object') { if (n.form) out.push(n.form); if (n.options) Object.values(n.options).forEach(walk); } };
    try { walk(i18n.parse(text)); } catch { /* reported */ }
    return out;
  };
  const known = (forms, f) => forms.has(f) || forms.has(f[0].toLowerCase() + f.slice(1));
  for (const [text, where] of found) for (const f of formsOf(text)) if (!known(englishForms, f)) problems.push({ kind: 'broken', text, where, detail: `no English form "${f}"` });

  for (const { code } of i18n.LANGUAGES.filter(l => l.code !== i18n.SOURCE)) {
    const mod = await import(pathToFileURL(join(ROOT, `src/i18n/${code}/index.js`)));
    const messages = mod.default.messages, forms = new Set(mod.default.grammar.forms);
    const seen = new Map();
    for (const [part, table] of Object.entries(mod.parts ?? {})) for (const k of Object.keys(table)) {
      if (seen.has(k)) problems.push({ kind: 'twice', lang: code, text: k, detail: `in ${seen.get(k)} and ${part}` });
      else seen.set(k, part);
    }
    const unused = Object.keys(messages).filter(k => !found.has(k));
    for (const [text, where] of found) {
      if (text.startsWith('\u0000')) continue;
      const e = messages[text];
      if (e == null) {
        const like = unused.map(u => [u, alike(text, u)]).filter(([, a]) => a >= 0.5).sort((a, b) => b[1] - a[1])[0];
        problems.push({ kind: 'missing', lang: code, text, where, ...(like && { detail: `was it: ${JSON.stringify(like[0])}?` }) });
        continue;
      }
      const t = typeof e === 'string' ? e : e.text;
      if (typeof t !== 'string') { problems.push({ kind: 'broken', lang: code, text, where, detail: 'no text' }); continue; }
      let ok = true;
      try { i18n.parse(t); } catch (err) { ok = false; problems.push({ kind: 'broken', lang: code, text, where, detail: err.message }); }
      if (!ok) continue;
      let source;
      try { source = i18n.paramsOf(text); } catch { continue; }
      const params = i18n.paramsOf(t);
      for (const p of params) if (!source.has(p)) problems.push({ kind: 'broken', lang: code, text, where, detail: `parameter {${p}} is not in the English` });
      for (const p of source) if (!params.has(p)) problems.push({ kind: 'broken', lang: code, text, where, detail: `parameter {${p}} is left out` });
      for (const f of formsOf(t)) if (!known(forms, f)) problems.push({ kind: 'broken', lang: code, text, where, detail: `no ${code} form "${f}"` });
      if (tags(t) !== tags(text)) problems.push({ kind: 'broken', lang: code, text, where, detail: `markup differs: ${tags(text)} / ${tags(t)}` });
      if (typeof e === 'object' && e.g && !['m', 'f', 'n', 'pl'].includes(e.g)) problems.push({ kind: 'broken', lang: code, text, where, detail: `gender "${e.g}"` });
    }
    for (const text of unused) {
      const like = [...found.keys()].filter(k => !messages[k]).map(k => [k, alike(text, k)]).filter(([, a]) => a >= 0.5).sort((a, b) => b[1] - a[1])[0];
      problems.push({ kind: 'unused', lang: code, text, ...(like && { detail: `now: ${JSON.stringify(like[0])}?` }) });
    }
    // the item name words line up with the English (core/gear/names.js)
    if (mod.default.names) {
      const words = await import(pathToFileURL(join(ROOT, 'src/core/gear/names.js')));
      for (const [list, english] of Object.entries(words.WORDS)) {
        const theirs = mod.default.names.words?.[list];
        if (!Array.isArray(theirs) || theirs.length !== english.length)
          problems.push({ kind: 'broken', lang: code, text: `names.words.${list}`, detail: `${theirs?.length ?? 0} words, English has ${english.length}` });
      }
    }
    // the glossary's terms are translated as it says
    for (const term of GLOSSARY) {
      const want = term[code];
      if (want == null || !term.en) continue;
      const e = messages[term.en];
      if (e == null) { if (!found.has(term.en)) continue; }
      const got = typeof e === 'string' ? e : e?.text;
      if (e != null && got !== want) problems.push({ kind: 'glossary', lang: code, text: term.en, detail: `the glossary says "${want}", the catalog "${got}"` });
      if (e && typeof e === 'object' && term.g && e.g !== term.g) problems.push({ kind: 'glossary', lang: code, text: term.en, detail: `the glossary says gender ${term.g}, the catalog ${e.g}` });
    }
  }
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const [text, where] of await collect()) console.log(`${JSON.stringify(text)}  ${where.join(' ')}`);
    return;
  }
  const todo = args.indexOf('--todo');
  const problems = await check();
  if (todo >= 0) {
    const code = args[todo + 1] ?? 'de';
    const missing = problems.filter(p => p.kind === 'missing' && p.lang === code);
    const byFile = new Map();
    for (const p of missing) {
      const f = p.where[0].replace(/:\d+$/, '');
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f).push(p);
    }
    for (const [f, ps] of byFile) {
      console.log(`  // ${f}`);
      for (const p of ps) console.log(`  ${JSON.stringify(p.text)}: '',${p.detail ? `   // ${p.detail}` : ''}`);
    }
    return;
  }
  if (!problems.length) { console.log('All messages are translated.'); return; }
  const kinds = ['broken', 'twice', 'glossary', 'missing', 'unused'];
  for (const kind of kinds) {
    const ps = problems.filter(p => p.kind === kind);
    if (!ps.length) continue;
    console.log(`\n${kind} (${ps.length}):`);
    for (const p of ps.slice(0, args.includes('--all') ? Infinity : 60))
      console.log(`  ${p.lang ? `[${p.lang}] ` : ''}${JSON.stringify(p.text)}${p.where ? `  ${p.where.slice(0, 3).join(' ')}` : ''}${p.detail ? `\n      ${p.detail}` : ''}`);
    if (ps.length > 60 && !args.includes('--all')) console.log(`  ... and ${ps.length - 60} more (--all)`);
  }
  process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
