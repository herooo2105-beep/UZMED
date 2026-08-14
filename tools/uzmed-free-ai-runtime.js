#!/usr/bin/env node
/**
 * UZMED — bepul AI zanjirining JONLI (brauzer) testi.
 *
 *   node tools/uzmed-free-ai-runtime.js UZMED__.html
 *
 * Haqiqiy faylni Chromium'da ochadi va tarmoqni to'liq ushlab turadi:
 *   Gemini / Groq / OpenAI → 404 (asosiy AI «yiqilgan» holat)
 *   bepul provayderlar     → 200 (test javobi)
 * Haqiqiy tarmoqqa CHIQILMAYDI, hech qanday kalit ishlatilmaydi.
 *
 * Tekshiradi: modul yuklanishi, Sozlamalardagi element va oyna,
 * fetch darajasidagi zaxira (Gemini javob shakli saqlanishi),
 * UZMED_ONLINE.generate integratsiyasi va sahifada xato yo'qligi.
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const FILE = process.argv[2];
let jami = 0, otdi = 0;
const T = (n, ok, izoh) => { jami++; if (ok) { otdi++; console.log('  ✅ ' + n); } else console.log('  ❌ ' + n + (izoh ? ' → ' + izoh : '')); };

(async () => {
  /* Chromium yo'li: odatda Playwright o'zi topadi. Muhitda boshqa build
     o'rnatilgan bo'lsa — PW_CHROMIUM bilan ko'rsatiladi. */
  const launch = { headless: true, args: ['--allow-file-access-from-files'] };
  if (process.env.PW_CHROMIUM) launch.executablePath = process.env.PW_CHROMIUM;
  const b = await chromium.launch(launch);
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();

  const xatolar = [];
  page.on('pageerror', e => xatolar.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    /* Bu test Gemini/Groq ni ATAYLAB 404 qiladi — brauzerning tarmoq
       darajasidagi «Failed to load resource» yozuvi test artefakti,
       ilova xatosi emas. Ilova o'zi chiqargan xatolar sanaladi. */
    if (/Failed to load resource/i.test(t)) return;
    xatolar.push('console.error: ' + t);
  });

  /* Barcha tashqi so'rovlarni ushlaymiz: Gemini/Groq — 404, bepul
     provayderlar — muvaffaqiyat. Haqiqiy tarmoqqa chiqilmaydi. */
  const sorovlar = [];
  await ctx.route('**://**', route => {
    const u = route.request().url();
    sorovlar.push(u);
    if (/generativelanguage|api\.groq\.com|api\.openai\.com/.test(u)) {
      return route.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'model no longer available' } }) });
    }
    if (/ovh\.net|llm7\.io|cerebras|sambanova|openrouter|mistral|nvidia|siliconflow|models\.github\.ai/.test(u)) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'ZAXIRA PROVAYDER JAVOBI' } }] }) });
    }
    return route.continue();
  });

  await page.goto('file://' + path.resolve(FILE), { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(20000);

  console.log('\n── Modul yuklanishi');
  T('UZMEDFreeAI mavjud', await page.evaluate(() => typeof window.UZMEDFreeAI === 'object'));
  T('UZMEDFreeAiOch mavjud', await page.evaluate(() => typeof window.UZMEDFreeAiOch === 'function'));

  const h = await page.evaluate(() => window.UZMEDFreeAI.holat());
  T('9 provayder registrda', h.provayderlar.length === 9, String(h.provayderlar.length));
  T('kalitsiz zanjir faol (2 ta)', h.zanjirUzunligi === 2, String(h.zanjirUzunligi));

  console.log('\n── Sozlamalar UI');
  T('Sozlamalarda element paydo bo`ldi',
    await page.evaluate(() => !!document.getElementById('uzm-fai-item')));
  T('element matni to`g`ri',
    (await page.evaluate(() => {
      const e = document.getElementById('uzm-fai-item');
      return e ? e.textContent : '';
    })).indexOf('Bepul AI provayderlar') >= 0);

  await page.evaluate(() => window.UZMEDFreeAiOch());
  await page.waitForTimeout(600);
  T('oyna ochildi', await page.evaluate(() => !!document.getElementById('uzm-fai-bg')));
  const qatorSoni = await page.evaluate(() =>
    document.querySelectorAll('#uzm-fai-box .uzm-fai-row').length);
  T('oynada 9 provayder qatori', qatorSoni === 9, String(qatorSoni));
  T('LOG belgisi ko`rsatilgan',
    await page.evaluate(() => document.querySelectorAll('.uzm-fai-lg').length === 2));
  await page.evaluate(() => {
    const x = document.querySelector('.uzm-fai-x'); if (x) x.click();
  });

  console.log('\n── Fetch zaxirasi (haqiqiy Gemini chaqiruvi 404)');
  const n0 = sorovlar.length;
  const natija = await page.evaluate(async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'salom' }] }] })
    });
    const j = await r.json();
    return { status: r.status, matn: j.candidates && j.candidates[0].content.parts[0].text, zaxira: !!j.__uzmedZaxira };
  });
  T('404 o`rniga 200 qaytdi', natija.status === 200, String(natija.status));
  T('Gemini shakli saqlandi + zaxira matni', natija.matn === 'ZAXIRA PROVAYDER JAVOBI', String(natija.matn));
  T('zaxira belgisi qo`yildi', natija.zaxira === true);
  const yangi = sorovlar.slice(n0);
  T('zaxira provayderga so`rov ketdi', yangi.some(u => /ovh\.net|llm7/.test(u)), yangi.join(' | ').slice(0, 200));

  console.log('\n── Sinov tugmasi');
  const sinov = await page.evaluate(() => window.UZMEDFreeAI.sinov('ovh'));
  T('sinov() ishladi', sinov.ok === true, JSON.stringify(sinov).slice(0, 140));

  console.log('\n── UZMED_ONLINE integratsiyasi');
  T('UZMED_ONLINE.generate o`raldi',
    await page.evaluate(() => !!(window.UZMED_ONLINE && window.UZMED_ONLINE.__uzFreeChain)));
  const gen = await page.evaluate(() => new Promise(res => {
    if (!window.UZMED_ONLINE) return res({ error: 'UZMED_ONLINE yo`q' });
    window.UZMED_ONLINE.generate('salom', res);
  }));
  T('generate zaxira orqali javob berdi',
    gen.text === 'ZAXIRA PROVAYDER JAVOBI', JSON.stringify(gen).slice(0, 160));

  console.log('\n── Xatolar');
  T('pageerror / console.error yo`q', xatolar.length === 0, xatolar.slice(0, 3).join(' ; '));

  console.log('\n━━━ NATIJA: ' + otdi + '/' + jami + ' ━━━');
  await b.close();
  process.exit(otdi === jami ? 0 : 1);
})();
