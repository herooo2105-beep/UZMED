# UZMED audit vositalari

`UZMED.html` (single-file, ~55 MB) uchun takrorlanadigan sifat nazorati.
Tashqi bog'liqlik yo'q: Node core + Playwright (runtime testlar uchun).

> Vositalar manba faylni **hech qachon o'zgartirmaydi** — faqat o'qiydi.

## Talablar

- Node.js ≥ 18
- Playwright + Chromium (faqat `uzmed-runtime.js` va `uzmed-clinical-test.js` uchun)

Katta fayl uchun heap oshiriladi:

```bash
node --max-old-space-size=6144 tools/uzmed-audit.js UZMED.html
```

## 1. `uzmed-audit.js` — statik tahlil

```bash
node tools/uzmed-audit.js UZMED.html [--json audit.json] [--max 120]
```

10 ta skaner ishlaydi:

| Skaner | Nima tekshiradi |
|---|---|
| struktura | bundler taglari, template JSON, raw `</script>`, dublikat id, `</body>` |
| sintaksis | har script blokni `vm.Script` bilan **kompilyatsiya** qiladi (bajarmaydi) |
| reference | tayinlanmagan `window.X()` chaqiruvlari |
| data | `MKB_DATA` kod formati/dublikat, `FULL_DRUG_DB` maydon to'liqligi |
| event/UI | e'lon qilinmagan inline handlerlar, `showScreen` nishonlari, o'lik selektorlar |
| async | `catch`siz `fetch()`, `AbortController` yo'qligi |
| resurs | `setInterval`/`clearInterval`, `MutationObserver`/`disconnect` nomutanosibligi |
| storage | himoyasiz `JSON.parse(localStorage…)`, kalit nomlanishi |
| security | API kalitlari, hardcode token, `eval`, dinamik `innerHTML`, `javascript:` |
| tarmoq | `localhost` qoldiqlari, yuklanadigan `http://` resurslar |

Chiqish: darajalangan reyestr (KRITIK / JIDDIY / O'RTA / PAST).
KRITIK topilsa exit code = 1.

**Aniqlik uchun qo'shilgan himoyalar** (soxta natijalarga qarshi):
HTML izohlari o'tkazib yuboriladi · kalit patternlari qat'iy uzunlikda
(base64 blokdagi tasodifiy `AIza…` hisoblanmaydi) · metod chaqiruvlari
(`obj.foo()`) erkin funksiya deb qaralmaydi · ICD-10 diapazon (`A00-A09`) va
xanjar (`A02.2+`) sintaksisi to'g'ri deb qabul qilinadi · XML/terminologiya
URI lari yuklanadigan resurs deb hisoblanmaydi.

## 2. `uzmed-runtime.js` — brauzer runtime auditi

```bash
node tools/uzmed-runtime.js UZMED.html [--json runtime.json] [--headed]
```

Ilovani headless Chromium'da `file://` orqali ochadi (APK/WebView holatiga yaqin) va
o'lchaydi: yuklanish vaqti · `pageerror` / `console.error` · muvaffaqiyatsiz tarmoq
so'rovlari · DOM tugunlari · global bazalar va funksiyalar mavjudligi · timer/rAF
yuki · **har bir ekranga navigatsiya** natijasi. Screenshot ham saqlanadi.

## 3. `uzmed-clinical-test.js` — klinik validatsiya

```bash
node tools/uzmed-clinical-test.js UZMED.html
```

`UZMED_CALC_PLUS.calc()` ni real brauzerda chaqiradi va natijani **rasmiy
formuladan mustaqil hisoblangan** etalon bilan solishtiradi (etalon qiymatlar
test faylining o'zida, ilova kodidan olinmaydi — shuning uchun bu haqiqiy
validatsiya).

Qamrov: BMI · BSA (Mosteller) · IBW (Devine) · Cockcroft–Gault (mg/dL va µmol/L) ·
CKD-EPI 2021 (irqsiz, ♂/♀) · anion tafovuti · tuzatilgan Ca (Payne) ·
tuzatilgan Na (Katz) · osmolyarlik · MAP · QTc (Bazett) · Parkland.

Plus 8 ta chegara holati: bo'sh/0/manfiy/matn kirish, nolga bo'lish,
TBSA > 100%, SBP < DBP, yosh 0 — barchasi `null` qaytarishi shart.

Bitta test yiqilsa exit code = 1.

## Reliz oldidan to'liq tekshiruv

```bash
UZ=UZMED.html
node --max-old-space-size=6144 tools/uzmed-audit.js "$UZ" --json audit.json &&
node tools/uzmed-runtime.js       "$UZ" --json runtime.json &&
node tools/uzmed-clinical-test.js "$UZ"
```

Uchalasi ham 0 bilan tugasa, build tarqatishga tayyor.
