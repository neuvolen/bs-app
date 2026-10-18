// R107: шторки и формы Mini App работают над клавиатурой. node tools/sheetcheck.mjs  (npm ci; npx playwright install chromium)
// Браузер (Playwright Chromium, телефон 390×560 и 390×844) открывает собранный dist/index.html как админ, без сервера:
// пакет данных и ответы платформы подставляются здесь (выдуманные люди, публичный репозиторий), Telegram тоже свой.
// Каждая шторка открывается тем же путём, что и в приложении. Для каждого поля формы: фокус, затем «клавиатура»
// тремя способами: iPhone (visualViewport меньше, окно WebView прежнее), Android (окно меньше), Telegram сообщает
// меньшую высоту (viewport_changed). И окно Telegram, развёрнутое не полностью. Проверяется:
//  1. шторка целиком в видимой части экрана;
//  2. поле в фокусе видно (шторка долистала до него) и не закрыто прилипшей кнопкой;
//  3. главная кнопка формы видна, в видимой части и нажимается: elementFromPoint в её центре попадает в неё,
//     а не в меню #bnav, клавиатуру или соседний слой;
//  4. шторка без полей: последняя кнопка достижима листанием шторки;
//  5. календарь «Расписание» и список: у записи любого типа (офлайн, созвон на платформе, Google Meet, офлайн день,
//     мероприятие) есть «Встреча прошла» (у мероприятия «Мероприятие прошло»), «Перенести», «Написать резиденту»,
//     «Отменить встречу»; на главной «Ближайшая встреча» ведёт в тот же лист.
// Скриншоты провалов: SHEETCHECK_SHOTS=<папка>. Код выхода 1, если хоть одна проверка не прошла.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.BS_DIST || 'dist');
const SHOTS = process.env.SHEETCHECK_SHOTS || '';
let chromium;
try { ({ chromium } = await import('playwright')); } catch (e) { console.error('sheetcheck: нет playwright (npm ci, затем npx playwright install chromium)'); process.exit(1); }
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('sheetcheck: нет dist/index.html (node build.mjs)'); process.exit(1); }

// ── Выдуманные данные клуба: даты от сегодняшнего дня по Алматы ──
const ADMIN = 453800951;   // ADMIN_IDS в src/app.html
const DAY = 864e5;
const almaty = t => new Date(t + 5 * 3600e3);
const dmy = t => { const d = almaty(t); return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.' + d.getUTCFullYear(); };
const now = Date.now();
const NAMES = ['Резидент Альфа', 'Резидент Бета', 'Резидент Гамма', 'Резидент Дельта', 'Резидент Омега'];
const residents = NAMES.map((name, i) => ({
  name, paid: 125000, balance: 0, debtRenew: 0, fines: 0, debt: i === 0 ? 125000 : 0, tariff: 250000, dateIn: dmy(now - 40 * DAY), source: '',
  isFired: false, isExcluded: false, chatId: String(100001 + i), format: i % 2 ? 'Онлайн' : 'Офлайн', isAdmin: false,
  meetingsDone: 2, meetingsGranted: 12, meetingsLeft: 10, cyclesPaid: 12, cyclesUsed: 2, partner: '', note: '', months: 1, startDate: ''
}));
const D3 = dmy(now + 3 * DAY), D4 = dmy(now + 4 * DAY);
// Все типы записей расписания, какие присылает платформа (internal/club/bundle.go BundleMeeting)
const KINDS = [
  { kind: 'офлайн-встреча резидента', ev: { res: NAMES[0], date: D3, time: '10:00', place: 'Офис BS', link: 'Офис BS, Алматы', format: 'Офлайн' } },
  { kind: 'созвон на платформе', ev: { res: NAMES[1], date: D3, time: '12:00', place: '', link: '', format: 'Онлайн', call: 'https://app.bxclub.kz/call/sheetcheck0001' } },
  { kind: 'Google Meet', ev: { res: NAMES[3], date: D3, time: '14:00', place: '', link: 'https://meet.google.com/abc-defg-hij', format: 'Онлайн' } },
  { kind: 'офлайн-встреча без адреса', ev: { res: NAMES[2], date: D3, time: '16:00', place: '', link: '', format: 'Офлайн' } },
  { kind: 'офлайн день', ev: { res: 'Офлайн день', date: D3, time: '18:00', place: '', link: 'Офис BS, Алматы', format: 'Офлайн' } },
  { kind: 'мероприятие', ev: { res: '🎬 Бизнес-завтрак', date: D3, time: '20:00', place: '', link: 'https://example.com/event', format: 'Офлайн' } },
  { kind: 'созвон с гостем', ev: { res: NAMES[4], date: D4, time: '11:00', place: '', link: '', format: 'Онлайн', call: 'https://app.bxclub.kz/call/sheetcheck0002' } },
];
const schedule = KINDS.map((k, i) => Object.assign({ row: i + 1, name: k.ev.res, done: false }, k.ev));
const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'].map((name, idx) => ({
  idx, name, short: name.slice(0, 3), revenue: 500000, expenses: 200000, profit: 300000, dividends: 0, margin: 60, hasData: true, saldo: 300000, kassa: 300000, kassaStart: 0 }));
