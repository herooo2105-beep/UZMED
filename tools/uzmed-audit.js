#!/usr/bin/env node
/**
 * UZMED AUDIT — single-file HTML ilovasi uchun statik tahlil vositasi
 *
 * Ishlatish:
 *   node tools/uzmed-audit.js <UZMED.html> [--json out.json] [--max N]
 *
 * Tashqi bog'liqlik yo'q (faqat Node core: fs, vm).
 * Skanerlar (SKILL 6.1 bo'yicha):
 *   1) struktura  2) sintaksis  3) reference  4) data  5) event/UI
 *   6) async      7) resurs     8) storage    9) security  10) klinik
 *
 * Vosita FAQAT o'qiydi — manba faylni hech qachon o'zgartirmaydi.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');

/* ─────────────────────────── Reyestr ─────────────────────────── */

const LEVELS = ['KRITIK', 'JIDDIY', "O'RTA", 'PAST'];
const findings = [];

function add(level, scanner, joy, msg, extra) {
  findings.push({ level, scanner, joy, msg, extra: extra || null });
}

/* ────────────────────── Fayl va struktura ────────────────────── */

const FILE = process.argv[2];
if (!FILE) {
  console.error("Ishlatish: node tools/uzmed-audit.js <UZMED.html> [--json out.json]");
  process.exit(2);
}
if (!fs.existsSync(FILE)) {
  console.error('Fayl topilmadi: ' + FILE);
  process.exit(2);
}

const html = fs.readFileSync(FILE, 'utf8');
const SIZE_MB = html.length / 1048576;

/**
 * Script bloklarini ketma-ket ajratadi.
 * Har blokdan keyin kursor `</script>` dan keyinga ko'chadi — shu sabab
 * kod ichidagi `<script` satri yoki `<\/script` regexi soxta blok bermaydi.
 */
function extractScripts(src, offset) {
  offset = offset || 0;
  const out = [];
  let pos = 0;
  for (;;) {
    const idx = src.indexOf('<script', pos);
    if (idx < 0) break;
    // HTML izoh ichidagi `<script` so'zi blok emas — izohdan sakrab o'tamiz.
    const cmt = src.lastIndexOf('<!--', idx);
    if (cmt >= 0) {
      const cmtEnd = src.indexOf('-->', cmt);
      if (cmtEnd > idx) { pos = cmtEnd + 3; continue; }
    }
    const tagEnd = src.indexOf('>', idx);
    if (tagEnd < 0) break;
    const close = src.indexOf('</script>', tagEnd);
    if (close < 0) {
      out.push({ attrs: src.slice(idx + 7, tagEnd), body: src.slice(tagEnd + 1), pos: offset + idx, unclosed: true });
      break;
    }
    out.push({
      attrs: src.slice(idx + 7, tagEnd),
      body: src.slice(tagEnd + 1, close),
      pos: offset + idx,
      unclosed: false,
    });
    pos = close + 9;
  }
  return out;
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1] : null;
}

/* ── 1. STRUKTURA SKANERI ── */

const HAS_MANIFEST = html.includes('<script type="__bundler/manifest">');
const HAS_EXTRES = html.includes('<script type="__bundler/ext_resources">');
const TPL_TAG = '<script type="__bundler/template">';
const tplTagAt = html.indexOf(TPL_TAG);

if (!HAS_MANIFEST) add('KRITIK', 'struktura', 'bundler', 'manifest tagi yo`q');
if (!HAS_EXTRES) add('KRITIK', 'struktura', 'bundler', 'ext_resources tagi yo`q');
if (tplTagAt < 0) add('KRITIK', 'struktura', 'bundler', 'template tagi yo`q');

let tpl = '';
let tplStart = -1;
let tplEnd = -1;
if (tplTagAt >= 0) {
  tplStart = tplTagAt + TPL_TAG.length;
  tplEnd = html.indexOf('</script>', tplStart);
  const enc = html.slice(tplStart, tplEnd);
  const rawClose = (enc.match(/<\/script>/g) || []).length;
  if (rawClose > 0) {
    add('KRITIK', 'struktura', 'template', 'encoded template ichida ' + rawClose + ' ta raw </script> — app ochilmaydi');
  }
  try {
    tpl = JSON.parse(enc);
  } catch (err) {
    add('KRITIK', 'struktura', 'template', 'template JSON parse xato: ' + String(err.message).slice(0, 140));
  }
}

const tail = tplEnd >= 0 ? html.slice(tplEnd + 9) : html;
const tailOffset = tplEnd >= 0 ? tplEnd + 9 : 0;

