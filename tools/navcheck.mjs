// R99: нижнее меню Mini App (#bnav) не пропадает при листании. node tools/navcheck.mjs
// Проверка по исходнику (src/app.html) и собранному dist/index.html, без браузера:
//  1. #bnav: прямой ребёнок body, вне листаемого контейнера #bsScroll; страницы и шапка внутри него.
//  2. Документ не листается (html, body overflow:hidden), листается только #bsScroll.
//  3. Ни одно CSS-правило не скрывает и не сдвигает меню (display/visibility/opacity/transform/top/position),
//     кроме одного: html.bs-typing .bnav { display: none } (в фокусе поле ввода).
//  4. У html и body нет transform/filter/perspective/will-change/contain (они ломают position:fixed).
//  5. Скрипт не трогает стиль и классы меню; класс bs-typing ставит только bsTypingSync; документ не листается из кода.
//  6. Свайп вниз не тянет окно Telegram: disableVerticalSwipes в init и в заглушке до загрузки telegram-web-app.js.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractMain } from './html.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'src/app.html'), 'utf8');
const { css, js, bodyHtml } = extractMain(html);
const fails = [];
const ok = (name, cond, extra) => { if (!cond) fails.push(name + (extra ? ': ' + extra : '')); };

// ── 1. Разметка ──
const NAV = '<nav class="bnav" id="bnav"></nav>';
const OPEN = '<div id="bsScroll">', CLOSE = '</div><!-- /bsScroll -->';
ok('меню #bnav в разметке ровно один раз', bodyHtml.split(NAV).length === 2);
const iOpen = bodyHtml.indexOf(OPEN), iClose = bodyHtml.indexOf(CLOSE), iNav = bodyHtml.indexOf(NAV);
ok('есть листаемый контейнер #bsScroll', iOpen >= 0 && iClose > iOpen);
const divDepth = s => (s.match(/<div\b/g) || []).length - (s.match(/<\/div>/g) || []).length;
if (iOpen >= 0 && iClose > iOpen) {
  ok('#bsScroll закрывается там, где помечено (div сбалансированы)', divDepth(bodyHtml.slice(iOpen, iClose + CLOSE.length)) === 0, String(divDepth(bodyHtml.slice(iOpen, iClose + CLOSE.length))));
  ok('шапка и страницы внутри #bsScroll', ['<div class="header">', 'id="page-dashboard"', 'id="page-home"'].every(m => { const i = bodyHtml.indexOf(m); return i > iOpen && i < iClose; }));
}
ok('меню вне #bsScroll и вне любого div (прямой ребёнок body)', iNav > iClose && divDepth(bodyHtml.slice(0, iNav)) === 0);

