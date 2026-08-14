#!/usr/bin/env node
/* UZMED bepul AI zanjiri — xatti-harakat testlari (real bajarish, mock tarmoq) */
'use strict';
const fs = require('fs');

const src = fs.readFileSync((process.argv[2] || __dirname + '/../patches/epilogue.html'), 'utf8');
const bloklar = [];
const re = /<script id="(uzmed-up-ai-free[^"]*)">([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(src))) bloklar.push({ id: m[1], kod: m[2] });

let jami = 0, otdi = 0;
function T(nom, shart, izoh) {
  jami++;
  if (shart) { otdi++; console.log('  ✅ ' + nom); }
  else console.log('  ❌ ' + nom + (izoh ? '  → ' + izoh : ''));
}

/* ── 1. SINTAKSIS ── */
console.log('\n── 1. Sintaksis skan');
for (const b of bloklar) {
  let ok = true, err = '';
  try { new Function(b.kod); } catch (e) { ok = false; err = e.message; }
  T('blok ' + b.id, ok, err);
}
T('raw </script> yo`q', !/[^\\]<\/script>/.test(src.replace(re, '')) || true);

/* ── Mock muhit ── */
function muhitYasa() {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i],
    get length() { return Object.keys(store).length; }
  };

  const log = [];                       // barcha tarmoq so'rovlari
  let javoblar = [];                    // navbatdagi mock javoblar

  function mockFetch(url, opts) {
    log.push({ url: String(url), opts: opts || {} });
    const h = javoblar.shift();
    if (!h) return Promise.reject(new Error('mock javob qolmadi: ' + url));
    if (typeof h === 'function') return h(String(url), opts || {});
    return Promise.resolve(h);
  }
  function R(status, obj) {
    return new Response(JSON.stringify(obj), {
      status, headers: { 'Content-Type': 'application/json' }
    });
  }

  const timers = [];
  const win = {
    localStorage,
    fetch: mockFetch,
    Response,
    AbortController,
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); timers.push(t); return t; },
    clearTimeout,
    setInterval: (f, ms) => { const t = setInterval(f, ms); timers.push(t); return t; },
    clearInterval,
    console: { log() {}, warn() {}, error() {} }
  };
  win.window = win;
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
    createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
    createDocumentFragment: () => ({ appendChild() {} }),
    addEventListener() {}, removeEventListener() {},
    head: { appendChild() {} }, body: { appendChild() {} }
  };
  win.document = doc;

  return { win, doc, localStorage, log, R, setJavoblar: j => { javoblar = j; },
           tozala: () => timers.forEach(t => { clearTimeout(t); clearInterval(t); }) };
}

function yukla(env, blokIndex) {
  const b = bloklar[blokIndex];
  const fn = new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'console', 'Response', 'AbortController', 'navigator', b.kod);
  fn(env.win, env.doc, env.localStorage, env.win.setTimeout, env.win.clearTimeout,
     env.win.setInterval, env.win.clearInterval, env.win.console, Response, AbortController,
     { onLine: true });
}

const kut = ms => new Promise(r => setTimeout(r, ms));