const tailBlocks = extractScripts(tail, tailOffset).map(function (b) {
  b.zone = 'tail';
  b.id = attr(b.attrs, 'id');
  b.type = attr(b.attrs, 'type');
  return b;
});
const innerBlocks = extractScripts(tpl, 0).map(function (b) {
  b.zone = 'inner';
  b.id = attr(b.attrs, 'id');
  b.type = attr(b.attrs, 'type');
  return b;
});
const allBlocks = innerBlocks.concat(tailBlocks);

allBlocks.forEach(function (b) {
  if (b.unclosed) add('KRITIK', 'struktura', b.zone + '/' + (b.id || '?'), 'yopilmagan <script> blok');
});

// Dublikat id
const idCount = Object.create(null);
allBlocks.forEach(function (b) {
  if (b.id) idCount[b.id] = (idCount[b.id] || 0) + 1;
});
Object.keys(idCount).forEach(function (id) {
  if (idCount[id] > 1) add('JIDDIY', 'struktura', 'id', 'dublikat script id: ' + id + ' (' + idCount[id] + ' marta)');
});

// `</body>` pozitsiyasi
const bodyClose = html.lastIndexOf('</body>');
if (bodyClose < 0) {
  add('JIDDIY', 'struktura', 'html', '</body> tagi yo`q');
} else {
  const after = tailBlocks.filter(function (b) { return b.pos > bodyClose; });
  if (after.length) {
    add("O'RTA", 'struktura', 'html', after.length + ' ta script blok </body> dan KEYIN joylashgan');
  }
}

// Muhim markerlar
['MKB_DATA', 'FULL_DRUG_DB', 'DRUG_DATA', 'showScreen', 'uzGemUsageCard', '__uzmedBookReady'].forEach(function (m) {
  if (!html.includes(m)) add('JIDDIY', 'struktura', 'marker', 'marker topilmadi: ' + m);
});

/* ── 2. SINTAKSIS SKANERI ── */

let syntaxTotal = 0;
let syntaxBad = 0;

allBlocks.forEach(function (b, ix) {
  const t = (b.type || '').toLowerCase();
  const label = b.zone + '/' + (b.id || '#' + ix);

  if (t.indexOf('json') >= 0) {
    if (!b.body.trim()) return;
    try {
      JSON.parse(b.body);
    } catch (err) {
      add('KRITIK', 'sintaksis', label, 'JSON parse xato: ' + String(err.message).slice(0, 120));
    }
    return;
  }
  // JS bo'lmagan tiplar (template, bundler) o'tkazib yuboriladi
  if (t && t.indexOf('javascript') < 0 && t !== 'module' && t !== 'text/js') return;
  if (!b.body.trim()) return;

  syntaxTotal++;
  try {
    // Kompilyatsiya — BAJARILMAYDI, faqat sintaksis tekshiriladi
    new vm.Script(b.body, { filename: label });
  } catch (err) {
    syntaxBad++;
    add('KRITIK', 'sintaksis', label, 'SyntaxError: ' + String(err.message).slice(0, 140));
  }
});

/* ── Yordamchi: JS matnini yig'ish ── */

const jsBlocks = allBlocks.filter(function (b) {
  const t = (b.type || '').toLowerCase();
  return !t || t.indexOf('javascript') >= 0 || t === 'module';
});

function eachJs(fn) {
  jsBlocks.forEach(function (b, ix) {
    fn(b.body, b.zone + '/' + (b.id || '#' + ix), b);
  });
}

function countAll(re, src) {
  const m = src.match(re);
  return m ? m.length : 0;
}

/* ── 9. SECURITY SKANERI (birinchi — eng muhim) ── */

/**
 * Kalit patternlari — chegaralar QAT'IY.
 * Base64 bloklar ichida tasodifan `AIza…` uchraydi, shuning uchun kalit
 * uzunligi aniq bo'lishi va atrofida base64 belgisi bo'lmasligi shart.
 */