// ── CSS: правила (без @keyframes), селекторы и объявления ──
const rules = [];
(function parse(src) {
  let i = 0;
  while (i < src.length) {
    const b = src.indexOf('{', i); if (b < 0) break;
    const sel = src.slice(i, b).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    let d = 1, j = b + 1; while (j < src.length && d) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; }
    const body = src.slice(b + 1, j - 1);
    if (/^@(media|supports|layer|container)/.test(sel)) parse(body);
    else if (!/^@/.test(sel)) rules.push({ sel, body: body.replace(/\/\*[\s\S]*?\*\//g, '') });
    i = j;
  }
})(css.replace(/\/\*[\s\S]*?\*\//g, ''));
const decl = (body, prop) => { const m = body.match(new RegExp('(?:^|[;\\s{])' + prop + '\\s*:\\s*([^;]+)', 'i')); return m ? m[1].trim() : null; };
const subject = s => { const parts = s.trim().split(/\s*[>+~]\s*|\s+/); return parts[parts.length - 1]; };

// ── 2. Документ не листается ──
const docRule = rules.find(r => r.sel.split(',').map(x => x.trim()).sort().join(',') === 'body,html' && decl(r.body, 'overflow') === 'hidden');
ok('html, body { overflow: hidden }', !!docRule);
ok('html, body { height: 100% }', !!docRule && decl(docRule.body, 'height') === '100%');
const sc = rules.find(r => r.sel === '#bsScroll');
ok('#bsScroll { overflow-y: auto }', !!sc && decl(sc.body, 'overflow-y') === 'auto');
rules.filter(r => r.sel.split(',').some(x => /^(html|body)$/.test(x.trim()))).forEach(r => {
  const ov = decl(r.body, 'overflow'), ovy = decl(r.body, 'overflow-y'), mh = decl(r.body, 'min-height');
  ok('html/body снова листаются (' + r.sel + ')', !(ov && ov !== 'hidden') && !(ovy && ovy !== 'hidden') && !mh, r.body.trim().slice(0, 120));
});

// ── 3. Правила, которые бьют в само меню ──
const ALLOWED_HIDE = 'html.bs-typing .bnav';
rules.forEach(r => r.sel.split(',').map(x => x.trim()).forEach(s => {
  const sub = subject(s);
  const hitsNav = /(^|[.#])bnav(?![-\w])/.test(sub) || /^nav(?![-\w])/.test(sub) || /^#bnav\b/.test(sub);
  if (!hitsNav) return;
  const disp = decl(r.body, 'display'), vis = decl(r.body, 'visibility'), op = decl(r.body, 'opacity'), pos = decl(r.body, 'position');
  if (s === ALLOWED_HIDE) { ok('html.bs-typing .bnav только display:none', r.body.trim().replace(/\s+/g, ' ') === 'display: none;'); return; }
  ok('правило скрывает меню: ' + s, !(disp && /none/.test(disp)) && !(vis && /hidden|collapse/.test(vis)) && !(op && parseFloat(op) < 0.5), r.body.trim().slice(0, 120));
  ok('правило сдвигает меню: ' + s, !decl(r.body, 'transform') && !decl(r.body, 'translate') && !decl(r.body, 'top') && !decl(r.body, 'margin-bottom') && !decl(r.body, 'animation') && !decl(r.body, 'will-change'), r.body.trim().slice(0, 120));
  ok('меню не position:fixed: ' + s, !pos || pos === 'fixed', pos);
  const bot = decl(r.body, 'bottom'); ok('меню не у нижнего края: ' + s, !bot || bot === 'var(--bs-nav-lift, 0px)', bot);
}));
ok('правило html.bs-typing .bnav на месте', rules.some(r => r.sel === ALLOWED_HIDE));
const base = rules.find(r => r.sel === '.bnav' && decl(r.body, 'position'));
ok('.bnav { position: fixed; bottom: var(--bs-nav-lift, 0px) }', !!base && decl(base.body, 'position') === 'fixed' && decl(base.body, 'bottom') === 'var(--bs-nav-lift, 0px)');

// ── 4. Предки меню: html и body ──
rules.forEach(r => r.sel.split(',').map(x => x.trim()).forEach(s => {
  if (!/^(html|body)([.#:\[][^\s>+~]*)?$/.test(s)) return;
  ['transform', 'filter', 'perspective', 'will-change', 'contain', 'backdrop-filter', '-webkit-backdrop-filter', 'translate', 'zoom'].forEach(p => {
    const v = decl(r.body, p); ok('у ' + s + ' есть ' + p + ' (ломает position:fixed у меню)', !v || v === 'none', v);
  });
}));

// ── 5. Скрипт ──
const bnVars = new Set(); (js.match(/(\w+)\s*=\s*document\.(getElementById\(\s*['"]bnav['"]\s*\)|querySelector\(\s*['"][#.]bnav['"]\s*\))/g) || []).forEach(m => bnVars.add(m.split('=')[0].trim()));
ok('скрипт трогает стиль/классы меню напрямую', !/(getElementById\(\s*['"]bnav['"]\s*\)|querySelector(All)?\(\s*['"][^'"]*[#.]bnav(?![-\w])[^'"]*['"]\s*\))\s*(\.\w+\s*)?\.(style|classList|className|hidden|remove\(|setAttribute|toggleAttribute|animate|replaceWith)/.test(js));
bnVars.forEach(v => ok('скрипт трогает ' + v + '.style/classList (это #bnav)', !new RegExp('\\b' + v + '\\.(style|classList|className|hidden|remove\\(|setAttribute|toggleAttribute|animate|replaceWith)').test(js)));
ok('класс bs-typing ставит только bsTypingSync', (js.match(/bs-typing/g) || []).length === 4 && /classList\.toggle\('bs-typing', !!on\)/.test(js), String((js.match(/bs-typing/g) || []).length));
const ts = js.slice(js.indexOf('function bsTypingSync('), js.indexOf('function bsTypingSync(') + 900);
ok('bsTypingSync: меню скрыто только при видимом поле ввода в фокусе', /var on = bsIsTextField\(a\) && a\.isConnected && a\.getClientRects\(\)\.length > 0;/.test(ts));
ok('focusout всегда возвращает меню (если фокус не ушёл в другое поле)', /addEventListener\('focusout', function\(e\)\{ bsTypingSync\(bsIsTextField\(e\.relatedTarget\) \? e\.relatedTarget : null\); \}/.test(js));
ok('документ не листается из кода (window.scrollTo только в 0)', !/window\.scrollTo\((?!0, 0\))/.test(js) && !/window\.scrollBy\(/.test(js), (js.match(/window\.scrollTo\((?!0, 0\))[^)]*\)/g) || []).join(' '));
ok('слушатель листания окна только один (возврат документа в 0)', (js.match(/window\.addEventListener\('scroll'/g) || []).length === 1);
ok('нет скрытия меню по направлению листания (scroll-слушатели не трогают #bnav)', !/addEventListener\('scroll'[\s\S]{0,400}bnav/.test(js));

// ── 6. Telegram ──
ok('init: disableVerticalSwipes()', /tg\.expand\(\);\s*try\{ if\(tg\.disableVerticalSwipes\) tg\.disableVerticalSwipes\(\); \}catch\(e\)\{\}/.test(js));
ok('заглушка до telegram-web-app.js: web_app_setup_swipe_behavior', /disableVerticalSwipes: function\(\)\{[^}]*web_app_setup_swipe_behavior', \{allow_vertical_swipe: false\}/.test(js));

// ── dist ──
const di = path.join(ROOT, 'dist/index.html');
if (fs.existsSync(di)) {
  const d = fs.readFileSync(di, 'utf8');
  const a = d.indexOf('id="bsScroll"'), t = d.indexOf('id="toast"'), n = d.indexOf('id="bnav"');
  ok('dist/index.html собран с #bsScroll и меню после него', a > 0 && t > a && n > t, [a, t, n].join(','));
  ok('dist/index.html: правило html.bs-typing', d.includes('html.bs-typing .bnav{display:none}'));
}

if (fails.length) { console.error('navcheck: ' + fails.length + ' проблем(ы) с нижним меню:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('navcheck: нижнее меню на месте (' + rules.length + ' CSS-правил проверено)');