const cur = almaty(now).getUTCMonth();
const BUNDLE = {
  residents, logs: [], schedule, doneMeetings: [], adminProfiles: [], checklistSchedule: [], myAvatar: '', ts: now,
  fines: [{ row: 1, id: 1, name: NAMES[0], res: NAMES[0], kind: 'Не сдан отчёт', amount: 10000, date: dmy(now - 2 * DAY), status: 'Не оплатил', left: 10000 }],
  debet: { netProfit: 300000, residual: 300000, dividends: 0, unpaidFines: 10000, unpaidCount: 1 }, totalDebt: 135000,
  monthlyPL: { ok: true, kassa: 300000, currentMonthIdx: cur, months },
  wheelSummary: null, wheelAll: null, leads: { leads: [] }, problems: { problems: [], total: 0 }, resTasks: { tasks: [] }, smm: null,
  leadmagnets: { items: [] }, contentPlan: { items: [] },
  reportDay: { date: dmy(now), iso: '', label: '', closed: false, need: 5, done: 5, missing: [], rows: [] },
  ledger: { at: now, debt: 125000, fines: 10000, finesCount: 1, total: 135000, debtors: 1, residents: [{ name: NAMES[0], debt: 125000, finesOpen: 10000, total: 135000 }] },
};
function api(u, method) {
  const p = u.pathname.replace(/^\/api\/v1\/app\//, ''), a = u.searchParams.get('action') || '';
  if (p === 'bootstrap' || a === 'getBotCache' || a === 'getAll') return BUNDLE;
  if (a === 'getOfflineResidents') return { ok: true, residents: residents.map(r => ({ name: r.name, format: r.format })) };
  if (p === 'prefs') return { prefs: {} };
  if (p === 'events') return { items: [], updated: new Date(now).toISOString() };
  if (p === 'nav') return { aliases: [], blocks: [] };
  if (/^avatar\//.test(p)) return null;
  return { ok: true };
}

// ── Свой Telegram: WebApp с высотой окна и Telegram.WebView.receiveEvent, как у telegram-web-app.js ──
const FAKE_TG = `(function(){
  var hp = new URLSearchParams(location.hash.slice(1)), init = hp.get('tgWebAppData') || '', unsafe = {};
  new URLSearchParams(init).forEach(function(v, k){ unsafe[k] = v; if(/^[\\[{]/.test(v)){ try{ unsafe[k] = JSON.parse(v); }catch(e){} } });
  var h = {}, st = {height: 0, stable: 0, exp: true}, nop = function(){};
  function emit(n, a){ (h[n] || []).slice().forEach(function(f){ try{ f.call(W, a || {}); }catch(e){ setTimeout(function(){ throw e; }); } }); }
  var W = {initData: init, initDataUnsafe: unsafe, version: '8.0', platform: 'ios', themeParams: {}, colorScheme: 'dark',
    get isExpanded(){ return st.exp; }, get viewportHeight(){ return st.height || window.innerHeight; }, get viewportStableHeight(){ return st.stable || window.innerHeight; },
    safeAreaInset: {top: 0, bottom: 0, left: 0, right: 0}, contentSafeAreaInset: {top: 0, bottom: 0, left: 0, right: 0},
    ready: nop, expand: nop, close: nop, disableVerticalSwipes: nop, enableVerticalSwipes: nop, setHeaderColor: nop, setBackgroundColor: nop, setBottomBarColor: nop,
    onEvent: function(n, f){ (h[n] = h[n] || []).push(f); }, offEvent: function(n, f){ h[n] = (h[n] || []).filter(function(x){ return x !== f; }); },
    openLink: function(u){ window.__opened = u; }, openTelegramLink: function(u){ window.__opened = u; },
    showAlert: function(m, cb){ if(cb) cb(); }, showConfirm: function(m, cb){ if(cb) cb(true); }, showPopup: function(o, cb){ if(cb) cb('ok'); },
    BackButton: {isVisible: false, show: nop, hide: nop, onClick: nop, offClick: nop},
    MainButton: {show: nop, hide: nop, setText: nop, onClick: nop, offClick: nop, setParams: nop},
    HapticFeedback: {impactOccurred: nop, notificationOccurred: nop, selectionChanged: nop}};
  window.Telegram = {WebApp: W, WebView: {receiveEvent: function(n, d){
    if(n === 'viewport_changed'){ st.height = d.height; if(d.is_state_stable) st.stable = d.height; st.exp = !!d.is_expanded; emit('viewportChanged', {isStateStable: !!d.is_state_stable}); }
  }}};
})();`;

// Клавиатура iPhone: visualViewport ниже окна (окно WebView не меняется)
const VV_STUB = () => {
  window.__kb = 0;
  const real = window.visualViewport, fake = new EventTarget();
  const def = (k, f) => Object.defineProperty(fake, k, { get: f });
  def('height', () => Math.max(0, (real ? real.height : innerHeight) - window.__kb)); def('width', () => real ? real.width : innerWidth);
  def('offsetTop', () => 0); def('offsetLeft', () => 0); def('pageTop', () => 0); def('pageLeft', () => 0); def('scale', () => 1);
  if (real) real.addEventListener('resize', () => fake.dispatchEvent(new Event('resize')));
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true });
  window.__kbSet = px => { window.__kb = px; fake.dispatchEvent(new Event('resize')); };
};

