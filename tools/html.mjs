// Разбор src/app.html: стили, основной скрипт, разметка. Общий для build.mjs и tools/split.mjs
export function extractMain(html) {
  const styles = [];
  let rest = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>\n?/g, (m, css) => { styles.push(css); return ''; });
  const scripts = [];
  rest = rest.replace(/<script>([\s\S]*?)<\/script>\n?/g, (m, js) => { scripts.push(js); return ''; });
  if (scripts.length !== 1) throw new Error('ожидался один встроенный скрипт, найдено ' + scripts.length);
  const bi = rest.indexOf('<body>');
  if (bi < 0) throw new Error('нет <body>');
  const head = rest.slice(0, bi), bodyHtml = rest.slice(bi + '<body>'.length).replace(/<\/body>\s*<\/html>\s*$/, '');
  return { css: styles.join('\n'), js: scripts[0], head, bodyHtml };
}
