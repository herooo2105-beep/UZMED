#!/usr/bin/env node
/**
 * UZMED PRESERVATION CHECK — hech narsa yo'qolmaganini ISBOTLAYDI.
 *
 *   node tools/uzmed-preservation.js snapshot <UZMED.html> <chiqish.json>
 *   node tools/uzmed-preservation.js compare  <asl.json> <yangi.json>
 *
 * `snapshot` ilovani brauzerda ochib, quyidagilarning to'liq ro'yxatini oladi:
 *   • barcha global funksiyalar va obyektlar (window kalitlari + turi)
 *   • ma'lumot bazalari va ULARNING HAR BIR KALITI (dori, protokol, MKB, KB)
 *   • API konfiguratsiyasi: endpointlar, model nomlari, AI rejimlari, proxy
 *   • localStorage kalitlari
 *   • DOM element id lari va ekranlar
 *
 * `compare` ikki snapshotni solishtiradi va FAQAT YO'QOLGANNI xato deb biladi.
 * Qo'shilgan narsa xato emas (tuzatishlar additive bo'lishi kerak).
 *
 * Bitta element yo'qolsa — exit code 1. Bu tuzatishlar uchun qabul darvozasi.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MODE = process.argv[2];

/* ───────────────────────── SNAPSHOT ───────────────────────── */