// ── Шторки: как их открывает приложение (админ) ──
const pick = q => `(function(){ var b = document.querySelector('.add-menu-overlay ${q}'); if(!b) throw new Error('нет пункта ${q}'); b.click(); })()`;
const SHEETS = [
  ['«+» Быстрый ввод', `openQuickMenu()`],
  ['Приход и расход (из «+»)', `openQuickMenu()`, pick('[data-q="in"]')],
  ['Приход и расход: расход', `openQuickMenu()`, pick('[data-q="in"]'), `setPayType('expense')`],
  ['Приход и расход: оплата резидента', `openQuickMenu()`, pick('[data-q="in"]'),
    `(function(){ var s = document.getElementById('paySource'); for(var i = 0; i < s.options.length; i++){ if(/Трекинг/.test(s.options[i].value)){ s.selectedIndex = i; break; } } updatePayResidentVisibility(); })()`],
  ['Штраф (из «+»)', `openQuickMenu()`, pick('[data-q="fine"]')],
  ['Новый резидент (из «+»)', `openQuickMenu()`, pick('[data-q="res"]')],
  ['Мероприятие клуба (из «+»)', `openQuickMenu()`, pick('[data-q="event"]')],
  ['Встреча: что добавить', `openQuickMenu()`, pick('[data-q="meet"]')],
  ['Онлайн встреча', `openAddMenu()`, pick('[data-action="online"]')],
  ['Офлайн день', `openAddMenu()`, pick('[data-action="offline"]')],
  ['Мероприятие: тип', `openEventMenu()`],
  ['Мероприятие: создать (другое)', `openEventCreateModal('Другое')`],
  ['Перенести встречу', `openEditMeeting(${JSON.stringify(NAMES[0])}, ${JSON.stringify(D3)}, '10:00')`],
  ['Кто был на встрече', `onMeetingDoneClick('Офлайн день', ${JSON.stringify(D3)}, '18:00', false)`],
  ['Задача резиденту', `openAddResTaskModal()`],
  ['Цена нерешённого', `openProblemModal()`],
  ['Своя задача', `openOwnTaskModal()`],
  ['Пост в контент-план', `openContentModal()`],
  ['Публикация SMM', `openModal('smmModal')`],
  ['Встречи резидента', `openVisitEdit(${JSON.stringify(NAMES[0])})`],
  ['Лид', `openModal('leadModal')`],
  ['Оценка колеса', `openModal('wheelModal')`],
  ['Оси колеса', `openModal('axesEditorModal')`],
  ['Шаблон Stories', `openModal('storyTemplateModal')`],
  ['День в календаре', `calDayClick(${JSON.stringify(D3)})`],
  ['Сообщение резиденту', `v11compose({name: ${JSON.stringify(NAMES[1])}, chatId: '100002'})`],
  ['Запрос с полем (bsPrompt)', `bsPrompt('Комментарий', '', {multiline: true})`],
  ['Подтверждение (bsConfirm)', `bsConfirm('Встреча прошла?', '', 'Прошла')`],
  ['Перенос разбора', `v15ask('move')`],
  ['Отмена (v30ask)', `v30ask('Отменить?', 'Проверка', 'Отменить', true, function(){})`],
  ['Запись на диагностику', `openDiagnosticModal({})`],
  ['Чек-лист: изменить', `_openEditLeadmagnet({key: 'sheetcheck', title: 'Чек-лист', category: ''})`],
];