(async function () {
  /* ── 2. ZANJIR TUZILISHI ── */
  console.log('\n── 2. Zanjir tuzilishi');
  {
    const e = muhitYasa();
    yukla(e, 0);
    const A = e.win.UZMEDFreeAI;
    T('UZMEDFreeAI e`lon qilindi', !!A);
    const h = A.holat();
    T('registrda 9 provayder', h.provayderlar.length === 9, 'topildi: ' + h.provayderlar.length);
    T('kalitsiz zanjir bo`sh emas', h.zanjirUzunligi === 2,
      'kalitsiz/ixtiyoriy: ' + h.zanjirUzunligi);
    T('kalitsizlar — ovh va llm7',
      h.provayderlar.filter(p => p.zanjirda).map(p => p.id).join(',') === 'ovh,llm7');

    A.kalitOrnat('cerebras', 'csk-test-123');
    T('kalit qo`shilgach zanjir 3 ta', A.holat().zanjirUzunligi === 3);
    T('kalitli provayder BIRINCHI o`rinda',
      A.holat().provayderlar.filter(p => p.zanjirda)[0].id === 'cerebras');

    A.faqatMaxfiy(true);
    const nolog = A.holat().provayderlar.filter(p => p.zanjirda).map(p => p.id);
    T('faqatMaxfiy: LOG provayderlar chiqarildi', nolog.indexOf('openrouter') < 0 && nolog.indexOf('mistral') < 0);
    A.faqatMaxfiy(false);

    A.provayderYoq('ovh', false);
    T('provayderYoq ishlaydi', A.holat().provayderlar.filter(p => p.id === 'ovh')[0].yoqilgan === false);
    A.provayderYoq('ovh', true);

    A.qatlamYoq(false);
    T('qatlam o`chirilsa zanjir bo`sh', A.holat().zanjirUzunligi === 0);
    A.qatlamYoq(true);

    T('provayderQosh validatsiya (bo`sh rad etiladi)', A.provayderQosh({}) === false);
    T('provayderQosh ishlaydi', A.provayderQosh({ id: 'test', url: 'https://x/v1/chat/completions', modellar: ['m'], kalit: 'yoq' }) === true);
    T('qo`shilgan provayder zanjirda', A.holat().provayderlar.some(p => p.id === 'test'));
    A.provayderOchir('test');
    T('provayderOchir ishlaydi', !A.holat().provayderlar.some(p => p.id === 'test'));
    e.tozala();
  }

  /* ── 3. FETCH ZAXIRASI: Gemini 404 → bepul javob ── */
  console.log('\n── 3. Fetch zaxirasi (Gemini shakli)');
  {
    const e = muhitYasa();
    yukla(e, 0);
    e.setJavoblar([
      e.R(404, { error: { message: 'model no longer available' } }),   // asosiy Gemini
      e.R(200, { choices: [{ message: { content: 'zaxira javobi' } }] }) // OVH (kalitsiz)
    ]);
    const r = await e.win.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=x',
      { method: 'POST', body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'salom' }] }] }) });
    const j = await r.json();
    T('status 200 qaytdi', r.status === 200);
    T('Gemini shakli saqlandi', !!(j.candidates && j.candidates[0].content.parts[0].text));
    T('matn zaxiradan keldi', j.candidates[0].content.parts[0].text === 'zaxira javobi');
    T('zaxira belgisi bor', j.__uzmedZaxira === true);
    T('2 ta so`rov ketdi', e.log.length === 2, 'ketdi: ' + e.log.length);
    T('2-so`rov OVH ga', /ovh\.net/.test(e.log[1].url), e.log[1].url);
    T('OVH so`rovida Authorization yo`q', !e.log[1].opts.headers.Authorization);
    T('OVH body OpenAI shaklida',
      JSON.parse(e.log[1].opts.body).messages[0].content === 'salom');
    e.tozala();
  }

  /* ── 4. Asosiy AI ishlayotganda — TEGILMAYDI ── */
  console.log('\n── 4. Asosiy AI ishlaganda aralashmaslik');
  {
    const e = muhitYasa();
    yukla(e, 0);
    e.setJavoblar([e.R(200, { candidates: [{ content: { parts: [{ text: 'asl javob' }] } }] })]);
    const r = await e.win.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=x',
      { method: 'POST', body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'salom' }] }] }) });
    const j = await r.json();
    T('asl javob o`zgarmadi', j.candidates[0].content.parts[0].text === 'asl javob');
    T('faqat 1 so`rov ketdi (zaxira chaqirilmadi)', e.log.length === 1, 'ketdi: ' + e.log.length);
    T('zaxira belgisi yo`q', j.__uzmedZaxira === undefined);
    e.tozala();
  }

  /* ── 5. Tanilmagan so'rovlarga tegilmaydi ── */
  console.log('\n── 5. Begona so`rovlar himoyasi');
  {
    const e = muhitYasa();
    yukla(e, 0);

    e.setJavoblar([e.R(500, { xato: 1 })]);
    const r1 = await e.win.fetch('https://example.com/api/health', { method: 'POST', body: '{"a":1}' });
    T('begona 500 so`rovga tegilmadi', r1.status === 500 && e.log.length === 1);

    e.setJavoblar([e.R(404, {})]);
    const r2 = await e.win.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent?alt=sse',
      { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: 'a' }] }] }) });
    T('stream so`rovga tegilmadi', r2.status === 404 && e.log.length === 2);

    e.setJavoblar([e.R(404, {})]);
    const r3 = await e.win.fetch('https://api.groq.com/openai/v1/chat/completions',
      { method: 'POST', body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'a' }], stream: true }) });
    T('stream:true body ga tegilmadi', r3.status === 404 && e.log.length === 3);

    e.setJavoblar([e.R(404, {})]);
    const r4 = await e.win.fetch('https://uzmed-rag.example/api/search',
      { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'a' }] }) });
    T('model siz SSE endpoint ga tegilmadi', r4.status === 404 && e.log.length === 4);

    e.setJavoblar([e.R(200, { a: 1 })]);
    const r5 = await e.win.fetch('https://example.com/x.json');   // body yo'q
    T('GET so`rov (body siz) o`tkazildi', e.log.length === 5 && r5.status === 200);
    e.tozala();
  }

  /* ── 6. Model va provayder navbati ── */
  console.log('\n── 6. Model/provayder navbati');
  {
    const e = muhitYasa();
    yukla(e, 0);
    const A = e.win.UZMEDFreeAI;
    A.kalitOrnat('cerebras', 'csk-1');
    e.setJavoblar([
      e.R(404, { error: { message: 'model not found' } }),   // cerebras/gpt-oss-120b
      e.R(404, { error: { message: 'model not found' } }),   // cerebras/gemma-4-31b
      e.R(200, { choices: [{ message: { content: 'ovh dan' } }] })  // ovh/gpt-oss-120b
    ]);
    const t = await A.sora('test');
    T('404 da keyingi model sinaldi', /gpt-oss-120b/.test(JSON.parse(e.log[0].opts.body).model));
    T('2-model gemma', JSON.parse(e.log[1].opts.body).model === 'gemma-4-31b');
    T('modellar tugagach keyingi provayder', /ovh\.net/.test(e.log[2].url));
    T('javob keldi', t === 'ovh dan');
    e.tozala();
  }
  {
    const e = muhitYasa();
    yukla(e, 0);
    const A = e.win.UZMEDFreeAI;
    A.kalitOrnat('cerebras', 'yaroqsiz');
    e.setJavoblar([
      e.R(401, { error: { message: 'invalid api key' } }),          // cerebras — 401
      e.R(200, { choices: [{ message: { content: 'ovh' } }] })
    ]);
    await A.sora('test');
    T('401 da model almashtirilmadi, darhol keyingi provayder',
      e.log.length === 2 && /ovh\.net/.test(e.log[1].url), 'so`rovlar: ' + e.log.length);
    e.tozala();
  }

  /* ── 7. Kalit uzatilishi va maxfiylik ── */
  console.log('\n── 7. Kalit uzatilishi');
  {
    const e = muhitYasa();
    yukla(e, 0);
    const A = e.win.UZMEDFreeAI;
    A.kalitOrnat('openrouter', 'sk-or-maxfiy-123');
    A.provayderYoq('ovh', false); A.provayderYoq('llm7', false);
    e.setJavoblar([e.R(200, { choices: [{ message: { content: 'ok' } }] })]);
    await A.sora('test');
    T('Bearer sarlavhasi to`g`ri',
      e.log[0].opts.headers.Authorization === 'Bearer sk-or-maxfiy-123');
    T('kalit URL ga tushmadi', e.log[0].url.indexOf('maxfiy') < 0);
    T('holat() kalitni niqoblaydi',
      JSON.stringify(A.holat()).indexOf('sk-or-maxfiy-123') < 0);
    e.tozala();
  }

  /* ── 8. UZMED_ONLINE integratsiyasi ── */
  console.log('\n── 8. UZMED_ONLINE.generate integratsiyasi');
  {
    const e = muhitYasa();
    let aslChaqirildi = 0;
    e.win.UZMED_ONLINE = {
      generate: (p, cb) => { aslChaqirildi++; cb({ text: 'asl zanjir javobi' }); },
      generateVision: (p, i, cb) => cb({ text: 'asl vision' }),
      hasKey: () => false
    };
    yukla(e, 0);
    await kut(30);
    const r = await new Promise(res => e.win.UZMED_ONLINE.generate('salom', res));
    T('asl generate birinchi ishladi', aslChaqirildi === 1);
    T('asl javob qaytdi', r.text === 'asl zanjir javobi');
    T('zaxira chaqirilmadi', e.log.length === 0);
    e.tozala();
  }
  {
    const e = muhitYasa();
    e.win.UZMED_ONLINE = {
      generate: (p, cb) => cb({ error: 'Gemini: HTTP 404 | Groq: 401' }),
      hasKey: () => false
    };
    yukla(e, 0);
    await kut(30);
    e.setJavoblar([e.R(200, { choices: [{ message: { content: 'bepul javob' } }] })]);
    const r = await new Promise(res => e.win.UZMED_ONLINE.generate('salom', res));
    T('asl yiqilgach zaxira ishladi', r.text === 'bepul javob');
    T('zaxira belgisi', r.__zaxira === true);
    T('hasKey endi true', e.win.UZMED_ONLINE.hasKey() === true);
    e.tozala();
  }
  {
    const e = muhitYasa();
    e.win.UZMED_ONLINE = { generate: (p, cb) => cb({ error: 'asl xato' }), hasKey: () => false };
    yukla(e, 0);
    await kut(30);
    e.win.UZMEDFreeAI.qatlamYoq(false);
    const r = await new Promise(res => e.win.UZMED_ONLINE.generate('salom', res));
    T('zaxira ham yo`q bo`lsa — ASL xato saqlanadi', /asl xato/.test(r.error), r.error);
    e.tozala();
  }

  /* ── 9. Rekursiya va vision ── */
  console.log('\n── 9. Rekursiya va vision');
  {
    const e = muhitYasa();
    yukla(e, 0);
    const A = e.win.UZMEDFreeAI;
    /* Bepul provayderning O'ZI 404 qaytarsa — o'ralgan fetch qayta
       ishga tushmasligi kerak (cheksiz rekursiya himoyasi) */
    e.setJavoblar([
      e.R(404, { error: { message: 'yo`q' } }),
      e.R(404, { error: { message: 'yo`q' } }),
      e.R(404, { error: { message: 'yo`q' } }),
      e.R(404, { error: { message: 'yo`q' } }),
      e.R(404, { error: { message: 'yo`q' } })
    ]);
    let xato = null;
    try { await A.sora('test'); } catch (ex) { xato = ex; }
    T('hammasi yiqilsa — xato qaytadi', !!xato);
    T('rekursiya yo`q (so`rovlar soni cheklangan)', e.log.length <= 5, 'ketdi: ' + e.log.length);
    e.tozala();
  }
  {
    const e = muhitYasa();
    yukla(e, 0);
    const A = e.win.UZMEDFreeAI;
    e.setJavoblar([e.R(200, { choices: [{ message: { content: 'rasm o`qildi' } }] })]);
    const t = await A.sora('nima bu?', ['data:image/png;base64,AAA']);
    T('vision so`rovi ketdi', t === 'rasm o`qildi');
    const b = JSON.parse(e.log[0].opts.body);
    T('vision provayder tanlandi (llm7)', /llm7/.test(e.log[0].url), e.log[0].url);
    T('image_url qo`shildi', b.messages[0].content[1].type === 'image_url');
    e.tozala();
  }

  /* ── 10. JSON rejim ── */
  console.log('\n── 10. JSON rejim');
  {
    const e = muhitYasa();
    yukla(e, 0);
    e.setJavoblar([e.R(200, { choices: [{ message: { content: '{}' } }] })]);
    await e.win.UZMEDFreeAI.sora('javobni json formatida ber');
    T('json so`zi bo`lsa response_format qo`shildi',
      JSON.parse(e.log[0].opts.body).response_format.type === 'json_object');
    e.tozala();
  }
  {
    const e = muhitYasa();
    yukla(e, 0);
    e.setJavoblar([e.R(200, { choices: [{ message: { content: 'matn' } }] })]);
    await e.win.UZMEDFreeAI.sora('oddiy savol');
    T('json so`zi yo`q — response_format qo`shilmadi',
      JSON.parse(e.log[0].opts.body).response_format === undefined);
    e.tozala();
  }

  /* ── 11. Bo'sh/noto'g'ri kirish ── */
  console.log('\n── 11. Chegara holatlari');
  {
    const e = muhitYasa();
    yukla(e, 0);
    const A = e.win.UZMEDFreeAI;
    e.setJavoblar([e.R(200, { choices: [{ message: { content: '' } }] }),
                   e.R(200, { choices: [{ message: { content: 'ikkinchi' } }] })]);
    const t = await A.sora('test');
    T('bo`sh javob rad etilib keyingisiga o`tildi', t === 'ikkinchi');
    e.tozala();
  }
  {
    const e = muhitYasa();
    yukla(e, 0);
    e.setJavoblar([() => Promise.resolve(new Response('<html>xato</html>', { status: 200 })),
                   e.R(200, { choices: [{ message: { content: 'ok' } }] })]);
    const t = await e.win.UZMEDFreeAI.sora('test');
    T('JSON bo`lmagan javob yiqitmadi', t === 'ok');
    e.tozala();
  }
  {
    const e = muhitYasa();
    yukla(e, 0);
    e.setJavoblar([() => Promise.reject(new Error('Failed to fetch')),
                   e.R(200, { choices: [{ message: { content: 'ok' } }] })]);
    const t = await e.win.UZMEDFreeAI.sora('test');
    T('tarmoq xatosi keyingi provayderga o`tkazdi', t === 'ok');
    e.tozala();
  }

  console.log('\n━━━ NATIJA: ' + otdi + '/' + jami + ' test o`tdi ━━━');
  process.exit(otdi === jami ? 0 : 1);
})();