const SECRET_PATTERNS = [
  { re: /(?<![0-9A-Za-z_\-])AIza[0-9A-Za-z_\-]{35}(?![0-9A-Za-z_\-])/g, nom: 'Google/Gemini API key' },
  { re: /(?<![0-9A-Za-z_\-])gsk_[0-9A-Za-z]{52}(?![0-9A-Za-z_\-])/g, nom: 'Groq API key' },
  { re: /(?<![0-9A-Za-z_\-])sk-(?:proj-)?[0-9A-Za-z_\-]{32,}(?![0-9A-Za-z_\-])/g, nom: 'OpenAI API key' },
  { re: /(?<![0-9A-Za-z_\-])gh[pousr]_[0-9A-Za-z]{36}(?![0-9A-Za-z_\-])/g, nom: 'GitHub token' },
  { re: /(?<![0-9A-Za-z_\-])sk-ant-[0-9A-Za-z_\-]{40,}(?![0-9A-Za-z_\-])/g, nom: 'Anthropic API key' },
  { re: /(?<![0-9A-Za-z_\-])xox[baprs]-[0-9A-Za-z\-]{20,}(?![0-9A-Za-z_\-])/g, nom: 'Slack token' },
];

// Hardcode qilingan parol / token konstantalari
eachJs(function (src, label) {
  const re = /(?:var|let|const)\s+(\w*(?:TOKEN|PASSWORD|SECRET|PASS)\w*)\s*=\s*['"]([^'"]{6,})['"]/gi;
  let m;
  while ((m = re.exec(src))) {
    add('JIDDIY', 'security', label,
      'hardcode qilingan sir: ' + m[1] + ' = "' + m[2].slice(0, 4) + '…" (' + m[2].length + ' belgi)');
  }
});

SECRET_PATTERNS.forEach(function (p) {
  const hits = html.match(p.re);
  if (hits) {
    const uniq = Array.from(new Set(hits));
    add('KRITIK', 'security', 'fayl', p.nom + ' hardcode qilingan: ' + uniq.length + ' ta unikal qiymat',
      uniq.map(function (h) { return h.slice(0, 10) + '…(' + h.length + ' belgi)'; }).join(', '));
  }
});

let evalCount = 0;
let newFuncCount = 0;
let innerHtmlDyn = 0;
const innerHtmlSamples = [];

eachJs(function (src, label) {
  const ev = countAll(/(?:^|[^.\w])eval\s*\(/g, src);
  if (ev) { evalCount += ev; add('JIDDIY', 'security', label, 'eval() ishlatilgan: ' + ev + ' marta'); }

  const nf = countAll(/new\s+Function\s*\(/g, src);
  if (nf) { newFuncCount += nf; add('JIDDIY', 'security', label, 'new Function() ishlatilgan: ' + nf + ' marta'); }

  // innerHTML ga dinamik qiymat: template literal yoki + konkatenatsiya
  const re = /\.innerHTML\s*(?:\+)?=\s*(`[^`]*\$\{|[^;\n]*?\+)/g;
  let m, n = 0;
  while ((m = re.exec(src))) {
    n++;
    if (innerHtmlSamples.length < 8) {
      innerHtmlSamples.push(label + ': ' + src.slice(m.index, m.index + 90).replace(/\s+/g, ' '));
    }
  }
  if (n) { innerHtmlDyn += n; }

  if (/javascript:/.test(src)) add("O'RTA", 'security', label, 'javascript: URL topildi');
  // Kalit oqishi: `Object.keys(`, `.keyCode`, o'zbekcha "keyin" — bular sir emas.
  const leak = /console\.(?:log|warn|info|error)\([^)]{0,160}?\b(apiKey|API_KEY|apikey|accessToken|access_token|authToken|bearer|secret|SECRET)\b/;
  if (leak.test(src)) add('JIDDIY', 'security', label, 'console ga kalit/token chiqarilishi mumkin');
});

if (innerHtmlDyn) {
  add('JIDDIY', 'security', 'global',
    'dinamik innerHTML interpolatsiyasi: ' + innerHtmlDyn + ' joy (XSS xavfi)',
    innerHtmlSamples.join(' | '));
}

/* ── 4. DATA SKANERI ── */

function grabArray(name, src) {
  // `var NAME = [` yoki `window.NAME = [` dan boshlab balanced `]` ni topadi
  const re = new RegExp('(?:var|let|const|window\\.)\\s*' + name + '\\s*=\\s*(\\[|\\{)');
  const m = re.exec(src);
  if (!m) return null;
  const openCh = m[1];
  const closeCh = openCh === '[' ? ']' : '}';
  let i = m.index + m[0].length - 1;
  let depth = 0, inStr = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) return src.slice(m.index + m[0].length - 1, i + 1); }
  }
  return null;
}

const dataStats = {};

function tryEvalLiteral(text) {
  try {
    return vm.runInNewContext('(' + text + ')', Object.create(null), { timeout: 20000 });
  } catch (e) {
    return null;
  }
}

