// R88: node tools/leakcheck.mjs — the repository is public (GitHub Pages):
// no secret and no club member's data may ever be committed here.
// Fails (exit 1) on: a Telegram bot token, API keys (Anthropic/OpenAI,
// Google, GitHub, AWS), private keys, database URLs with a password,
// Kazakhstan phone numbers other than the club's own, IIN-like numbers,
// personal e-mail addresses, and data tables pasted into the code (a list of
// people with payments). Matches are printed masked.
import { execSync } from 'child_process';
import fs from 'fs';

const BRAND_PHONES = new Set(['77024035036', '77000000000', '77010000000']); // BS WhatsApp (bxclub.kz), placeholders
const BRAND_MAIL = /@(bxclub\.kz|business\.surgery|example\.(com|kz|org))$|^business\.hirurgiya@gmail\.com$|^noreply@/i;
const BIN = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|wav|ogg|webm|pdf|gz|zip)$/i;

const checks = [
  ['Telegram bot token', /\d{8,10}:AA[A-Za-z0-9_-]{33}/g],
  ['API key', /\bsk-(?:ant-|proj-|or-)?[A-Za-z0-9_-]{24,}|\bAIza[0-9A-Za-z_-]{35}|\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{20,}/g],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['database URL with a password', /postgres(?:ql)?:\/\/[^:\s"'/@]+:[^@\s"'$]{8,}@/g],
  ['data table (name, money…)', /\[\s*["'][^"'\n]{2,40}["']\s*,\s*\d{5,}\s*,\s*\d+\s*,\s*\d+\s*,/g],
  ['seed list of people', /(?:var|let|const)\s+(?:RESIDENTS|RESIDENTS_BACKUP|FINES|PAYMENTS|LEADS|DEBET|NETWORKING_SEED)\s*=\s*\[\s*[\[{"']/g],
];
const phoneRe = /(?:^|[^\d\w])((?:\+7|8)[\s\-(]*7\d{2}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|77\d{9})(?!\d)/g;
const mailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g;
const iinRe = /(?:^|[^\d.\-:/A-Za-z_])(\d{12})(?![\d.\-:/A-Za-z_])/g;

const mask = s => s.length <= 10 ? '*'.repeat(s.length) : s.slice(0, 4) + '…(' + s.length + ')…' + s.slice(-2);
const iinLike = s => {
  const mm = +s.slice(2, 4), dd = +s.slice(4, 6), c = +s[6];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || c < 1 || c > 6) return false;
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  let k = w1.reduce((a, w, i) => a + w * +s[i], 0) % 11;
  if (k === 10) { k = w2.reduce((a, w, i) => a + w * +s[i], 0) % 11; if (k === 10) return false; }
  return k === +s[11];
};

const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(f => f && !BIN.test(f) && !f.startsWith('node_modules/') && f !== 'package-lock.json');
const found = [];
for (const f of files) {
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (src.slice(0, 8000).includes('\0')) continue;
  const line = i => src.slice(0, i).split('\n').length;
  for (const [kind, re] of checks) for (const m of src.matchAll(re)) found.push(`${f}:${line(m.index)}: ${kind}: ${mask(m[0])}`);
  for (const m of src.matchAll(phoneRe)) {
    let d = m[1].replace(/\D/g, ''); if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (!BRAND_PHONES.has(d)) found.push(`${f}:${line(m.index)}: phone: ${d.slice(0, 4)}*****${d.slice(-2)}`);
  }
  for (const m of src.matchAll(mailRe)) {
    const e = m[0];
    if (BRAND_MAIL.test(e) || /\.(png|jpe?g|svg|webp|js|css)$/i.test(e) || /@\d/.test(e)) continue;
    if (/@(gmail|mail|yandex|inbox|list|bk|icloud|outlook|hotmail)\./i.test(e)) found.push(`${f}:${line(m.index)}: personal e-mail: ${e.slice(0, 2)}***@${e.split('@')[1]}`);
  }
  for (const m of src.matchAll(iinRe)) if (iinLike(m[1])) found.push(`${f}:${line(m.index)}: IIN-like number: ${m[1].slice(0, 2)}********${m[1].slice(10)}`);
}
if (found.length) {
  console.error('Утечка данных: этого не должно быть в публичном репозитории\n' + found.join('\n'));
  process.exit(1);
}
console.log(`leakcheck: ${files.length} files clean`);
