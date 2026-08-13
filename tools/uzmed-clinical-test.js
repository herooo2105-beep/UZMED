#!/usr/bin/env node
/**
 * UZMED CLINICAL TEST — klinik kalkulyatorlarni haqiqiy brauzerda ishga tushirib,
 * mustaqil hisoblangan etalon qiymat bilan solishtiradi.
 *
 * Ishlatish: node tools/uzmed-clinical-test.js <UZMED.html>
 *
 * Har test: kutilgan qiymat SHU YERDA, rasmiy formuladan mustaqil hisoblanadi —
 * ilovaning o'z kodidan olinmaydi. Shuning uchun test haqiqiy validatsiya.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const FILE = process.argv[2];
if (!FILE || !fs.existsSync(FILE)) {
  console.error('Ishlatish: node tools/uzmed-clinical-test.js <UZMED.html>');
  process.exit(2);
}

/* ─── Etalon qiymatlar: rasmiy formulalardan mustaqil hisoblangan ─── */

const R = {
  // BMI = kg / m²  → 70 / 1.75² = 22.857
  bmi: { in: { wt: 70, ht: 175 }, kut: '22.9', izoh: 'WHO: 70kg/1.75m → 22.9 Normal' },
  // Mosteller BSA = √(sm × kg / 3600) = √(175×70/3600) = 1.8447
  bsa: { in: { wt: 70, ht: 175 }, kut: '1.845', izoh: 'Mosteller √(175×70/3600)=1.84466' },
  // Devine erkak: 50 + 2.3×(175/2.54 − 60) = 50 + 2.3×8.898 = 70.5
  ibw: { in: { ht: 175, sex: 'm' }, kut: '70.5', izoh: 'Devine erkak 175sm → 70.5kg' },
  // Devine ayol: 45.5 + 2.3×8.898 = 66.0
  ibw_f: { id: 'ibw', in: { ht: 175, sex: 'f' }, kut: '66.0', izoh: 'Devine ayol 175sm → 66.0kg' },
  // C-G: ((140−60)×70×1)/(72×1.0) = 77.8 → "78"
  cg: { in: { age: 60, wt: 70, cr: 1.0, crU: 'mgdl', sex: 'm' }, kut: '78', izoh: 'C-G erkak 60y/70kg/Cr1.0 → 77.8' },
  // Ayol ×0.85 → 66.1 → "66"
  cg_f: { id: 'cg', in: { age: 60, wt: 70, cr: 1.0, crU: 'mgdl', sex: 'f' }, kut: '66', izoh: 'C-G ayol ×0.85 → 66.1' },
  // SI birlik: 88.4 µmol/L = 1.0 mg/dL → bir xil natija
  cg_si: { id: 'cg', in: { age: 60, wt: 70, cr: 88.4, crU: 'umol', sex: 'm' }, kut: '78', izoh: 'C-G 88.4µmol/L ≡ 1.0mg/dL' },
  // CKD-EPI 2021 erkak: 142×1^(−0.302)×(1/0.9)^(−1.2)×0.9938^60 = 86.1
  ckdepi: { in: { age: 60, cr: 1.0, crU: 'mgdl', sex: 'm' }, kut: '86', izoh: 'CKD-EPI 2021 erkak → 86.1' },
  // Ayol: k=0.7, a=−0.241; scr/k=1.42857 → 142×1×1.42857^(−1.2)×0.9938^60×1.012 = 64.50
  ckdepi_f: { id: 'ckdepi', in: { age: 60, cr: 1.0, crU: 'mgdl', sex: 'f' }, kut: '64', izoh: 'CKD-EPI 2021 ayol → 64.5' },
  // AG = 140 − (100+24) = 16
  ag: { in: { na: 140, cl: 100, hco3: 24 }, kut: '16.0', izoh: 'AG = 140−(100+24) = 16' },
  // Payne: Ca 2.0 mmol/L = 8.016 mg/dL; alb 30 g/L = 3.0 g/dL → 8.016+0.8×1.0 = 8.82
  cca: { in: { ca: 2.0, caU: 'mmol', alb: 30, albU: 'gl' }, kut: '8.82', izoh: 'Payne: 8.016 + 0.8×(4−3) = 8.82' },
  // Katz: Na 130, glu 30 mmol/L = 540 mg/dL → 130 + 1.6×(440/100) = 137.04
  cna: { in: { na: 130, glu: 30, gluU: 'mmol' }, kut: '137.0', izoh: 'Katz: 130+1.6×4.4 = 137.0' },
  // Osm = 2×140 + 5 + 5 = 290
  osm: { in: { na: 140, glu: 5, gluU: 'mmol', urea: 5 }, kut: '290', izoh: '2×140+5+5 = 290' },
  // MAP = 80 + (120−80)/3 = 93.3 → "93"
  map: { in: { sbp: 120, dbp: 80 }, kut: '93', izoh: 'MAP = 80+(40/3) = 93.3' },
  // Bazett: RR=60/60=1.0 s → QTc = 400/√1 = 400
  qtc: { in: { qt: 400, hr: 60, sex: 'm' }, kut: '400', izoh: 'HR60 → RR=1.0 → QTc=QT=400' },
  // HR 100 → RR=0.6 → Bazett = 400/√0.6 = 516.4
  qtc_100: { id: 'qtc', in: { qt: 400, hr: 100, sex: 'm' }, kut: '516', izoh: 'HR100 → 400/√0.6 = 516.4' },
  // Parkland = 4 × 70 × 30 = 8400 mL
  parkland: { in: { wt: 70, tbsa: 30 }, kut: '8400', izoh: 'Parkland 4×70×30 = 8400 mL' },
};