const res = []; let shotN = 0;
const check = (name, ok, extra) => { res.push(!!ok); if (!ok || process.env.SHEETCHECK_VERBOSE) console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra !== undefined && !ok ? ' ' + JSON.stringify(extra).slice(0, 300) : '')); };

// Состояние верхней шторки: видимая часть, шторка, поля, главная кнопка (всё в координатах окна)
const STATE = () => {
  const vis = el => { if (!el || !el.isConnected) return false; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const sheets = [...document.querySelectorAll('.modal-bg.show .modal, .add-menu-overlay .add-menu, .bs-ov > div')].filter(vis);
  const sh = sheets[sheets.length - 1];
  const vv = window.visualViewport, tg = window.Telegram && Telegram.WebApp;
  let top = vv ? vv.offsetTop : 0, bot = vv ? vv.offsetTop + vv.height : innerHeight;
  if (tg && tg.viewportHeight < bot) bot = tg.viewportHeight;
  if (tg && tg.isExpanded === false && tg.viewportStableHeight < bot) bot = tg.viewportStableHeight;
  if (!sh) return { none: true, top, bot };
  const R = r => [Math.round(r.top), Math.round(r.bottom)];
  const fields = [...sh.querySelectorAll('input, textarea, select')].filter(f => !/^(hidden|checkbox|radio)$/.test(f.type) && vis(f) && !f.disabled);
  const act = sh.querySelector('.modal-actions') || sh.querySelector('.bs-sheet-act');
  let prim = act ? (act.querySelector('.btn-primary, .v3-primary, .v15-danger, [data-ok], [data-s]') || act.querySelector('button')) : null;
  if (prim && !vis(prim)) prim = null;
  const hit = el => { if (!el) return null; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 20); const e = document.elementFromPoint(x, y); return { ok: !!e && (e === el || el.contains(e)), y: Math.round(y), at: e ? (e.id || e.tagName + '.' + String(e.className).slice(0, 24)) : null }; };
  return { top, bot, sheet: R(sh.getBoundingClientRect()), id: (sh.closest('[id]') || {}).id || '', fields: fields.length, hasAct: !!act, prim: prim ? { r: R(prim.getBoundingClientRect()), t: prim.textContent.trim().slice(0, 30), hit: hit(prim) } : null,
    scrollable: sh.scrollHeight > sh.clientHeight + 2 };
};

async function shot(p, name) { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, String(++shotN).padStart(3, '0') + '_' + name.replace(/[^\wа-яё]+/gi, '_').slice(0, 70) + '.png') }); }

