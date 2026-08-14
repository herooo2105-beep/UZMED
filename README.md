# UZMED

O'zbekiston shifokorlari uchun **offline** tibbiy ma'lumotnoma — bitta HTML fayl,
internetsiz ishlaydi.

---

## ⬇️ Ilovani yuklab olish

**[UZMED.zip — oxirgi versiya, AI kalitlari o'rnatilgan (33 MB)](../../raw/main/UZMED.zip)**

Zipni oching → ichida bitta **`UZMED.html`** fayli bo'ladi. Boshqa hech narsa
kerak emas: shu faylni brauzerda ochsangiz (yoki telefonga ko'chirsangiz) ilova
to'liq ishlaydi va **AI darhol ishlaydi** — kalit kiritish shart emas.

| | |
|---|---|
| Fayl | `UZMED.html` (55.9 MB) |
| AI kaliti | ✅ o'rnatilgan (Gemini + Groq) |
| AI zaxirasi | ✅ 9 ta bepul provayder — 2 tasi kalitsiz ishlaydi |
| Ishlaydi | Chrome, Android WebView/APK, `file://` protokoli |
| Internet | faqat AI chat uchun; qolgan hamma narsa oflayn |

> **Eslatma:** `Releases` bo'limidagi `v1.0` — **eski, tuzatilmagan** versiya.
> Yangi tuzatishlar shu yerdagi `UZMED.zip` da.

Kalitsiz variant ham bor: [`UZMED__.zip`](../../raw/main/UZMED__.zip) — unda
foydalanuvchi o'z kalitini kiritadi.

---

## 🔑 AI kalitini almashtirish

Kalit ishdan chiqsa yoki o'zingiznikini qo'ymoqchi bo'lsangiz —
**Sozlamalar → AI API Key** bo'limiga kiriting, yoki brauzer konsolidan:

```js
UZMEDKeys.ornat('AQ.yangi-gemini-kaliti', 'gsk_yangi-groq-kaliti');
UZMEDKeys.holat();   // tekshirish
```

| Provayder | Kalit ko'rinishi | Qayerdan olinadi |
|---|---|---|
| Google Gemini | `AQ.…` yoki `AIza…` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Groq | `gsk_…` | [console.groq.com/keys](https://console.groq.com/keys) |
| OpenAI | `sk-…` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

Faylni qayta yig'ish shart emas — kalit brauzer xotirasiga saqlanadi.

### Model haqida

Google `gemini-2.0-flash`, `gemini-2.5-flash` va `gemini-2.5-flash-lite`
modellarini o'chirgan (HTTP 404). Ilova endi **`gemini-flash-latest`**
taxallusidan foydalanadi — u Google tomonidan avtomatik yangilanadi, shuning
uchun model eskirishi sababli AI yana to'xtab qolmaydi.

---

## 🔁 Bepul AI zaxira provayderlari

Asosiy AI (Gemini → Groq → OpenAI) **yiqilsa** — kalit bekor qilinsa, model
o'chirilsa, kvota tugasa yoki tarmoq rad etsa — so'rov avtomatik ravishda
bepul provayderlar zanjiriga o'tadi. Shifokor hech narsa qilmaydi va
farqni sezmaydi: javob ayni shaklda qaytadi.

**Sozlamalar → Bepul AI provayderlar** bo'limida boshqariladi.

| Provayder | Kalit | Bepul chegara |
|---|---|---|
| Cerebras | kerak | 1M token/kun, 5 RPM |
| SambaNova | kerak | 20 RPM, 200K token/kun |
| GitHub Models | kerak (PAT) | 10–15 RPM, 50–150 RPD |
| NVIDIA NIM | kerak | ~40 RPM |
| Mistral AI | kerak | ~1B token/oy |
| OpenRouter | kerak | 20 RPM, 50 RPD |
| SiliconFlow | kerak | 30 RPM |
| **OVHcloud** | **kerak emas** | 2 RPM har IP, EU serverlari |
| **LLM7.io** | **kerak emas** | 30 RPM (token bilan 120) |

Oxirgi ikkitasi ro'yxatdan o'tishni talab qilmaydi — shuning uchun
**hech qanday kalitsiz ham AI javob beradi**. Kalit kiritilgan provayderlar
zanjirda oldinda turadi (tezroq va limiti yuqori).

Manba: [awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis)
(ro'yxat 2026-08-14 da o'qildi).

### ⚠️ Maxfiylik

Bular uchinchi tomon serverlari. Ikkitasi so'rovni model o'qitish uchun
saqlashi mumkinligini hujjatida ochiq yozgan (**Mistral**, **OpenRouter**) —
ular UI da `LOG` belgisi bilan ko'rsatiladi. **Bemor ismi, tug'ilgan sanasi
va boshqa identifikatorlarni yubormang.**

Faqat log qilmaydigan provayderlar bilan ishlash:

```js
UZMEDFreeAI.faqatMaxfiy(true);   // LOG belgililarni zanjirdan chiqaradi
UZMEDFreeAI.qatlamYoq(false);    // butun zaxira qatlamini o'chirish
```

### Konsol buyruqlari

```js
UZMEDFreeAI.holat();                       // zanjir holati (kalitlar niqoblangan)
UZMEDFreeAI.kalitOrnat('cerebras', 'csk-…');
UZMEDFreeAI.sinov('ovh');                  // bitta provayderni sinash
UZMEDFreeAI.modellar('mistral');           // provayderdan jonli model ro'yxati
UZMEDFreeAI.provayderQosh({ id:'x', url:'https://…/v1/chat/completions',
                            modellar:['model-nomi'], kalit:'bearer' });
```

Model nomi eskirsa (Gemini bilan aynan shu bo'lgan) — kod tahrirlash shart
emas: `provayderQosh` bilan yangi yozuv qo'yiladi, u localStorage da saqlanadi.

---

## 🛠 Ishlab chiquvchilar uchun

### Tuzilma

```
UZMED__.zip              tayyor ilova (yuklab olinadigan fayl)
patches/
  prologue.html          tail boshiga qo'shiladigan blok (taymer/rAF registri)
  epilogue.html          </body> oldiga qo'shiladigan tuzatish + kengaytma bloklari
tools/                   audit, tekshiruv va build vositalari
AUDIT-2026-08-13.md      to'liq audit hisoboti
baseline-v1.0.json       asl versiya inventarizatsiyasi
baseline-patched.json    tuzatilgan versiya inventarizatsiyasi
```

### Qayta yig'ish

Repoda faqat **yig'ilgan** build saqlanadi (`UZMED.zip` / `UZMED__.zip`), asl
manba yo'q. Shuning uchun avval build teskari qaytariladi, keyin qayta
yig'iladi — aks holda patch bloklari ikki marta qo'shiladi:

```bash
unzip UZMED.zip                                            # → UZMED.html (yig'ilgan)
node tools/uzmed-unbuild.js UZMED.html manba.html \
     --keys patches/keys.local.json                        # → asl manba + kalitlar
node tools/uzmed-build-patched.js manba.html UZMED__.html  # → qayta yig'ish
```

`uzmed-unbuild.js` isbot bilan ishlaydi: tiklangan manba + ayni epilogue
kirish fayliga **bayt-ma-bayt** teng bo'lmasa, hech narsa yozmaydi.

Vosita asl faylni **o'zgartirmaydi** — faqat ikki joyga blok qo'shadi va
yig'ilgandan keyin asl kontentning har bir bayti saqlanganini tekshiradi.

### Tekshiruv

```bash
node tools/uzmed-audit.js            UZMED__.html    # statik, 10 skaner
node tools/uzmed-runtime.js          UZMED__.html    # Chromium runtime
node tools/uzmed-clinical-test.js    UZMED__.html    # 17 kalkulyator + 8 chegara
node tools/uzmed-free-ai-test.js                     # bepul AI zanjiri, 57 test
node tools/uzmed-free-ai-runtime.js  UZMED__.html    # zanjir jonli brauzerda
node tools/uzmed-preservation.js snapshot UZMED__.html yangi.json
node tools/uzmed-preservation.js compare baseline-v1.0.json yangi.json
```

Batafsil: [`tools/README.md`](tools/README.md)

---

## 📋 Tuzatilgan xatolar

To'liq hisobot: [`AUDIT-2026-08-13.md`](AUDIT-2026-08-13.md)

- AI tizimi — bekor qilingan kalitlar va Google olib tashlagan Gemini modellari
- Kun/Tun rejimi — tugma ishlardi, lekin ko'rinish o'zgarmasdi
- Smart Search'dan dori monografiyasi ochilmasligi
- Bo'sh turganda batareya sarfi (doimiy animatsiya tsikllari)
- AI so'rovi yiqilganda foydalanuvchiga xabar berilmasligi
- **AI yagona provayderga bog'liqligi** — endi 9 ta bepul zaxira provayder,
  2 tasi kalitsiz (yuqoridagi bo'limga qarang)

Barcha tuzatishlar **additive**: mavjud kodning bironta bayti o'chirilmagan yoki
o'zgartirilmagan. Har build'dan keyin saqlanish tekshiruvi ishlaydi —
759 dori yozuvi, 17 kalkulyator, 39 protokol va barcha funksiyalar joyida.

---

## ⚕️ Tibbiy ogohlantirish

UZMED — **yordamchi ma'lumotnoma**, klinik qaror qabul qiluvchi tizim emas.
AI javoblari va kalkulyator natijalari shifokor nazoratini talab qiladi.
Oflayn dori o'zaro ta'sir bazasi cheklangan (101 juftlik) — «ta'sir topilmadi»
degani «ta'sir yo'q» degani **emas**.