async function snapshot(file, out) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();

  await page.goto('file://' + path.resolve(file), { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(14000); // retry-mount modullari uchun

  const snap = await page.evaluate(function () {
    /* ── 1. Global kalitlar ── */
    const globals = {};
    for (const k in window) {
      let t;
      try { t = typeof window[k]; } catch (e) { t = 'himoyalangan'; }
      if (t === 'function') globals[k] = 'function';
      else if (t === 'object' && window[k] !== null) {
        let n = 0;
        try { n = Array.isArray(window[k]) ? window[k].length : Object.keys(window[k]).length; }
        catch (e) { n = -1; }
        globals[k] = 'object:' + n;
      } else globals[k] = t;
    }

    /* ── 2. Ma'lumot bazalari — HAR BIR KALIT ── */
    function keysOf(name) {
      const v = window[name];
      if (!v || typeof v !== 'object') return null;
      try { return Array.isArray(v) ? v.length : Object.keys(v).sort(); }
      catch (e) { return null; }
    }
    const DB_NAMES = [
      'FULL_DRUG_DB', 'PROTOCOL_DB', 'DRUG_DATA', 'MKB_DATA', 'MKB_SECTIONS',
      'DISEASE_PROTOCOLS', 'UZMED_BOOKS_KB', 'DRUG_GROUPS', 'UZMED_DDI',
      'UZMED_DDI_PRO', 'UZMED_CALC_PLUS', 'UZMED_ATC', 'UZMED_PEDREF',
    ];
    const databases = {};
    DB_NAMES.forEach(function (n) {
      const k = keysOf(n);
      if (k !== null) databases[n] = k;
    });

    /* ── 3. Dori bazasining har bir yozuvi va maydonlari ── */
    const drugFields = {};
    if (window.FULL_DRUG_DB) {
      Object.keys(window.FULL_DRUG_DB).forEach(function (k) {
        const r = window.FULL_DRUG_DB[k];
        if (r && typeof r === 'object') {
          drugFields[k] = Object.keys(r).sort().join(',');
        }
      });
    }

    /* ── 4. Kalkulyatorlar ── */
    let calculators = null;
    try {
      if (window.UZMED_CALC_PLUS && window.UZMED_CALC_PLUS.list) {
        calculators = window.UZMED_CALC_PLUS.list().map(function (c) { return c.id; }).sort();
      }
    } catch (e) { /* mavjud emas */ }

    /* ── 5. API konfiguratsiyasi ── */
    const api = {};
    ['UZMED_AI_MODE', 'UZMED_GEMINI_KEY', 'UZMED_AI_ENDPOINT', 'UZMED_PROXY',
      'UZMED_CF_PROXY', 'UZMED_MODEL', 'UZMED_AI_PROVIDER'].forEach(function (k) {
      if (k in window) { try { api[k] = typeof window[k]; } catch (e) { api[k] = '?'; } }
    });
    // AI bilan bog'liq barcha global funksiyalar
    api._aiFunctions = [];
    for (const k in window) {
      if (/^(uzmedAi|switchAi|askAi|aiSend|sendAi)|Ai(Fetch|Send|Ask)|gemini|Gemini/.test(k)) {
        let t; try { t = typeof window[k]; } catch (e) { t = '?'; }
        api._aiFunctions.push(k + ':' + t);
      }
    }
    api._aiFunctions.sort();

    /* ── 6. localStorage kalitlari ── */
    const ls = [];
    try { for (let i = 0; i < localStorage.length; i++) ls.push(localStorage.key(i)); } catch (e) { /* bloklangan */ }

    /* ── 7. DOM: id lar va ekranlar ── */
    const ids = Array.from(document.querySelectorAll('[id]')).map(function (e) { return e.id; }).sort();
    const screens = Array.from(document.querySelectorAll('[id$="-screen"]')).map(function (e) { return e.id; }).sort();

    /* ── 8. Script bloklari ── */
    const blocks = Array.from(document.querySelectorAll('script[id]')).map(function (s) { return s.id; }).sort();

    return {
      globals: globals,
      databases: databases,
      drugFields: drugFields,
      calculators: calculators,
      api: api,
      localStorageKeys: ls.sort(),
      domIds: ids,
      screens: screens,
      scriptBlocks: blocks,
      domNodeCount: document.getElementsByTagName('*').length,
    };
  });

  await browser.close();
  fs.writeFileSync(out, JSON.stringify(snap, null, 2));

  console.log('━━━ SNAPSHOT ━━━');
  console.log('Fayl:              ' + file);
  console.log('Global kalitlar:   ' + Object.keys(snap.globals).length);
  console.log('  — funksiyalar:   ' + Object.values(snap.globals).filter(function (v) { return v === 'function'; }).length);
  console.log('Ma`lumot bazalari: ' + Object.keys(snap.databases).length);
  Object.keys(snap.databases).forEach(function (n) {
    const v = snap.databases[n];
    console.log('  — ' + n.padEnd(20) + (typeof v === 'number' ? v + ' element' : v.length + ' kalit'));
  });
  console.log('Dori yozuvlari:    ' + Object.keys(snap.drugFields).length);
  console.log('Kalkulyatorlar:    ' + (snap.calculators ? snap.calculators.length : 'yo`q'));
  console.log('AI funksiyalari:   ' + snap.api._aiFunctions.length);
  console.log('localStorage:      ' + snap.localStorageKeys.length);
  console.log('DOM id lari:       ' + snap.domIds.length);
  console.log('Ekranlar:          ' + snap.screens.length);
  console.log('Script bloklari:   ' + snap.scriptBlocks.length);
  console.log('\nYozildi: ' + out);
}

/* ───────────────────────── COMPARE ───────────────────────── */

function compare(aFile, bFile) {
  const A = JSON.parse(fs.readFileSync(aFile, 'utf8'));
  const B = JSON.parse(fs.readFileSync(bFile, 'utf8'));

  const losses = [];
  const gains = [];

  function cmpList(nom, a, b) {
    if (a === null || a === undefined) return;
    if (typeof a === 'number') {
      if (typeof b !== 'number') { losses.push(nom + ': butunlay yo`qoldi'); return; }
      if (b < a) losses.push(nom + ': ' + a + ' → ' + b + ' (' + (a - b) + ' element YO`QOLDI)');
      else if (b > a) gains.push(nom + ': ' + a + ' → ' + b + ' (+' + (b - a) + ')');
      return;
    }
    const sb = new Set(b || []);
    const yoq = a.filter(function (x) { return !sb.has(x); });
    const sa = new Set(a);
    const yangi = (b || []).filter(function (x) { return !sa.has(x); });
    if (yoq.length) losses.push(nom + ': ' + yoq.length + ' ta YO`QOLDI → ' + yoq.slice(0, 12).join(', ') + (yoq.length > 12 ? ' …' : ''));
    if (yangi.length) gains.push(nom + ': +' + yangi.length + ' ta yangi');
  }

  function cmpMap(nom, a, b, qiymatHam) {
    const yoq = [], ozgargan = [];
    Object.keys(a || {}).forEach(function (k) {
      if (!(k in (b || {}))) yoq.push(k);
      else if (qiymatHam && a[k] !== b[k]) ozgargan.push(k + ' (' + a[k] + ' → ' + b[k] + ')');
    });
    const yangi = Object.keys(b || {}).filter(function (k) { return !(k in (a || {})); });
    if (yoq.length) losses.push(nom + ': ' + yoq.length + ' ta YO`QOLDI → ' + yoq.slice(0, 12).join(', ') + (yoq.length > 12 ? ' …' : ''));
    if (ozgargan.length) losses.push(nom + ': ' + ozgargan.length + ' ta O`ZGARDI → ' + ozgargan.slice(0, 8).join('; '));
    if (yangi.length) gains.push(nom + ': +' + yangi.length + ' ta yangi');
  }

  cmpMap('Global kalitlar', A.globals, B.globals, false);
  Object.keys(A.databases || {}).forEach(function (n) {
    cmpList('DB ' + n, A.databases[n], (B.databases || {})[n]);
  });
  const dbYoq = Object.keys(A.databases || {}).filter(function (n) { return !(n in (B.databases || {})); });
  if (dbYoq.length) losses.push('Butun baza YO`QOLDI: ' + dbYoq.join(', '));

  cmpMap('Dori yozuvi maydonlari', A.drugFields, B.drugFields, true);
  cmpList('Kalkulyatorlar', A.calculators, B.calculators);
  cmpList('AI funksiyalari', A.api._aiFunctions, B.api._aiFunctions);
  cmpMap('API konfiguratsiyasi', omit(A.api), omit(B.api), true);
  cmpList('localStorage kalitlari', A.localStorageKeys, B.localStorageKeys);
  cmpList('DOM id lari', A.domIds, B.domIds);
  cmpList('Ekranlar', A.screens, B.screens);
  cmpList('Script bloklari', A.scriptBlocks, B.scriptBlocks);

  function omit(o) {
    const r = {};
    Object.keys(o || {}).forEach(function (k) { if (k !== '_aiFunctions') r[k] = o[k]; });
    return r;
  }

  console.log('━━━ SAQLANISH TEKSHIRUVI ━━━');
  console.log('Asl:   ' + aFile);
  console.log('Yangi: ' + bFile);
  console.log('');

  if (!losses.length) {
    console.log('✅ HECH NARSA YO`QOLMADI');
    console.log('   Barcha funksiyalar, ma`lumot yozuvlari, API sozlamalari,');
    console.log('   localStorage kalitlari, DOM id lari va ekranlar joyida.');
  } else {
    console.log('❌ YO`QOTISH ANIQLANDI: ' + losses.length + ' ta');
    losses.forEach(function (l, i) { console.log('  ' + (i + 1) + '. ' + l); });
  }

  if (gains.length) {
    console.log('\n➕ Qo`shilgan (xato emas):');
    gains.forEach(function (g) { console.log('  • ' + g); });
  }

  console.log('\nDOM tugunlari: ' + A.domNodeCount + ' → ' + B.domNodeCount);
  process.exitCode = losses.length ? 1 : 0;
}

/* ───────────────────────── Ishga tushirish ───────────────────────── */

if (MODE === 'snapshot') {
  const f = process.argv[3], o = process.argv[4];
  if (!f || !o) { console.error('node tools/uzmed-preservation.js snapshot <UZMED.html> <chiqish.json>'); process.exit(2); }
  snapshot(f, o).catch(function (e) { console.error('YIQILDI:', e); process.exit(1); });
} else if (MODE === 'compare') {
  const a = process.argv[3], b = process.argv[4];
  if (!a || !b) { console.error('node tools/uzmed-preservation.js compare <asl.json> <yangi.json>'); process.exit(2); }
  compare(a, b);
} else {
  console.error('Rejim: snapshot | compare');
  process.exit(2);
}