async function openApp(b, w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Almaty', locale: 'ru-RU',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await ctx.addInitScript(VV_STUB);
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.host === 'neuvolen.github.io') {
      let f = u.pathname.replace(/^\/bs-app\/?/, '') || 'index.html';
      const fp = path.join(DIST, path.normalize(f));
      if (!fp.startsWith(DIST) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
      const ct = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }[path.extname(fp)] || 'application/octet-stream';
      return route.fulfill({ status: 200, headers: { 'content-type': ct, 'cache-control': 'no-store' }, body: fs.readFileSync(fp) });
    }
    if (u.host === 'telegram.org') return route.fulfill({ status: 200, headers: { 'content-type': 'application/javascript' }, body: FAKE_TG });
    if (/railway\.app$|bxclub\.kz$/.test(u.host) && u.pathname.startsWith('/api/')) {
      const j = api(u, route.request().method());
      if (j === null) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(j) });
    }
    return route.abort();
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  p.on('dialog', d => { errs.push('dialog ' + d.type() + ': ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  const user = JSON.stringify({ id: ADMIN, first_name: 'Админ', language_code: 'ru' });
  const init = new URLSearchParams({ auth_date: String(Math.floor(now / 1000)), query_id: 'AAHsheet', user, hash: '0'.repeat(64) }).toString();
  await p.goto('https://neuvolen.github.io/bs-app/#tgWebAppData=' + encodeURIComponent(init) + '&tgWebAppVersion=8.0&tgWebAppPlatform=ios', { waitUntil: 'commit' });
  for (let i = 0; i < 200; i++) { if (await p.evaluate(() => !!document.querySelector('#bnav button') && !!(window.cache && cache.schedule && cache.schedule.length) && !!window.Telegram).catch(() => false)) break; await p.waitForTimeout(100); }
  await p.waitForTimeout(800);
  return { ctx, p, errs };
}
const closeAll = p => p.evaluate(() => {
  try { if (document.activeElement) document.activeElement.blur(); } catch (e) { }
  document.querySelectorAll('.add-menu-overlay, .bs-ov').forEach(x => x.remove());
  document.querySelectorAll('.modal-bg.show').forEach(x => x.classList.remove('show'));
  try { closeDetail(); } catch (e) { }
});
const run = async (p, js) => { try { await p.evaluate('void (' + js + ')'); } catch (e) { return String(e.message || e).slice(0, 160); } return null; };
const tgView = (p, height, expanded, stable) => p.evaluate(a => Telegram.WebView.receiveEvent('viewport_changed', { height: a[0], is_expanded: a[1], is_state_stable: a[2] }), [height, expanded, stable]);

// Проверка одной открытой шторки в текущем состоянии экрана
async function assertSheet(p, label, wait) {
  await p.waitForTimeout(wait === undefined ? 400 : wait);
  const s = await p.evaluate(STATE);
  if (s.none) { check(label + ': шторка видна', false, s); await shot(p, label); return s; }
  const inView = s.sheet[0] >= s.top - 1 && s.sheet[1] <= s.bot + 1;
  check(label + ': шторка в видимой части экрана', inView, s);
  if (s.fields) {
    check(label + ': у формы есть прилипшая главная кнопка', !!s.prim, s);
    if (s.prim) {
      check(label + ': кнопка «' + s.prim.t + '» в видимой части', s.prim.r[0] >= s.top - 1 && s.prim.r[1] <= s.bot + 1, s);
      check(label + ': кнопка «' + s.prim.t + '» нажимается (elementFromPoint)', s.prim.hit.ok, s);
    }
  }
  if (!(inView && (!s.fields || (s.prim && s.prim.hit.ok && s.prim.r[1] <= s.bot + 1)))) await shot(p, label);
  return s;
}

async function sheetsPass(b, w, h) {
  const { ctx, p, errs } = await openApp(b, w, h);
  const KB = Math.min(300, h - 260);
  for (const [name, ...steps] of SHEETS) {
    await closeAll(p); await p.waitForTimeout(150);
    let err = null;
    for (const st of steps) { err = await run(p, st); if (err) break; await p.waitForTimeout(450); }
    const L = `${w}×${h} ${name}`;
    if (err) { check(L + ': открывается', false, err); continue; }
    const s0 = await assertSheet(p, L);
    if (s0.none) continue;
    // без полей: последняя кнопка достижима листанием шторки
    if (!s0.fields) {
      const last = await p.evaluate(() => {
        const sh = [...document.querySelectorAll('.modal-bg.show .modal, .add-menu-overlay .add-menu, .bs-ov > div')].pop();
        const bs = [...sh.querySelectorAll('button, a.btn')].filter(x => x.getClientRects().length); const el = bs[bs.length - 1]; if (!el) return { ok: true };
        sh.scrollTop = sh.scrollHeight; const r = el.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 18));
        return { ok: !!e && (e === el || el.contains(e)), t: el.textContent.trim().slice(0, 30), r: [Math.round(r.top), Math.round(r.bottom)], H: innerHeight };
      });
      check(L + ': последняя кнопка достижима листанием' + (last.t ? ' («' + last.t + '»)' : ''), last.ok, last);
      continue;
    }
    // каждое поле: фокус и клавиатура тремя способами
    const n = s0.fields;
    for (let i = 0; i < n; i++) {
      for (const kb of ['iPhone', 'Android', 'Telegram']) {
        const fl = await p.evaluate(i => {
          const sh = [...document.querySelectorAll('.modal-bg.show .modal, .add-menu-overlay .add-menu, .bs-ov > div')].pop();
          const f = [...sh.querySelectorAll('input, textarea, select')].filter(f => !/^(hidden|checkbox|radio)$/.test(f.type) && f.getClientRects().length && !f.disabled)[i];
          if (!f) return null; f.focus(); return (f.id || f.name || f.tagName) + (f.placeholder ? ' «' + f.placeholder.slice(0, 20) + '»' : '');
        }, i);
        if (!fl) break;
        if (kb === 'iPhone') await p.evaluate(px => window.__kbSet(px), KB);
        else if (kb === 'Android') await p.setViewportSize({ width: w, height: h - KB });
        else await tgView(p, h - KB, true, true);
        await p.waitForTimeout(280);
        const L2 = `${L} · поле ${i + 1}/${n} ${fl} · клавиатура ${kb}`;
        const s = await assertSheet(p, L2, 0);
        const f = await p.evaluate(a => {
          const el = document.activeElement; if (!el || !el.getBoundingClientRect) return { ok: false, why: 'фокус потерян' };
          const r = el.getBoundingClientRect(), y = r.top + Math.min(r.height / 2, 16), e = document.elementFromPoint(r.left + Math.min(r.width / 2, 60), y);
          return { ok: y >= a[0] && y <= a[1] && !!e && (e === el || el.contains(e) || (e.tagName === 'LABEL' && e.control === el)), y: Math.round(y), at: e ? (e.id || e.tagName) : null };
        }, [s.top, s.bot]);
        check(L2 + ': шторка долистала до поля, оно не закрыто кнопкой', f.ok, Object.assign(f, { top: s.top, bot: s.bot }));
        if (!f.ok) await shot(p, L2 + ' поле');
        // клавиатура убрана
        if (kb === 'iPhone') await p.evaluate(() => window.__kbSet(0));
        else if (kb === 'Android') await p.setViewportSize({ width: w, height: h });
        else await tgView(p, h, true, true);
        await p.waitForTimeout(120);
      }
    }
    await p.evaluate(() => { try { document.activeElement.blur(); } catch (e) { } });
    // окно Telegram развёрнуто не полностью: видно 60% высоты
    await tgView(p, Math.round(h * 0.6), false, true);
    await assertSheet(p, `${L} · окно Telegram не развёрнуто (${Math.round(h * 0.6)} из ${h})`);
    await tgView(p, h, true, true);
  }
  await closeAll(p);
  check(`${w}×${h}: без ошибок на странице`, !errs.length, errs);
  await ctx.close();
}

