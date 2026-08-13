#!/usr/bin/env node
/**
 * UZMED PATCH BUILDER — tuzatilgan faylni yig'adi.
 *
 *   node tools/uzmed-build-patched.js <UZMED.html> <UZMED__.html>
 *
 * Ikki joyga qo'shadi (FAQAT QO'SHADI — bironta bayt o'chirilmaydi):
 *   1) patches/prologue.html → OUTER TAIL ning boshiga (template'dan darhol keyin)
 *      Sabab: taymer/observer/rAF registratori boshqa tail modullaridan OLDIN
 *      ishga tushishi kerak, aks holda ular closure ichida qolib ketadi.
 *   2) patches/epilogue.html → </body> dan darhol oldin
 *
 * Yig'ilgandan keyin isbot chiqariladi: asl faylning har bir bayti yangi
 * faylda o'z tartibida saqlanganligi tekshiriladi.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) {
  console.error('Ishlatish: node tools/uzmed-build-patched.js <UZMED.html> <UZMED__.html>');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const prologue = fs.readFileSync(path.join(ROOT, 'patches', 'prologue.html'), 'utf8');
let epilogue = fs.readFileSync(path.join(ROOT, 'patches', 'epilogue.html'), 'utf8');

/* ── API kalitlari ────────────────────────────────────────────────────────
   Kalitlar `patches/keys.local.json` dan olinadi. Bu fayl .gitignore da —
   ommaviy repoga HECH QACHON tushmaydi.

   Nega shunday: oldingi versiyada Groq kaliti HTML ichiga base64 qilib
   yozilgan edi. Repo ommaviy bo'lgani uchun Groq uni avtomatik bekor qildi
   va butun AI tizimi ishlamay qoldi. Xuddi shu xato takrorlanmasligi kerak.

   Fayl bo'lmasa — build kalitsiz yig'iladi va foydalanuvchi kalitni ilova
   ichidagi Sozlamalar → AI API Key orqali kiritadi.                        */
const KEYS_FILE = path.join(ROOT, 'patches', 'keys.local.json');
let kalitHolat = 'kalitsiz (foydalanuvchi Sozlamalardan kiritadi)';
if (fs.existsSync(KEYS_FILE)) {
  const k = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  const g = String(k.gemini || '').trim();
  const q = String(k.groq || '').trim();
  if (g) epilogue = epilogue.replace('@@UZMED_GEMINI_KEY@@', g);
  if (q) epilogue = epilogue.replace('@@UZMED_GROQ_KEY@@', q);
  const niqob = (s) => s ? s.slice(0, 6) + '…' + s.slice(-4) : 'yo`q';
  kalitHolat = 'o`rnatildi — Gemini: ' + niqob(g) + ' · Groq: ' + niqob(q);
}

const html = fs.readFileSync(SRC, 'utf8');

/* ── Qo'shish nuqtalarini topamiz ── */
const TPL = '<script type="__bundler/template">';
const tplAt = html.indexOf(TPL);
if (tplAt < 0) { console.error('❌ template tagi topilmadi — fayl UZMED emas'); process.exit(1); }
const tplEnd = html.indexOf('</script>', tplAt + TPL.length);
if (tplEnd < 0) { console.error('❌ template yopilmagan'); process.exit(1); }
const tailStart = tplEnd + '</script>'.length;

const bodyAt = html.lastIndexOf('</body>');
if (bodyAt < 0) { console.error('❌ </body> topilmadi'); process.exit(1); }

/* ── Yig'amiz ── */
const patched =
  html.slice(0, tailStart) +
  prologue +
  html.slice(tailStart, bodyAt) +
  epilogue +
  html.slice(bodyAt);

fs.writeFileSync(OUT, patched);

/* ── ISBOT: asl faylning hamma bayti joyida ── */
const a = html;
const b = patched;
const p1 = b.slice(0, tailStart);
const p2 = b.slice(tailStart + prologue.length, tailStart + prologue.length + (bodyAt - tailStart));
const p3 = b.slice(b.length - (a.length - bodyAt));

const butun = (p1 + p2 + p3) === a;

console.log('━━━ PATCH BUILD ━━━');
console.log('Manba:      ' + SRC + '  (' + (a.length / 1048576).toFixed(2) + ' MB)');
console.log('Natija:     ' + OUT + '  (' + (b.length / 1048576).toFixed(2) + ' MB)');
console.log('Prologue:   ' + prologue.length + ' belgi → tail boshiga (@' + tailStart + ')');
console.log('Epilogue:   ' + epilogue.length + ' belgi → </body> oldiga (@' + bodyAt + ')');
console.log('Qo`shildi:  +' + (b.length - a.length) + ' belgi');
console.log('API kalit:  ' + kalitHolat);
console.log('');
console.log(butun
  ? '✅ ISBOT: asl faylning BARCHA baytlari o`z tartibida saqlangan (0 o`chirilgan, 0 o`zgartirilgan)'
  : '❌ ISBOT YIQILDI: asl kontent o`zgargan!');

/* ── Sanity: bundler yaxlitligi ── */
const encStart = b.indexOf(TPL) + TPL.length;
const encEnd = b.indexOf('</script>', encStart);
let tplOk = false;
try { JSON.parse(b.slice(encStart, encEnd)); tplOk = true; } catch (e) {}
console.log(tplOk ? '✅ Template JSON hamon butun' : '❌ Template JSON buzildi');

const rawClose = (b.slice(encStart, encEnd).match(/<\/script>/g) || []).length;
console.log(rawClose === 0 ? '✅ Encoded ichida raw </script> yo`q' : '❌ raw </script>: ' + rawClose);

process.exitCode = (butun && tplOk && rawClose === 0) ? 0 : 1;
