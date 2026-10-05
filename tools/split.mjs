// Раскладка кода приложения по модулям: node tools/split.mjs tools/coverage.json > src/split.json
// tools/coverage.json: какие функции вызывались на старте каждой роли и при открытии каждого раздела
// (Playwright-прогон по ролям и разделам с Profiler.takePreciseCoverage: ключи first/idle/warmFirst/warmIdle/page:<id>).
// Снимать заново стоит после крупных переделок экранов; без этого новые функции просто остаются в ядре.
// Правило: всё, что работает на старте любой роли, и мелочь до 200 символов остаются в ядре.
// Остальное уходит в модуль по разделам, где функция работает или откуда на неё ссылаются.
// Функции, которых нет в split.json, сборка оставляет в ядре: новый код по умолчанию грузится сразу.
import fs from 'fs';
import * as acorn from 'acorn';
import { extractMain } from './html.mjs';

const AREA = {
  admin: ['dashboard', 'schedule', 'reports', 'fines', 'crm', 'visits', 'restasks', 'content', 'custdev', 'wheeladmin', 'subscribers', 'todos', 'more'],
  res: ['home', 'myboard', 'mytasks', 'mymeetings', 'mystatus', 'myprofile', 'referral', 'wheel', 'residents'],
  lead: ['about', 'diagnostic', 'leadrazbor', 'rules'],
  guides: ['guides', 'guide', 'library', 'leadmagnets'],
};
const PAGE_AREA = {}; for (const [a, ps] of Object.entries(AREA)) ps.forEach(p => { PAGE_AREA[p] = a; });
const SMALL = 200;

const html = fs.readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const cov = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { js, bodyHtml } = extractMain(html);
const ast = acorn.parse(js, { ecmaVersion: 'latest' });
const fns = ast.body.filter(s => s.type === 'FunctionDeclaration');
const count = {}; fns.forEach(f => { count[f.id.name] = (count[f.id.name] || 0) + 1; });
const text = f => js.slice(f.start, f.end);
const re = n => new RegExp('(^|[^A-Za-z0-9_$])' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])', 'g');
// по имени (смещения в покрытии устаревают при любой правке исходника)
const declared = new Set(fns.map(f => f.id.name));
const names = keys => new Set((keys || []).map(k => k.split('@')[0]).filter(n => declared.has(n)));

const core = new Set();
for (const r of Object.keys(cov)) for (const k of ['first', 'idle', 'warmFirst', 'warmIdle']) names(cov[r][k]).forEach(n => core.add(n));
fns.forEach(f => { if (f.end - f.start < SMALL || count[f.id.name] > 1) core.add(f.id.name); });

// где функция работала
const obs = {}; const pageFns = {};
for (const r of Object.keys(cov)) for (const k of Object.keys(cov[r])) {
  if (!k.startsWith('page:')) continue;
  const p = k.slice(5); pageFns[p] = pageFns[p] || new Set();
  names(cov[r][k]).forEach(n => { pageFns[p].add(n); if (PAGE_AREA[p]) (obs[n] = obs[n] || new Set()).add(PAGE_AREA[p]); });
}
// кто на неё ссылается (код и разметка)
const all = js + '\n' + bodyHtml;
const refs = {}; const dead = [];
const pages = [...bodyHtml.matchAll(/<div class="page[^"]*" id="page-([a-z0-9]+)"/g)].map(m => [m.index, m[1]]);
const pagesEnd = (() => { const i = bodyHtml.indexOf('id="page-rules"'); const j = bodyHtml.indexOf('\n</div>', i); return j; })();
for (const f of fns) {
  const n = f.id.name; const rx = re(n);
  const total = (all.match(rx) || []).length;
  if (total <= 1 && !core.has(n)) { dead.push(n); continue; }
  const from = new Set();
  const rx1 = new RegExp(rx.source);
  for (const g of fns) if (g !== f && rx1.test(text(g))) from.add(g.id.name);
  // разметка: раздел, где стоит onclick
  for (const m of bodyHtml.matchAll(rx)) {
    let p = null; for (const [st, id] of pages) if (st <= m.index) p = id;
    if (m.index < pagesEnd && p && PAGE_AREA[p]) from.add('@html:' + PAGE_AREA[p]);   // окна (modal) вне разделов: не говорят о разделе
  }
  refs[n] = from;
}
// всё, что прямо вызывают старт и загрузка данных (смена роли, глубокие ссылки): иначе первый экран ждал бы модуль
const STARTUP = ['init', 'loadAllData'];
for (const f of fns) if (STARTUP.includes(f.id.name)) for (const g of fns) if (g !== f && new RegExp(re(g.id.name).source).test(text(f))) core.add(g.id.name);
// общие помощники навигации и разметки (работают в разделах трёх и более областей) тоже в ядре
fns.forEach(f => { if (obs[f.id.name] && obs[f.id.name].size >= 3) core.add(f.id.name); });
const lazy = fns.map(f => f.id.name).filter(n => !core.has(n) && !dead.includes(n));
const area = {}; lazy.forEach(n => { area[n] = new Set(obs[n] || []); });
for (let it = 0; it < 20; it++) {
  let changed = false;
  for (const n of lazy) {
    const before = area[n].size;
    for (const g of refs[n]) {
      if (g.startsWith('@html:')) area[n].add(g.slice(6));
      else if (area[g]) area[g].forEach(a => area[n].add(a));
    }
    if (area[n].size !== before) changed = true;
  }
  if (!changed) break;
}
// одна область: её модуль; несколько: shared; ни одной (не работала в разделах, ссылки только из ядра или окон): extra
const fn = {};
for (const n of lazy) { const a = [...area[n]]; fn[n] = a.length === 1 ? a[0] : a.length ? 'shared' : 'extra'; }
const modules = ['shared', 'admin', 'res', 'lead', 'guides', 'extra'];
const pagesOut = {};
for (const p of Object.keys(PAGE_AREA)) {
  const s = new Set();   // только то, что раздел вызывает при открытии: стартовые разделы не ждут модулей
  (pageFns[p] || new Set()).forEach(n => { if (fn[n]) s.add(fn[n]); });
  pagesOut[p] = modules.filter(m => s.has(m));
}
const rolePages = { admin: Object.keys(PAGE_AREA), resident: [...AREA.res, ...AREA.lead, ...AREA.guides], lead: [...AREA.lead, ...AREA.guides] };
const roles = {}; for (const [r, ps] of Object.entries(rolePages)) { const s = new Set(['shared', 'extra']); ps.forEach(p => pagesOut[p].forEach(m => s.add(m))); roles[r] = modules.filter(m => s.has(m)); }
const size = {}; for (const f of fns) { const m = fn[f.id.name] || (dead.includes(f.id.name) ? 'dead' : 'core'); size[m] = (size[m] || 0) + f.end - f.start; }
process.stderr.write('sizes ' + JSON.stringify(size) + '\n');
const sorted = Object.fromEntries(Object.keys(fn).sort().map(k => [k, fn[k]]));
process.stdout.write(JSON.stringify({ note: 'tools/split.mjs: функции, которых здесь нет, остаются в ядре', modules, pages: pagesOut, roles, dead: dead.sort(), fn: sorted }, null, 1) + '\n');