// «Встреча прошла» у записи любого типа: календарь (лист дня и «Все действия»), список, главная
async function meetingsPass(b) {
  const { ctx, p, errs } = await openApp(b, 390, 844);
  const NEED = ev => [/^🎬/.test(ev.res) ? 'Мероприятие прошло' : 'Встреча прошла', 'Перенести', 'Отменить встречу'].concat(/^🎬|^Офлайн день$/.test(ev.res) ? [] : ['Написать резиденту']);
  const detailBtns = () => p.evaluate(() => document.getElementById('detailView').classList.contains('show') ? [...document.querySelectorAll('#detailContent .btn')].map(x => x.textContent.trim()) : null);
  await p.evaluate(() => { navGo('meet'); }); await p.waitForTimeout(900);
  for (const mode of ['calendar', 'list']) {
    await closeAll(p);
    await p.evaluate(m => setScheduleView(m), mode); await p.waitForTimeout(600);
    for (let i = 0; i < KINDS.length; i++) {
      const k = KINDS[i], L = `Расписание (${mode === 'calendar' ? 'календарь' : 'список'}), ${k.kind}`;
      await closeAll(p); await p.waitForTimeout(150);
      if (mode === 'calendar') {
        await p.evaluate(d => calDayClick(d), k.ev.date); await p.waitForTimeout(500);
        const card = await p.evaluate(a => {
          const list = window._v94day || [], j = list.findIndex(e => e.res === a[0] && e.time === a[1]);
          const el = document.querySelector('#dayMeetsBody [data-dm="' + j + '"]'); if (!el) return { j };
          el.scrollIntoView({ block: 'center' });
          const b = el.querySelector('[data-dm-act="done"]'); let hit = false;
          if (b) { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); hit = !!e && (e === b || b.contains(e)); }
          return { j, done: b ? b.textContent.trim() : null, hit, btns: [...el.querySelectorAll('button')].map(x => x.textContent.trim()) };
        }, [k.ev.res, k.ev.time]);
        check(L + ': в листе дня кнопка «' + NEED(k.ev)[0] + '» и она нажимается', card.done === NEED(k.ev)[0] && card.hit, card);
        check(L + ': в листе дня «Перенести» и «Все действия»', !!card.btns && card.btns.includes('Перенести') && card.btns.some(t => /Все действия/.test(t)), card);
        if (card.j >= 0) { await p.evaluate(j => v94dayOpen(j), card.j); await p.waitForTimeout(500); }
      } else {
        const j = await p.evaluate(a => (window._currentScheduleList || []).findIndex(e => e.res === a[0] && e.time === a[1] && e.date === a[2]), [k.ev.res, k.ev.time, k.ev.date]);
        const hit = await p.evaluate(j => { const el = document.querySelector('[data-meetidx="' + j + '"]'); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; }, j);
        check(L + ': карточка в списке', hit, j);
        await p.waitForTimeout(500);
      }
      const btns = await detailBtns();
      const miss = btns ? NEED(k.ev).filter(t => !btns.includes(t)) : NEED(k.ev);
      check(L + ': лист встречи с ' + NEED(k.ev).map(t => '«' + t + '»').join(', '), !miss.length, { miss, btns });
      if (miss.length) await shot(p, L);
    }
  }
  // главная: «Ближайшая встреча» открывает тот же лист
  await closeAll(p);
  await p.evaluate(() => navGo('sum')); await p.waitForTimeout(700);
  const ok = await p.evaluate(() => { const c = document.getElementById('v22next'); if (!c) return false; c.click(); return true; });
  await p.waitForTimeout(500);
  const hb = await detailBtns();
  check('Главная: «Ближайшая встреча» открывает лист с «Встреча прошла»', ok && !!hb && hb.includes('Встреча прошла'), hb);
  // кнопка «Встреча прошла» из листа дня доводит дело до конца: онлайн спрашивает подтверждение, офлайн открывает список
  await closeAll(p); await p.evaluate(() => setScheduleView('calendar')); await p.waitForTimeout(300);
  await p.evaluate(d => calDayClick(d), D3); await p.waitForTimeout(400);
  await p.evaluate(a => { const j = window._v94day.findIndex(e => e.res === a); document.querySelector('#dayMeetsBody [data-dm="' + j + '"] [data-dm-act="done"]').click(); }, NAMES[1]);
  await p.waitForTimeout(500);
  const ask = await p.evaluate(() => { const m = document.getElementById('bsAsk'); return m ? m.innerText.replace(/\s+/g, ' ').slice(0, 80) : null; });
  check('Календарь: «Встреча прошла» у созвона спрашивает подтверждение', !!ask && /прошла/.test(ask), ask);
  await closeAll(p); await p.evaluate(d => calDayClick(d), D3); await p.waitForTimeout(400);
  await p.evaluate(() => { const j = window._v94day.findIndex(e => e.res === 'Офлайн день'); document.querySelector('#dayMeetsBody [data-dm="' + j + '"] [data-dm-act="done"]').click(); });
  await p.waitForTimeout(700);
  const att = await p.evaluate(() => document.getElementById('attendModal').classList.contains('show') && document.querySelectorAll('#attendList input').length);
  check('Календарь: «Встреча прошла» у офлайн дня открывает «Кто был на встрече»', !!att, att);
  await closeAll(p);
  check('Встречи: без ошибок на странице', !errs.length, errs);
  await ctx.close();
}

const b = await chromium.launch();
try {
  for (const [w, h] of [[390, 560], [390, 844]]) await sheetsPass(b, w, h);
  await meetingsPass(b);
} catch (e) { check('sheetcheck выполнился', false, String(e && e.stack || e).slice(0, 400)); }
await b.close();
const bad = res.filter(x => !x).length;
if (bad) { console.error(`sheetcheck: ${bad} из ${res.length} проверок не прошли`); process.exit(1); }
console.log(`sheetcheck: ${SHEETS.length} шторок и ${KINDS.length} типов встреч, ${res.length} проверок прошли`);