// MKB_DATA
(function scanMkb() {
  let raw = null, label = null;
  for (const b of jsBlocks) {
    raw = grabArray('MKB_DATA', b.body);
    if (raw) { label = b.zone + '/' + (b.id || '?'); break; }
  }
  if (!raw) { add('JIDDIY', 'data', 'MKB_DATA', 'MKB_DATA literal topilmadi'); return; }
  const arr = tryEvalLiteral(raw);
  if (!Array.isArray(arr)) { add('JIDDIY', 'data', 'MKB_DATA', 'MKB_DATA massiv sifatida o`qilmadi'); return; }
  dataStats.MKB_DATA = arr.length;

  /**
   * Rasmiy ICD-10 formatlari:
   *   A00        — 3 belgili kod          A00.0 / A00.05 — subkod
   *   A00-A09    — blok diapazoni         A00-B99        — bob diapazoni
   *   A02.2+ / A02.2* — xanjar(†)/yulduzcha(*) juftlik belgisi
   */
  const codeRe = /^[A-Z]\d{2}(?:\.\d{1,2})?[+*]?$|^[A-Z]\d{2}-[A-Z]\d{2}$/;
  const seen = Object.create(null);
  let badShape = 0, badCode = 0, emptyUz = 0, dup = 0;
  const dupSamples = [], badCodeSamples = [], emptyUzSamples = [];
  arr.forEach(function (row) {
    if (!Array.isArray(row) || row.length < 3) { badShape++; return; }
    const kod = String(row[0] || '').trim();
    const uz = String(row[1] || '').trim();
    if (!codeRe.test(kod)) { badCode++; if (badCodeSamples.length < 6) badCodeSamples.push(kod); }
    if (!uz) { emptyUz++; if (emptyUzSamples.length < 6) emptyUzSamples.push(kod); }
    if (seen[kod]) { dup++; if (dupSamples.length < 8) dupSamples.push(kod); } else seen[kod] = 1;
  });
  if (badShape) add('JIDDIY', 'data', 'MKB_DATA', badShape + ' ta yozuv [kod,uz,ru] formatiga mos emas');
  if (badCode) add("O'RTA", 'data', 'MKB_DATA', badCode + ' ta kod ICD-10 formatiga mos emas', badCodeSamples.join(', '));
  if (emptyUz) add('JIDDIY', 'data', 'MKB_DATA', emptyUz + ' ta yozuvda o`zbekcha nom bo`sh', emptyUzSamples.join(', '));
  if (dup) add("O'RTA", 'data', 'MKB_DATA', dup + ' ta dublikat kod', dupSamples.join(', '));
})();

// FULL_DRUG_DB / DRUG_DATA
function scanDrugDb(name, requiredFields) {
  let raw = null;
  for (const b of jsBlocks) {
    raw = grabArray(name, b.body);
    if (raw) break;
  }
  if (!raw) { add('JIDDIY', 'data', name, name + ' literal topilmadi'); return; }
  const obj = tryEvalLiteral(raw);
  if (!obj || typeof obj !== 'object') { add('JIDDIY', 'data', name, name + ' o`qilmadi'); return; }

  const entries = Array.isArray(obj)
    ? obj.map(function (v, i) { return [String(v && v.name || i), v]; })
    : Object.keys(obj).map(function (k) { return [k, obj[k]]; });
  dataStats[name] = entries.length;

  // Yozuvlar obyekt emas, massiv bo'lsa (masalan narx indeksi
  // [brend, modda, ishlab chiqaruvchi, shakl, valyuta, narx]) —
  // monografiya maydonlari tekshiruvi bu tuzilmaga tegishli emas.
  const sample = entries.length ? entries[0][1] : null;
  if (Array.isArray(sample)) {
    add('PAST', 'data', name,
      name + ' — massiv-yozuvli jadval (' + entries.length + ' qator, ' + sample.length +
      ' ustun); monografiya maydonlari tekshiruvi qo`llanmadi');
    return;
  }

  const missing = Object.create(null);
  const emptyDose = [], noContra = [], noSideFx = [];
  entries.forEach(function (pair) {
    const k = pair[0], v = pair[1];
    if (!v || typeof v !== 'object') { missing.__buzuq = (missing.__buzuq || 0) + 1; return; }
    requiredFields.forEach(function (f) {
      const val = v[f];
      const empty = val === undefined || val === null ||
        (typeof val === 'string' && !val.trim()) ||
        (Array.isArray(val) && !val.length);
      if (empty) {
        missing[f] = (missing[f] || 0) + 1;
        if (f === 'dozalash' && emptyDose.length < 10) emptyDose.push(k);
        if (f === 'qarshi' && noContra.length < 10) noContra.push(k);
        if (f === 'yon' && noSideFx.length < 10) noSideFx.push(k);
      }
    });
  });

  Object.keys(missing).forEach(function (f) {
    const n = missing[f];
    const pct = ((n / entries.length) * 100).toFixed(1);
    // Klinik jihatdan hayotiy maydonlar → JIDDIY
    const critical = f === 'dozalash' || f === 'qarshi';
    let sample = '';
    if (f === 'dozalash') sample = emptyDose.join(', ');
    else if (f === 'qarshi') sample = noContra.join(', ');
    else if (f === 'yon') sample = noSideFx.join(', ');
    add(critical ? 'JIDDIY' : "O'RTA", 'klinik', name,
      '`' + f + '` maydoni bo`sh: ' + n + '/' + entries.length + ' (' + pct + '%)', sample);
  });
}

