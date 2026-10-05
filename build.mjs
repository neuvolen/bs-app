// Сборка Mini App: node build.mjs  (npm ci один раз: esbuild, acorn)
// src/app.html     исходник приложения (читаемый, правится только он)
// src/loader.html  загрузчик: dist/index.html и dist/app.html (старые загрузчики в кеше Telegram просят app.html)
// src/runtime.js   среда сборки: модули по требованию, Cache Storage, шрифт, сверка версии
// src/split.json   какие функции уходят в модули (tools/split.mjs по замеру покрытия); остальное в ядре
// dist/            то, что выкладывает GitHub Pages: version.json, s/<хеш>.html (ядро), m/<модуль>.<хеш>.js, f/, i/
// Сборка воспроизводима: одинаковые исходники дают одинаковые файлы и хеши.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';
import { extractMain } from './tools/html.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src'), DIST = path.join(ROOT, process.env.BS_DIST || 'dist');
const KEEP_BUILDS = 5;   // файлы прошлых сборок остаются: у кого открыта старая версия, её модули ещё догрузятся
const TARGET = 'es2020';
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const hash = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);
const gz = b => zlib.gzipSync(Buffer.from(b), { level: 9 }).length;
const minJs = code => esbuild.transformSync(code, { minify: true, charset: 'utf8', target: TARGET, legalComments: 'none' }).code;

const html = read('app.html');
const split = JSON.parse(read('split.json'));
const { css, js, head, bodyHtml } = extractMain(html);

// ── JS: ядро и модули ──
const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script' });
const decl = {}; ast.body.forEach(s => { if (s.type === 'FunctionDeclaration') decl[s.id.name] = (decl[s.id.name] || 0) + 1; });
const word = n => new RegExp('(^|[^A-Za-z0-9_$])' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])', 'g');
const MODS = split.modules;
const modSrc = MODS.map(() => []), modVars = MODS.map(() => []);
const out = []; let last = 0; const stats = { lazy: 0, dead: 0, kept: 0 };
const dead = new Set((split.dead || []).filter(n => {
  // мёртвая только если на неё по-прежнему никто не ссылается
  const c = (js.match(word(n)) || []).length + (bodyHtml.match(word(n)) || []).length;
  if (c > 1 || decl[n] !== 1) { console.warn('split.json: ' + n + ' снова используется, остаётся в ядре'); return false; }
  return true;
}));
for (const s of ast.body) {
  if (s.type !== 'FunctionDeclaration') continue;
  const n = s.id.name;
  if (dead.has(n)) { out.push(js.slice(last, s.start)); last = s.end; stats.dead++; continue; }
  const m = split.fn[n];
  if (!m || decl[n] !== 1 || s.generator) { stats.kept++; continue; }
  const i = MODS.indexOf(m);
  if (i < 0) throw new Error('неизвестный модуль ' + m);
  // function NAME(...){...} → "NAME": function(...){...}
  modSrc[i].push(JSON.stringify(n) + ':' + (s.async ? 'async function' : 'function') + js.slice(s.id.end, s.end));
  out.push(js.slice(last, s.start));
  out.push('function ' + n + '(){return __bsL(this,arguments,' + JSON.stringify(n) + ',' + i + ')}');
  last = s.end; stats.lazy++;
}
out.push(js.slice(last));
let coreJs = out.join('');

