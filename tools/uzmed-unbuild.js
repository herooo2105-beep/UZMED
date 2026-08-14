#!/usr/bin/env node
/**
 * UZMED UNBUILD — yig'ilgan fayldan ASL manbani tiklaydi.
 *
 *   node tools/uzmed-unbuild.js <yigilgan.html> <asl.html> [--keys patches/keys.local.json]
 *
 * NEGA KERAK: repoda faqat yig'ilgan build saqlanadi (UZMED.zip / UZMED__.zip).
 * Asl manba yo'q, shuning uchun `uzmed-build-patched.js` ni qayta ishga
 * tushirish bloklarni IKKI marta qo'shib yuboradi (dublikat script id →
 * audit yiqiladi). Bu vosita build'ni teskari qaytaradi:
 *
 *   1) prologue blokini tail boshidan olib tashlaydi
 *   2) epilogue blokini `</body>` oldidan olib tashlaydi
 *   3) epilogue ichiga build vaqtida qo'yilgan API kalitlarni ajratib oladi
 *      (`--keys` berilsa keys.local.json ga yozadi — u .gitignore da)
 *
 * ISBOT: tiklangan manba + ayni epilogue = kirish fayli (bayt-ma-bayt).
 * Tekshiruv yiqilsa vosita xato bilan to'xtaydi va hech narsa yozmaydi.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3];
const keysAt = process.argv.indexOf('--keys');
const KEYS_OUT = keysAt > 0 ? process.argv[keysAt + 1] : null;

if (!SRC || !OUT) {
  console.error('Ishlatish: node tools/uzmed-unbuild.js <yigilgan.html> <asl.html> [--keys fayl.json]');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const prologue = fs.readFileSync(path.join(ROOT, 'patches', 'prologue.html'), 'utf8');
const epiTemplate = fs.readFileSync(path.join(ROOT, 'patches', 'epilogue.html'), 'utf8');

const html = fs.readFileSync(SRC, 'utf8');

/* ── Qo'shish nuqtalari (build bilan bir xil mantiq) ── */
const TPL = '<script type="__bundler/template">';
const tplAt = html.indexOf(TPL);
if (tplAt < 0) { console.error('❌ template tagi topilmadi — fayl UZMED emas'); process.exit(1); }
const tplEnd = html.indexOf('</script>', tplAt + TPL.length);
const tailStart = tplEnd + '</script>'.length;

const bodyAt = html.lastIndexOf('</body>');
if (bodyAt < 0) { console.error('❌ </body> topilmadi'); process.exit(1); }

/* ── 1) Prologue ── */
const prologueBor = html.slice(tailStart, tailStart + prologue.length) === prologue;
if (!prologueBor) {
  console.error('❌ Prologue topilmadi — bu fayl shu patches/ bilan yig`ilmagan.');
  console.error('   (yoki allaqachon asl manba — unda unbuild kerak emas)');
  process.exit(1);
}

/* ── 2) Epilogue ──
   Epilogue build vaqtida kalit almashtirilgan bo'lishi mumkin, shuning uchun
   uzunligi shablondan farq qiladi. Boshini marker bilan topamiz.
   Marker shablonning O'ZIDAN olinadi — qattiq yozilgan matn emas.
   (Yangi bloklar shablon OXIRIGA qo'shiladi, boshi o'zgarmaydi.) */
const MARKER = epiTemplate.slice(0, 120);
const epiStart = html.lastIndexOf(MARKER, bodyAt);
if (epiStart < 0 || epiStart < tailStart) {
  console.error('❌ Epilogue markeri topilmadi (patches/epilogue.html boshi o`zgargan?).');
  process.exit(1);
}
const epiBuilt = html.slice(epiStart, bodyAt);

/* ── 3) Kalitlarni ajratib olamiz ────────────────────────────────────────
   Shablonda `@@UZMED_GEMINI_KEY@@` turgan joyda yig'ilgan faylda haqiqiy
   kalit turadi.
   Tayanch — o'rinbosar turgan QATORNING undan oldingi qismi
   (masalan `  var GROQ_RAW = '`). Qo'shni satrlar tayanchga olinmaydi:
   ular ikkinchi o'rinbosarni o'z ichiga oladi va u yig'ilgan faylda yo'q.
   Qiymat keyingi qo'shtirnoqqacha o'qiladi (kalitlarda qo'shtirnoq yo'q). */
function kalitAjrat(nom) {
  const ph = '@@' + nom + '@@';
  const i = epiTemplate.indexOf(ph);
  if (i < 0) return '';
  const qator = epiTemplate.lastIndexOf('\n', i);
  const oldi = epiTemplate.slice(qator + 1, i);
  if (!oldi) return '';
  const a = epiBuilt.indexOf(oldi);
  if (a < 0) return '';
  const boshi = a + oldi.length;
  const b = epiBuilt.indexOf("'", boshi);
  if (b < 0) return '';
  const v = epiBuilt.slice(boshi, b);
  return (v && v.indexOf('@@') < 0) ? v : '';
}

const kalitlar = {
  gemini: kalitAjrat('UZMED_GEMINI_KEY'),
  groq: kalitAjrat('UZMED_GROQ_KEY')
};

/* ── 4) Asl manbani yig'amiz ── */
const asl =
  html.slice(0, tailStart) +
  html.slice(tailStart + prologue.length, epiStart) +
  html.slice(bodyAt);

/* ── 5) ISBOT: asl + ayni epilogue = kirish fayli ── */
const qayta =
  asl.slice(0, tailStart) +
  prologue +
  asl.slice(tailStart, asl.lastIndexOf('</body>')) +
  epiBuilt +
  asl.slice(asl.lastIndexOf('</body>'));

const butun = qayta === html;

const niqob = (s) => s ? s.slice(0, 6) + '…' + s.slice(-4) + ' (' + s.length + ')' : 'yo`q';

console.log('━━━ UNBUILD ━━━');
console.log('Kirish:     ' + SRC + '  (' + (html.length / 1048576).toFixed(2) + ' MB)');
console.log('Asl manba:  ' + OUT + '  (' + (asl.length / 1048576).toFixed(2) + ' MB)');
console.log('Olib tashlandi: prologue ' + prologue.length + ' + epilogue ' + epiBuilt.length + ' belgi');
console.log('Topilgan kalit: Gemini ' + niqob(kalitlar.gemini) + ' · Groq ' + niqob(kalitlar.groq));
console.log('');

if (!butun) {
  console.error('❌ ISBOT YIQILDI: tiklangan manba + epilogue kirish fayliga teng emas.');
  console.error('   Hech narsa yozilmadi.');
  process.exit(1);
}
console.log('✅ ISBOT: tiklangan manba + ayni epilogue = kirish fayli (bayt-ma-bayt)');

fs.writeFileSync(OUT, asl);

if (KEYS_OUT && (kalitlar.gemini || kalitlar.groq)) {
  fs.writeFileSync(KEYS_OUT, JSON.stringify(kalitlar, null, 2) + '\n');
  console.log('✅ Kalitlar yozildi: ' + KEYS_OUT + '  (.gitignore da — commit qilinmaydi)');
}
