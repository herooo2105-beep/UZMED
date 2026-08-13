# UZMED

O'zbekiston shifokorlari uchun **offline** tibbiy ma'lumotnoma — bitta HTML fayl,
internetsiz ishlaydi.

---

## ⬇️ Ilovani yuklab olish

**[UZMED__.zip — oxirgi versiya (33 MB)](../../raw/main/UZMED__.zip)**

Zipni oching → ichida bitta **`UZMED__.html`** fayli bo'ladi. Boshqa hech narsa
kerak emas: shu faylni brauzerda ochsangiz (yoki telefonga ko'chirsangiz) ilova
to'liq ishlaydi.

| | |
|---|---|
| Fayl | `UZMED__.html` (58 MB) |
| Ishlaydi | Chrome, Android WebView/APK, `file://` protokoli |
| Internet | **shart emas** (faqat AI chat uchun kerak) |

> **Eslatma:** `Releases` bo'limidagi `v1.0` — **eski, tuzatilmagan** versiya.
> Yangi tuzatishlar shu yerdagi `UZMED__.zip` da.

---

## 🔑 AI ni yoqish

Ilovadagi AI chat ishlashi uchun o'z API kalitingiz kerak (fayl ichida kalit
saqlanmaydi — bu ataylab shunday, sabab pastda).

**Sozlamalar → AI API Key** bo'limiga kalitni kiriting. Qo'llab-quvvatlanadi:

| Provayder | Kalit ko'rinishi | Qayerdan olinadi |
|---|---|---|
| Google Gemini | `AQ.…` yoki `AIza…` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Groq | `gsk_…` | [console.groq.com/keys](https://console.groq.com/keys) |
| OpenAI | `sk-…` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

Yoki brauzer konsolidan:

```js
UZMEDKeys.ornat('AQ.sizning-gemini-kalitingiz', 'gsk_sizning-groq-kalitingiz');
UZMEDKeys.holat();   // tekshirish
```

### ⚠️ Nega kalit fayl ichida yo'q

Oldingi versiyada API kalitlar HTML ichiga yozilgan edi (ba'zilari base64 bilan
yashirilgan). Repo ommaviy bo'lgani uchun GitHub va provayderlar ularni
**avtomatik bekor qilishdi** — natijada butun AI tizimi ishlamay qoldi.

Shuning uchun endi kalitlar hech qachon repoga tushmaydi. Ular
`patches/keys.local.json` faylidan build vaqtida qo'shiladi, u esa `.gitignore`
da (faqat shaxsiy build uchun).

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