// Данные-константы (var X = {...} и т.п.), которыми пользуются только функции одного модуля, едут в этом модуле:
// ядро их не скачивает и не вычисляет на старте. В модуле они становятся глобальными var (как и были)
const lazyFn = new Set(Object.keys(split.fn).filter(n => decl[n] === 1 && !dead.has(n)));
const varMoves = [];
for (const s of ast.body) {
  if (s.type !== 'VariableDeclaration' || s.declarations.length !== 1 || s.end - s.start < 300) continue;
  const d = s.declarations[0]; if (d.id.type !== 'Identifier' || !d.init) continue;
  const n = d.id.name, rx = new RegExp(word(n).source);
  const mods = new Set(); let core = rx.test(bodyHtml);
  for (const t of ast.body) {
    if (t === s || core) continue;
    if (!rx.test(js.slice(t.start, t.end))) continue;
    if (t.type === 'FunctionDeclaration' && lazyFn.has(t.id.name)) mods.add(split.fn[t.id.name]);
    else if (!(t.type === 'FunctionDeclaration' && dead.has(t.id.name))) core = true;
  }
  if (core || mods.size !== 1) continue;
  const i = MODS.indexOf([...mods][0]);
  varMoves.push({ i, n, start: s.start, end: s.end, code: 'var ' + n + '=' + js.slice(d.init.start, d.init.end) + ';' });
}
for (const v of varMoves) {
  const src = js.slice(v.start, v.end);
  if (coreJs.split(src).length !== 2) throw new Error('var ' + v.n + ': не найдено в ядре однозначно');
  coreJs = coreJs.replace(src, '');
  modVars[v.i].push(v.code);
}

fs.mkdirSync(DIST, { recursive: true });
for (const d of ['s', 'm', 'f', 'i']) fs.mkdirSync(path.join(DIST, d), { recursive: true });
const files = [];
const write = (rel, data) => { fs.writeFileSync(path.join(DIST, rel), data); files.push(rel); };

const modFiles = MODS.map((m, i) => {
  // сначала регистрация функций, потом данные модуля (их выражения могут звать функции этого же модуля)
  const code = minJs('__bsD(' + i + ',{' + modSrc[i].join(',\n') + '});\n' + modVars[i].join('\n'));
  const rel = 'm/' + m + '.' + hash(code) + '.js';
  write(rel, code);
  return { rel, size: Buffer.byteLength(code), gz: gz(code), n: modSrc[i].length };
});