scanDrugDb('FULL_DRUG_DB', ['name', 'shakl', 'korsatmalar', 'dozalash', 'qarshi', 'yon', 'talsiruvi']);
scanDrugDb('DRUG_DATA', ['name', 'dozalash']);

/* ── 5. EVENT / UI SKANERI ── */

// HTML da mavjud id lar (template + tail markup)
const allIds = new Set();
let idm;
const idRe = /\bid\s*=\s*["']([^"']+)["']/g;
while ((idm = idRe.exec(tpl))) allIds.add(idm[1]);
idRe.lastIndex = 0;
while ((idm = idRe.exec(tail))) allIds.add(idm[1]);
// JS ichida yaratiladigan id lar: el.id = 'x'  /  setAttribute('id','x')
const dynIdRe = /\.id\s*=\s*["']([^"']+)["']|setAttribute\(\s*["']id["']\s*,\s*["']([^"']+)["']/g;
let dm;
while ((dm = dynIdRe.exec(html))) allIds.add(dm[1] || dm[2]);

// Global funksiya deklaratsiyalari
const declared = new Set();
[/function\s+([A-Za-z_$][\w$]*)\s*\(/g,
 /window\.([A-Za-z_$][\w$]*)\s*=/g,
 /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\(|async)/g,
 /\bclass\s+([A-Za-z_$][\w$]*)/g,
 /([A-Za-z_$][\w$]*)\s*:\s*function/g].forEach(function (re) {
  let m;
  while ((m = re.exec(html))) declared.add(m[1]);
});

// Inline handler atributlaridagi funksiyalar
const HANDLERS = 'onclick|onchange|oninput|onsubmit|onblur|onfocus|onkeyup|onkeydown|onkeypress|onload|onerror|ondblclick|onmouseover|onmouseout|onmousedown|onmouseup|ontouchstart|ontouchend';
const inlineRe = new RegExp('\\b(' + HANDLERS + ')\\s*=\\s*"([^"]{1,300})"', 'g');
const missingHandlers = new Map();
let inlineTotal = 0;

function scanInline(src, zone) {
  let m;
  const re = new RegExp(inlineRe.source, 'g');
  while ((m = re.exec(src))) {
    inlineTotal++;
    const code = m[2];
    let c;
    // Faqat ERKIN funksiya chaqiruvlari: `foo(` — `obj.foo(` metod emas.
    const callRe = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    while ((c = callRe.exec(code))) {
      const fn = c[2];
      if (declared.has(fn)) continue;
      if (JS_BUILTINS.has(fn)) continue;
      const key = fn;
      if (!missingHandlers.has(key)) missingHandlers.set(key, { zone: zone, count: 0, sample: code.slice(0, 80) });
      missingHandlers.get(key).count++;
    }
  }
}

const JS_BUILTINS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'delete', 'void',
  'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'Number', 'String', 'Boolean', 'Array',
  'Object', 'JSON', 'Math', 'Date', 'RegExp', 'Error', 'Promise', 'Set', 'Map', 'Symbol', 'BigInt',
  'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
  'fetch', 'console', 'document', 'window', 'navigator', 'localStorage', 'sessionStorage',
  'event', 'this', 'super', 'Function', 'eval', 'structuredClone', 'queueMicrotask',
]);

scanInline(tpl, 'template');
scanInline(tail, 'tail');

if (missingHandlers.size) {
  const rows = Array.from(missingHandlers.entries())
    .sort(function (a, b) { return b[1].count - a[1].count; });
  rows.slice(0, 40).forEach(function (r) {
    add('JIDDIY', 'event/UI', r[1].zone,
      'inline handler `' + r[0] + '()` chaqiradi, lekin funksiya hech qayerda e`lon qilinmagan (' + r[1].count + ' joy)',
      r[1].sample);
  });
  if (rows.length > 40) {
    add('JIDDIY', 'event/UI', 'global', 'yana ' + (rows.length - 40) + ' ta e`lon qilinmagan inline handler funksiyasi');
  }
}

// showScreen / pushScreen nishonlari
const screenTargets = new Map();
let sm;
const screenRe = /\b(?:showScreen|pushScreen)\s*\(\s*['"]([^'"]+)['"]/g;
while ((sm = screenRe.exec(html))) {
  screenTargets.set(sm[1], (screenTargets.get(sm[1]) || 0) + 1);
}
const missingScreens = [];
screenTargets.forEach(function (n, id) {
  if (!allIds.has(id)) missingScreens.push(id + ' (' + n + '×)');
});
if (missingScreens.length) {
  add('JIDDIY', 'event/UI', 'navigatsiya',
    missingScreens.length + ' ta showScreen/pushScreen nishoni DOM da topilmadi',
    missingScreens.slice(0, 20).join(', '));
}

// getElementById nishonlari
const gebiMissing = new Map();
let gm;
const gebiRe = /getElementById\(\s*['"]([A-Za-z][\w\-:.]*)['"]\s*\)/g;
while ((gm = gebiRe.exec(html))) {
  const id = gm[1];
  if (!allIds.has(id)) gebiMissing.set(id, (gebiMissing.get(id) || 0) + 1);
}
if (gebiMissing.size) {
  const rows = Array.from(gebiMissing.entries()).sort(function (a, b) { return b[1] - a[1]; });
  add("O'RTA", 'event/UI', 'selektor',
    gebiMissing.size + ' ta getElementById id si hech qayerda aniqlanmagan (o`lik selektor yoki runtime`da yaratiladi)',
    rows.slice(0, 25).map(function (r) { return r[0] + '(' + r[1] + '×)'; }).join(', '));
}

/* ── 6. ASYNC SKANERI ── */

let fetchTotal = 0, fetchUnguarded = 0;
const fetchSamples = [];
eachJs(function (src, label) {
  const re = /\bfetch\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    fetchTotal++;
    const after = src.slice(m.index, m.index + 900);
    const before = src.slice(Math.max(0, m.index - 700), m.index);
    const hasCatch = /\.catch\s*\(/.test(after);
    const inTry = /\btry\s*\{/.test(before) && (before.lastIndexOf('try') > before.lastIndexOf('}catch') );
    const awaited = /await\s+fetch/.test(src.slice(Math.max(0, m.index - 12), m.index + 6));
    if (!hasCatch && !(awaited && inTry) && !inTry) {
      fetchUnguarded++;
      if (fetchSamples.length < 10) {
        fetchSamples.push(label + ': ' + after.slice(0, 80).replace(/\s+/g, ' '));
      }
    }
  }
});
if (fetchUnguarded) {
  add('JIDDIY', 'async', 'global',
    fetchUnguarded + '/' + fetchTotal + ' ta fetch() xato ushlagichsiz (offline`da unhandled rejection)',
    fetchSamples.join(' | '));
}

// AbortController / timeout
const abortCount = countAll(/new\s+AbortController/g, html);
if (fetchTotal > 0 && abortCount === 0) {
  add("O'RTA", 'async', 'global', fetchTotal + ' ta fetch bor, lekin AbortController umuman ishlatilmagan (timeout yo`q)');
}

/* ── 7. RESURS SKANERI ── */

const setIntervalN = countAll(/\bsetInterval\s*\(/g, html);
const clearIntervalN = countAll(/\bclearInterval\s*\(/g, html);
if (setIntervalN > clearIntervalN) {
  add("O'RTA", 'resurs', 'global',
    'setInterval ' + setIntervalN + ' ta, clearInterval ' + clearIntervalN + ' ta — ' +
    (setIntervalN - clearIntervalN) + ' ta interval to`xtatilmasligi mumkin (memory/CPU leak)');
}

const moN = countAll(/new\s+MutationObserver/g, html);
const discN = countAll(/\.disconnect\s*\(/g, html);
if (moN > discN) {
  add("O'RTA", 'resurs', 'global',
    'MutationObserver ' + moN + ' ta, disconnect() ' + discN + ' ta — ' +
    (moN - discN) + ' ta observer to`xtamaydi');
}

const addL = countAll(/addEventListener\s*\(/g, html);
const remL = countAll(/removeEventListener\s*\(/g, html);
if (addL > 0 && remL / addL < 0.02) {
  add('PAST', 'resurs', 'global',
    'addEventListener ' + addL + ' ta, removeEventListener ' + remL + ' ta — listener cleanup deyarli yo`q');
}

/* ── 8. STORAGE SKANERI ── */

const lsKeys = new Map();
let lm;
const lsRe = /localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g;
while ((lm = lsRe.exec(html))) lsKeys.set(lm[1], (lsKeys.get(lm[1]) || 0) + 1);
dataStats.localStorageKeys = lsKeys.size;

// Himoyasiz JSON.parse(localStorage...)
let unsafeParse = 0;
const unsafeSamples = [];
eachJs(function (src, label) {
  const re = /JSON\.parse\s*\(\s*(?:window\.)?(?:localStorage|sessionStorage)\.getItem\([^)]*\)\s*(?:\|\|[^)]*)?\)/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 400), m.index);
    const inTry = /\btry\s*\{/.test(before) && before.lastIndexOf('try') > before.lastIndexOf('catch');
    const hasFallback = /\|\|/.test(m[0]);
    if (!inTry && !hasFallback) {
      unsafeParse++;
      if (unsafeSamples.length < 8) unsafeSamples.push(label + ': ' + m[0].slice(0, 80));
    }
  }
});
if (unsafeParse) {
  add('JIDDIY', 'storage', 'global',
    unsafeParse + ' ta himoyasiz JSON.parse(localStorage...) — buzilgan yozuv butun blokni yiqitadi',
    unsafeSamples.join(' | '));
}

// Kalit nomlanish nomuvofiqligi (UZMED_ vs uzmed_)
const upper = Array.from(lsKeys.keys()).filter(function (k) { return /^UZMED_/.test(k); });
const lower = Array.from(lsKeys.keys()).filter(function (k) { return /^uzmed_/.test(k); });
if (upper.length && lower.length) {
  add('PAST', 'storage', 'nomlanish',
    'localStorage kalitlarida ikki xil uslub: UZMED_* (' + upper.length + ') va uzmed_* (' + lower.length + ')');
}

/* ── 3. REFERENCE SKANERI (window.X chaqiruvlari) ── */

const windowAssigned = new Set();
let wm;
const waRe = /window\.([A-Za-z_$][\w$]*)\s*=/g;
while ((wm = waRe.exec(html))) windowAssigned.add(wm[1]);

// Brauzerning standart window metodlari — e'lon talab qilinmaydi
const WINDOW_BUILTINS = new Set([
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'matchMedia', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'open', 'close', 'print',
  'alert', 'confirm', 'prompt', 'scrollTo', 'scrollBy', 'focus', 'blur', 'btoa', 'atob',
  'postMessage', 'queueMicrotask', 'structuredClone', 'encodeURIComponent', 'decodeURIComponent',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'stop', 'getSelection',
]);

const windowCalled = new Map();
const wcRe = /window\.([A-Za-z_$][\w$]*)\s*\(/g;
while ((wm = wcRe.exec(html))) {
  const n = wm[1];
  if (WINDOW_BUILTINS.has(n)) continue;
  if (!windowAssigned.has(n) && !declared.has(n)) {
    windowCalled.set(n, (windowCalled.get(n) || 0) + 1);
  }
}
if (windowCalled.size) {
  const rows = Array.from(windowCalled.entries()).sort(function (a, b) { return b[1] - a[1]; });
  add("O'RTA", 'reference', 'global',
    windowCalled.size + ' ta window.X() chaqiruvi hech qayerda tayinlanmagan',
    rows.slice(0, 25).map(function (r) { return 'window.' + r[0] + '(' + r[1] + '×)'; }).join(', '));
}

/* ── 10. PWA / OFFLINE / TARMOQ ── */

const externalHosts = new Map();
const urlRe = /https?:\/\/([a-z0-9.\-]+)/gi;
let um;
while ((um = urlRe.exec(html))) {
  const h = um[1].toLowerCase();
  externalHosts.set(h, (externalHosts.get(h) || 0) + 1);
}
const LOCALHOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
LOCALHOSTS.forEach(function (h) {
  if (externalHosts.has(h)) {
    add('JIDDIY', 'tarmoq', 'global',
      h + ' manzili kodda qolgan (' + externalHosts.get(h) + ' joy) — production/APK da ishlamaydi');
  }
});
/**
 * http:// manzillari ikki xil bo'ladi:
 *   • IDENTIFIKATOR — XML namespace, HL7/ATC terminologiya URI si. Hech qachon
 *     yuklanmaydi, shuning uchun xavfsizlik muammosi emas.
 *   • YUKLANADIGAN resurs — fetch()/src=/href= ichida. Mixed content bloklanadi.
 * Faqat ikkinchisi xato deb belgilanadi.
 */
const NAMESPACE_HOSTS = /^(www\.)?(w3\.org|hl7\.org|terminology\.hl7\.org|whocc\.no|www\.whocc\.no|nlm\.nih\.gov|fdasis\.nlm\.nih\.gov|purl\.org|xmlns\.com|schema\.org|dicom\.nema\.org)$/i;
const fetched = new Map();
const fetchedRe = /(?:fetch\(\s*['"`]|\bsrc\s*=\s*['"]|\bhref\s*=\s*['"]|url\s*[:=]\s*['"])(http:\/\/[^'"`\s>]+)/gi;
let fm;
while ((fm = fetchedRe.exec(html))) {
  const host = fm[1].replace(/^http:\/\//i, '').split(/[/:?#]/)[0];
  if (NAMESPACE_HOSTS.test(host)) continue;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(host)) continue; // alohida hisobot
  fetched.set(fm[1], (fetched.get(fm[1]) || 0) + 1);
}
if (fetched.size) {
  add('JIDDIY', 'security', 'tarmoq',
    'shifrlanmagan http:// resurs yuklanadi: ' + fetched.size + ' manzil (mixed content bloklanadi)',
    Array.from(fetched.keys()).slice(0, 10).join(', '));
}

/* ─────────────────────────── Hisobot ─────────────────────────── */

findings.sort(function (a, b) { return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level); });

const byLevel = { KRITIK: 0, JIDDIY: 0, "O'RTA": 0, PAST: 0 };
findings.forEach(function (f) { byLevel[f.level]++; });

const maxArg = process.argv.indexOf('--max');
const MAX = maxArg > 0 ? parseInt(process.argv[maxArg + 1], 10) : 200;

console.log('━━━ UZMED AUDIT ━━━');
console.log('Fayl:            ' + FILE);
console.log('Hajm:            ' + SIZE_MB.toFixed(2) + ' MB (' + html.length + ' belgi)');
console.log('Template:        ' + (tpl ? (tpl.length / 1048576).toFixed(2) + ' MB (JSON ✅)' : 'O`QILMADI ❌'));
console.log('Inner bloklar:   ' + innerBlocks.length);
console.log('Tail bloklar:    ' + tailBlocks.length);
console.log('Sintaksis skan:  ' + syntaxTotal + ' blok / ' + syntaxBad + ' xato');
console.log('Data:            ' + JSON.stringify(dataStats));
console.log('');
console.log('XATOLAR: ' + findings.length +
  '  (KRITIK ' + byLevel.KRITIK + ' / JIDDIY ' + byLevel.JIDDIY +
  " / O'RTA " + byLevel["O'RTA"] + ' / PAST ' + byLevel.PAST + ')');
console.log('');

findings.slice(0, MAX).forEach(function (f, ix) {
  console.log((ix + 1) + '. [' + f.level + '] (' + f.scanner + ') ' + f.joy + ': ' + f.msg);
  if (f.extra) console.log('     → ' + String(f.extra).slice(0, 400));
});
if (findings.length > MAX) console.log('… yana ' + (findings.length - MAX) + ' ta');

const jsonArg = process.argv.indexOf('--json');
if (jsonArg > 0 && process.argv[jsonArg + 1]) {
  fs.writeFileSync(process.argv[jsonArg + 1], JSON.stringify({
    file: FILE,
    sizeMB: +SIZE_MB.toFixed(2),
    templateMB: tpl ? +(tpl.length / 1048576).toFixed(2) : null,
    innerBlocks: innerBlocks.length,
    tailBlocks: tailBlocks.length,
    syntax: { total: syntaxTotal, bad: syntaxBad },
    dataStats: dataStats,
    byLevel: byLevel,
    findings: findings,
  }, null, 2));
  console.log('\nJSON yozildi: ' + process.argv[jsonArg + 1]);
}

process.exitCode = byLevel.KRITIK > 0 ? 1 : 0;
