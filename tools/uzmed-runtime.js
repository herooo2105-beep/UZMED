#!/usr/bin/env node
/**
 * UZMED RUNTIME AUDIT — ilovani haqiqiy Chromium'da ishga tushirib tekshiradi.
 *
 * Ishlatish:
 *   node tools/uzmed-runtime.js <UZMED.html> [--json out.json] [--headed]
 *
 * Nima o'lchanadi:
 *   • yuklanish vaqti va console error/warning lar
 *   • ushlanmagan exception va promise rejection lar
 *   • muvaffaqiyatsiz tarmoq so'rovlari (offline/APK holati uchun)
 *   • ekranlar ro'yxati va har biriga navigatsiya natijasi
 *   • ro'yxatdagi global funksiyalar/ma'lumot bazalari haqiqatan yuklanganmi
 *   • ishlayotgan interval/observer soni (leak indikatori)
 *
 * Manba fayl O'ZGARTIRILMAYDI — faqat file:// orqali ochiladi.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const FILE = process.argv[2];
if (!FILE || !fs.existsSync(FILE)) {
  console.error('Ishlatish: node tools/uzmed-runtime.js <UZMED.html>');
  process.exit(2);
}
const URL = 'file://' + path.resolve(FILE);

const consoleErrors = [];
const consoleWarns = [];
const pageErrors = [];
const failedRequests = [];

(async function main() {
  const browser = await chromium.launch({
    headless: process.argv.indexOf('--headed') < 0,
    args: ['--allow-file-access-from-files', '--disable-web-security'],
  });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();

  page.on('console', function (msg) {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error') consoleErrors.push(text.slice(0, 300));
    else if (t === 'warning') consoleWarns.push(text.slice(0, 300));
  });
  page.on('pageerror', function (err) {
    pageErrors.push(String(err && err.message || err).slice(0, 300));
  });
  page.on('requestfailed', function (req) {
    failedRequests.push({
      url: req.url().slice(0, 160),
      reason: (req.failure() && req.failure().errorText) || '?',
    });
  });

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  const tLoad = Date.now() - t0;

  // Bundler dekodlashi + retry-mount modullari uchun kutamiz
  await page.waitForTimeout(12000);
  const tReady = Date.now() - t0;

  /* ── Ilova holati ── */
  const state = await page.evaluate(function () {
    function typeOf(v) { return v === undefined ? 'yo`q' : (Array.isArray(v) ? 'array[' + v.length + ']' : typeof v); }
    const screens = Array.from(document.querySelectorAll('[id$="-screen"], .screen[id]'))
      .map(function (el) {
        const cs = getComputedStyle(el);
        return { id: el.id, display: cs.display, visible: el.offsetParent !== null || cs.display !== 'none' };
      });
    const dbs = {};
    ['MKB_DATA', 'FULL_DRUG_DB', 'DRUG_DATA', 'PROTOCOL_DB', 'UZMED_BOOKS_KB'].forEach(function (k) {
      const v = window[k];
      dbs[k] = v && typeof v === 'object'
        ? (Array.isArray(v) ? 'array[' + v.length + ']' : 'object{' + Object.keys(v).length + '}')
        : typeOf(v);
    });
    const fns = {};
    ['showScreen', 'pushScreen', 'openDrugModal', 'switchAiMode', 'uzmedAiFetch'].forEach(function (k) {
      fns[k] = typeof window[k];
    });
    return {
      title: document.title,
      domNodes: document.getElementsByTagName('*').length,
      bodyChildren: document.body ? document.body.children.length : 0,
      screens: screens,
      dbs: dbs,
      fns: fns,
      loaderVisible: !!document.getElementById('__bundler_loading'),
      swSupported: 'serviceWorker' in navigator,
    };
  });

  /* ── Interval / observer hisobi (leak indikatori) ── */
  const timers = await page.evaluate(function () {
    // setInterval/setTimeout ni o'rab, yangi qo'shilganlarini 10 s davomida sanaymiz
    const rec = { intervals: 0, timeouts: 0, rafs: 0 };
    const oi = window.setInterval, ot = window.setTimeout, orf = window.requestAnimationFrame;
    window.setInterval = function () { rec.intervals++; return oi.apply(window, arguments); };
    window.setTimeout = function () { rec.timeouts++; return ot.apply(window, arguments); };
    window.requestAnimationFrame = function () { rec.rafs++; return orf.apply(window, arguments); };
    return new Promise(function (res) {
      ot(function () {
        window.setInterval = oi; window.setTimeout = ot; window.requestAnimationFrame = orf;
        res(rec);
      }, 10000);
    });
  });

  /* ── Har ekranga navigatsiya ── */
  const navResults = [];
  const screenIds = state.screens.map(function (s) { return s.id; });
  for (const id of screenIds) {
    const before = consoleErrors.length + pageErrors.length;
    const r = await page.evaluate(function (sid) {
      try {
        if (typeof window.showScreen === 'function') { window.showScreen(sid); return 'showScreen'; }
        return 'showScreen-yo`q';
      } catch (e) { return 'XATO: ' + String(e.message).slice(0, 120); }
    }, id);
    await page.waitForTimeout(450);
    const shown = await page.evaluate(function (sid) {
      const el = document.getElementById(sid);
      if (!el) return { mavjud: false };
      const cs = getComputedStyle(el);
      return {
        mavjud: true,
        korinadi: cs.display !== 'none' && cs.visibility !== 'hidden',
        matnUzunligi: (el.innerText || '').trim().length,
        bolalar: el.children.length,
      };
    }, id);
    navResults.push({
      id: id,
      usul: r,
      holat: shown,
      yangiXato: consoleErrors.length + pageErrors.length - before,
    });
  }

  const shot = path.join(path.dirname(FILE), 'uzmed-runtime.png');
  await page.screenshot({ path: shot, fullPage: false });

  await browser.close();

  /* ── Hisobot ── */
  const uniq = function (a) { return Array.from(new Set(a)); };
  const out = {
    yuklanish: { loadMs: tLoad, readyMs: tReady },
    dom: { nodes: state.domNodes, bodyChildren: state.bodyChildren, title: state.title },
    dbs: state.dbs,
    fns: state.fns,
    timers: timers,
    consoleErrors: uniq(consoleErrors),
    consoleWarns: uniq(consoleWarns).slice(0, 30),
    pageErrors: uniq(pageErrors),
    failedRequests: failedRequests,
    screens: navResults,
    screenshot: shot,
  };

  console.log('━━━ UZMED RUNTIME AUDIT ━━━');
  console.log('Sarlavha:        ' + state.title);
  console.log('Yuklanish:       load ' + tLoad + ' ms / ready ' + tReady + ' ms');
  console.log('DOM tugunlari:   ' + state.domNodes);
  console.log('Bazalar:         ' + JSON.stringify(state.dbs));
  console.log('Funksiyalar:     ' + JSON.stringify(state.fns));
  console.log('Timerlar (10s):  ' + JSON.stringify(timers));
  console.log('');
  console.log('❌ pageerror:    ' + uniq(pageErrors).length);
  uniq(pageErrors).slice(0, 25).forEach(function (e) { console.log('   • ' + e); });
  console.log('❌ console.error:' + uniq(consoleErrors).length);
  uniq(consoleErrors).slice(0, 30).forEach(function (e) { console.log('   • ' + e); });
  console.log('⚠️  console.warn: ' + uniq(consoleWarns).length);
  uniq(consoleWarns).slice(0, 12).forEach(function (e) { console.log('   • ' + e); });
  console.log('🌐 failed req:   ' + failedRequests.length);
  uniq(failedRequests.map(function (r) { return r.reason + ' ← ' + r.url; })).slice(0, 20)
    .forEach(function (e) { console.log('   • ' + e); });
  console.log('');
  console.log('📱 EKRANLAR (' + navResults.length + '):');
  navResults.forEach(function (r) {
    const h = r.holat;
    console.log('   ' + (h.mavjud && h.korinadi ? '✅' : '❌') + ' ' + r.id.padEnd(34) +
      ' matn:' + String(h.matnUzunligi || 0).padStart(6) +
      ' bola:' + String(h.bolalar || 0).padStart(4) +
      (r.yangiXato ? '  ⚠️ +' + r.yangiXato + ' xato' : ''));
  });

  const j = process.argv.indexOf('--json');
  if (j > 0 && process.argv[j + 1]) {
    fs.writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 2));
    console.log('\nJSON: ' + process.argv[j + 1]);
  }
})().catch(function (e) {
  console.error('RUNTIME AUDIT YIQILDI:', e);
  process.exit(1);
});
