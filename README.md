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
| Fayl | `UZMED.html` (55.8 MB) |
| AI kaliti | ✅ o'rnatilgan (Gemini + Groq) |
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

## 🛠 Ishlab chiquvchilar uchun

### Tuzilma

```
UZMED__.zip              tayyor ilova (yuklab olinadigan fayl)
patches/
  prologue.html          tail boshiga qo'shiladigan blok (taymer/rAF registri)
  epilogue.html          </body> oldiga qo'shiladigan tuzatish bloklari
tools/                   audit va tekshiruv vositalari
AUDIT-2026-08-13.md      to'liq audit hisoboti
baseline-v1.0.json       asl versiya inventarizatsiyasi
baseline-patched.json    tuzatilgan versiya inventarizatsiyasi
```

### Qayta yig'ish

```bash
node tools/uzmed-build-patched.js UZMED.html UZMED__.html
```

Vosita asl faylni **o'zgartirmaydi** — faqat ikki joyga blok qo'shadi va
yig'ilgandan keyin asl kontentning har bir bayti saqlanganini tekshiradi.

### Tekshiruv

```bash
node tools/uzmed-audit.js            UZMED__.html    # statik, 10 skaner
node tools/uzmed-runtime.js          UZMED__.html    # Chromium runtime
node tools/uzmed-clinical-test.js    UZMED__.html    # 17 kalkulyator + 8 chegara
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

Barcha tuzatishlar **additive**: mavjud kodning bironta bayti o'chirilmagan yoki
o'zgartirilmagan. Har build'dan keyin saqlanish tekshiruvi ishlaydi —
759 dori yozuvi, 17 kalkulyator, 39 protokol va barcha funksiyalar joyida.

---

## ⚕️ Tibbiy ogohlantirish

UZMED — **yordamchi ma'lumotnoma**, klinik qaror qabul qiluvchi tizim emas.
AI javoblari va kalkulyator natijalari shifokor nazoratini talab qiladi.
Oflayn dori o'zaro ta'sir bazasi cheklangan (101 juftlik) — «ta'sir topilmadi»
degani «ta'sir yo'q» degani **emas**.