// ── шрифт и картинки ──
const FONTS = [
  { f: 'manrope-cyrillic-wght-normal.woff2', r: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  { f: 'manrope-latin-wght-normal.woff2', r: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
];
const fonts = FONTS.map(x => {
  const b = fs.readFileSync(path.join(SRC, 'assets', x.f));
  const rel = 'f/' + x.f.replace('-wght-normal.woff2', '') + '.' + hash(b) + '.woff2';
  write(rel, b);
  return { u: rel, r: x.r };
});
write('i/logo.png', fs.readFileSync(path.join(SRC, 'assets', 'logo.png')));

// ── CSS и разметка ──
const cssAll = esbuild.transformSync(css, { loader: 'css', minify: true, charset: 'utf8', target: ['chrome80', 'safari13'] }).code.trim();
// Мёртвые правила: класс или id из селектора не встречается нигде в коде и разметке (имена классов в приложении
// пишутся целиком; собирается из частей только page-<id>). Селекторы со скобками (:not(...) и т.п.) не трогаются
const cssDrop = { n: 0, bytes: 0 };
const cssText = js + bodyHtml + head;
const tokAlive = t => cssText.includes(t);
function pruneCss(c) {
  let out = '', i = 0;
  while (i < c.length) {
    const ob = c.indexOf('{', i); if (ob < 0) { out += c.slice(i); break; }
    const pre = c.slice(i, ob);
    // конец блока с учётом вложенности
    let depth = 1, j = ob + 1; for (; j < c.length && depth; j++) { if (c[j] === '{') depth++; else if (c[j] === '}') depth--; }
    const body = c.slice(ob + 1, j - 1);
    if (/^\s*@(media|supports)/.test(pre)) { const inner = pruneCss(body); if (inner.trim()) out += pre + '{' + inner + '}'; i = j; continue; }
    if (/^\s*@/.test(pre)) { out += pre + '{' + body + '}'; i = j; continue; }
    const keep = pre.split(',').filter(sel => /\(/.test(sel) || [...sel.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].every(m => tokAlive(m[1])));
    if (keep.length) out += keep.join(',') + '{' + body + '}';
    else { cssDrop.n++; cssDrop.bytes += j - i; }
    i = j;
  }
  return out;
}
const cssMin = pruneCss(cssAll);
// разметка: комментарии прочь, пробелы с переводом строки схлопываются в один (между строчными элементами пробел остаётся)
const squash = h => h.replace(/<!--(?!\/bs-shell)[\s\S]*?-->/g, '').replace(/[ \t]*\n\s*/g, '\n').replace(/\n+/g, '\n');
const headMin = squash(head).replace('<head>\n', '<head>');

// ── ядро: оболочка s/<хеш>.html ──
const runtime = read('runtime.js');
const manifestFor = shellRel => ({ v: '', shell: shellRel, mods: modFiles.map(x => x.rel), pages: Object.fromEntries(Object.entries(split.pages).map(([p, ms]) => [p, ms.map(m => MODS.indexOf(m))])), roles: Object.fromEntries(Object.entries(split.roles).map(([r, ms]) => [r, ms.map(m => MODS.indexOf(m))])), fonts });
// версия = хеш содержимого без самой версии
const shellFor = man => headMin + '<style>' + cssMin + '</style>\n</head>\n<body>' + squash(bodyHtml) + '<script>' +
  minJs(runtime.replace('/*BS_BUILD*/{}', JSON.stringify(man)) + '\n' + coreJs) + '</script>\n</body>\n</html>\n<!--/bs-shell-->';
const probe = shellFor(manifestFor(''));
const v = hash(probe);
const shellRel = 's/' + v + '.html';
const man = manifestFor(shellRel); man.v = v;
const shell = shellFor(man);
write(shellRel, shell);

// ── загрузчик, версия ──
const apiServer = (/const APP_SERVER = '([^']+)'/.exec(js) || [])[1];
if (!apiServer) throw new Error('нет APP_SERVER в src/app.html');
const loader = read('loader.html').replace(/<script>([\s\S]*?)<\/script>/, (m, code) => '<script>' +
  minJs(code.replace("'/*API*/'", JSON.stringify(apiServer)).replace('/*BUILT*/null', JSON.stringify({ v, shell: shellRel }))) + '</script>');
write('index.html', loader);
// старые загрузчики (до R44, могут жить в кеше Telegram) берут app.html и считают ответ короче 5000 символов ошибкой
const OLD_MIN = 6000;
const note = '<!-- app.html: загрузчик для старых загрузчиков из кеша Telegram, они не принимают ответ короче 5000 символов. ';
write('app.html', loader.length >= OLD_MIN ? loader : loader.replace('</body>', note + ' '.repeat(Math.max(0, OLD_MIN - loader.length - note.length - 4)) + '-->\n</body>'));
write('version.json', JSON.stringify({ v, shell: shellRel }) + '\n');
write('.nojekyll', '');

// ── прошлые сборки: их файлы остаются (KEEP_BUILDS), остальное удаляется ──
const bfile = path.join(DIST, 'builds.json');
let builds = []; try { builds = JSON.parse(fs.readFileSync(bfile, 'utf8')); } catch (e) {}
builds = builds.filter(b => b.v !== v); builds.unshift({ v, files: files.filter(f => /^[smf]\//.test(f)) });
builds = builds.slice(0, KEEP_BUILDS);
fs.writeFileSync(bfile, JSON.stringify(builds, null, 1) + '\n');
const keep = new Set(builds.flatMap(b => b.files));
for (const d of ['s', 'm', 'f']) for (const f of fs.readdirSync(path.join(DIST, d))) if (!keep.has(d + '/' + f)) fs.unlinkSync(path.join(DIST, d, f));

// ── отчёт ──
const kb = n => (n / 1024).toFixed(1) + ' КБ';
console.log('версия ' + v + ': функций в модулях ' + stats.lazy + ', данных в модулях ' + varMoves.map(x => x.n).join(' ') + ', убрано мёртвых функций ' + stats.dead + ', правил CSS ' + cssDrop.n + ' (' + kb(cssDrop.bytes) + ')');
console.log('ядро ' + shellRel + ': ' + kb(Buffer.byteLength(shell)) + ', gzip ' + kb(gz(shell)) + ' (CSS gzip ' + kb(gz(cssMin)) + ')');
modFiles.forEach((x, i) => console.log('модуль ' + MODS[i] + ': ' + x.n + ' функций, ' + kb(x.size) + ', gzip ' + kb(x.gz)));
console.log('загрузчик ' + kb(Buffer.byteLength(loader)) + ', gzip ' + kb(gz(loader)));