/* ─── Chegara holatlari: noto'g'ri kirish null qaytarishi shart ─── */
const EDGE = [
  { id: 'bmi', in: {}, izoh: 'bo`sh kirish' },
  { id: 'bmi', in: { wt: 0, ht: 175 }, izoh: 'vazn 0' },
  { id: 'bmi', in: { wt: -70, ht: 175 }, izoh: 'manfiy vazn' },
  { id: 'bmi', in: { wt: 'abc', ht: 'xyz' }, izoh: 'matn kirish' },
  { id: 'cg', in: { age: 60, wt: 70, cr: 0, crU: 'mgdl', sex: 'm' }, izoh: 'kreatinin 0 (0 ga bo`lish)' },
  { id: 'parkland', in: { wt: 70, tbsa: 150 }, izoh: 'TBSA >100%' },
  { id: 'map', in: { sbp: 80, dbp: 120 }, izoh: 'SBP < DBP (mantiqsiz)' },
  { id: 'ckdepi', in: { age: 0, cr: 1, crU: 'mgdl', sex: 'm' }, izoh: 'yosh 0' },
];

(async function () {
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(FILE), { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(10000);

  const has = await page.evaluate(function () { return typeof window.UZMED_CALC_PLUS; });
  if (has !== 'object') {
    console.error('❌ UZMED_CALC_PLUS yuklanmagan (typeof=' + has + ')');
    await browser.close();
    process.exit(1);
  }

  const cases = Object.keys(R).map(function (k) {
    return { key: k, id: R[k].id || k, in: R[k].in, kut: R[k].kut, izoh: R[k].izoh };
  });

  const res = await page.evaluate(function (payload) {
    const out = { main: [], edge: [] };
    payload.cases.forEach(function (c) {
      let got = null, err = null;
      try { got = window.UZMED_CALC_PLUS.calc(c.id, c.in); }
      catch (e) { err = String(e.message); }
      out.main.push({
        key: c.key, id: c.id, izoh: c.izoh, kut: c.kut, err: err,
        olindi: got && got.primary ? String(got.primary.value) : null,
        unit: got && got.primary ? got.primary.unit : null,
        badge: got && got.badge ? got.badge.text : null,
      });
    });
    payload.edge.forEach(function (c) {
      let got, err = null;
      try { got = window.UZMED_CALC_PLUS.calc(c.id, c.in); }
      catch (e) { err = String(e.message); }
      out.edge.push({
        id: c.id, izoh: c.izoh, err: err,
        natija: got === null ? 'null' : (got && got.primary ? String(got.primary.value) : JSON.stringify(got)),
      });
    });
    return out;
  }, { cases: cases, edge: EDGE });

  await browser.close();

  let pass = 0, fail = 0;
  console.log('━━━ KLINIK KALKULYATOR TESTI ━━━\n');
  console.log('▸ ETALON QIYMAT TESTLARI');
  res.main.forEach(function (r) {
    const ok = !r.err && r.olindi === r.kut;
    if (ok) pass++; else fail++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + r.id.padEnd(9) +
      ' kutildi ' + String(r.kut).padStart(7) + ' | olindi ' + String(r.olindi).padStart(7) +
      '  — ' + r.izoh + (r.err ? '  [XATO: ' + r.err + ']' : ''));
  });

  console.log('\n▸ CHEGARA HOLATLARI (null kutiladi)');
  let edgePass = 0, edgeFail = 0;
  res.edge.forEach(function (r) {
    const ok = !r.err && r.natija === 'null';
    if (ok) edgePass++; else edgeFail++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + r.id.padEnd(9) + ' → ' + String(r.natija).padEnd(10) +
      ' — ' + r.izoh + (r.err ? '  [XATO: ' + r.err + ']' : ''));
  });

  console.log('\n━━━ NATIJA ━━━');
  console.log('Etalon:  ' + pass + '/' + (pass + fail) + ' o`tdi');
  console.log('Chegara: ' + edgePass + '/' + (edgePass + edgeFail) + ' o`tdi');
  process.exitCode = (fail + edgeFail) > 0 ? 1 : 0;
})().catch(function (e) { console.error('YIQILDI:', e); process.exit(1); });
