// R44: среда собранного приложения (сборка вставляет её первой в основной скрипт, BS_BUILD подставляет build.mjs).
// Ядро приложения приходит сразу, редкие разделы лежат в модулях m/<имя>.<хеш>.js и грузятся при первом открытии.
// Вместо функции из модуля в ядре стоит заглушка: при вызове она подгружает модуль (из памяти, кеша или сети) и вызывает настоящую.
// Модули, шрифт и само приложение хранятся в Cache Storage (нет его: в localStorage): повторный запуск не качает ничего, кроме version.json.
var BS_BUILD = /*BS_BUILD*/{};
var __bsF = {}, __bsT = {}, __bsOk = {};
var __bsBoot = Date.now(), __bsTouched = false;
var __bsPerf = {core: window.performance ? Math.round(performance.now()) : 0};   // для замеров: начало ядра и конец init
var __bsCN = 'bs-app';
function bsBase(){ return location.href.split('#')[0].split('?')[0].replace(/[^\/]*$/, ''); }
function bsLs(k, v){
  try{
    if(v === undefined) return localStorage.getItem(k);
    if(v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  }catch(e){}
  return null;
}
function bsCache(){
  try{ if(window.caches && caches.open) return caches.open(__bsCN); }catch(e){}
  return Promise.reject(new Error('no cache'));
}
// Текст файла сборки: из Cache Storage, иначе из localStorage
function bsGet(path){
  return bsCache().then(function(c){ return c.match(bsBase() + path); }).then(function(r){ return r ? r.text() : null; })
    .catch(function(){ return null; })
    .then(function(t){ return t != null ? t : bsLs('bs_f:' + path); });
}
function bsPut(path, text, type){
  return bsCache().then(function(c){
    return c.put(bsBase() + path, new Response(text, {headers: {'Content-Type': type || 'application/javascript; charset=utf-8'}}));
  }).catch(function(){ if(typeof text === 'string' && text.length < 900000) bsLs('bs_f:' + path, text); });
}
function bsDrop(path){
  bsCache().then(function(c){ return c.delete(bsBase() + path); }).catch(function(){});
  bsLs('bs_f:' + path, null);
}

// ── Модули ──
function __bsD(i, o){ for(var k in o) __bsF[k] = o[k]; __bsOk[i] = 1; }
function __bsEval(i, t){ (0, eval)(t + '\n//# sourceURL=' + bsBase() + BS_BUILD.mods[i]); if(!__bsOk[i]) throw new Error('module ' + i); }
// Заглушка функции из модуля: модуль нужен прямо сейчас
function __bsL(self, args, name, i){
  var f = __bsF[name];
  if(!f){ (window.__bsSyncLog = window.__bsSyncLog || []).push(name); __bsSync(i); f = __bsF[name]; if(!f) throw new Error('bs: нет функции ' + name); }
  return f.apply(self, args);
}
function __bsSync(i){
  if(__bsOk[i]) return;
  var t = __bsT[i];
  if(t != null){ try{ __bsEval(i, t); return; }catch(e){ delete __bsT[i]; bsDrop(BS_BUILD.mods[i]); } }
  // модуля нет в памяти: синхронно из сети (бывает, только если раздел нажали раньше, чем он догрузился в фоне)
  var x = new XMLHttpRequest();
  x.open('GET', bsBase() + BS_BUILD.mods[i], false);
  x.send(null);
  if(x.status === 404) bsGone();
  if(x.status !== 200 && x.status !== 0) throw new Error('module ' + i + ': HTTP ' + x.status);
  __bsEval(i, x.responseText);
  bsPut(BS_BUILD.mods[i], x.responseText);
}
// Текст модуля: память → кеш → сеть (в кеш)
function bsFetchMod(i, fresh){
  if(__bsOk[i] || __bsT[i] != null) return Promise.resolve(true);
  var p = BS_BUILD.mods[i];
  return (fresh ? Promise.resolve(null) : bsGet(p)).then(function(t){
    if(t != null) return t;
    return fetch(bsBase() + p, fresh ? {cache: 'reload'} : {}).then(function(r){ if(r.status === 404) bsGone(); if(!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function(t){ bsPut(p, t); return t; });
  }).then(function(t){ __bsT[i] = t; return true; });
}
function bsMods(list){
  return Promise.all(list.map(function(i){ return bsFetchMod(i); })).then(function(){
    list.forEach(function(i){
      if(__bsOk[i]) return;
      try{ __bsEval(i, __bsT[i]); }
      catch(e){ delete __bsT[i]; bsDrop(BS_BUILD.mods[i]); throw e; }
    });
  }).catch(function(e){
    // испорченный кеш: один раз из сети
    return Promise.all(list.filter(function(i){ return !__bsOk[i]; }).map(function(i){ return bsFetchMod(i, true); }))
      .then(function(){ list.forEach(function(i){ if(!__bsOk[i]) __bsEval(i, __bsT[i]); }); });
  });
}
// Раздел открывается: его модули сначала. true: открытие отложено до загрузки
var __bsWait = {};
function bsNeedPage(id, then){
  var need = (BS_BUILD.pages[id] || []).filter(function(i){ return !__bsOk[i]; });
  if(!need.length) return false;
  var mem = need.filter(function(i){ return __bsT[i] == null; });
  if(!mem.length){ try{ need.forEach(function(i){ __bsEval(i, __bsT[i]); }); return false; }catch(e){} }
  if(__bsWait[id]) return true;
  __bsWait[id] = 1;
  var dot = document.getElementById('syncDot'); if(dot) dot.style.opacity = '0.9';
  document.documentElement.classList.add('bs-loading');
  bsMods(need).then(function(){
    delete __bsWait[id]; document.documentElement.classList.remove('bs-loading'); if(dot) dot.style.opacity = '0';
    then();
  }, function(){
    delete __bsWait[id]; document.documentElement.classList.remove('bs-loading'); if(dot) dot.style.opacity = '0';
    try{ showToast('Нет связи: раздел откроется, когда появится интернет'); }catch(e){}
  });
  return true;
}
// В фоне, после первого экрана: модули разделов этой роли в память (без выполнения); старые версии из кеша вон
function bsPrefetch(){
  var role = 'lead';
  try{ role = isRealAdmin ? 'admin' : (viewAs === 'resident' ? 'resident' : 'lead'); }catch(e){}
  var list = (BS_BUILD.roles[role] || []).slice();
  (function next(){
    var i = list.shift(); if(i == null){ bsClean(); return; }
    bsFetchMod(i).then(next, function(){ setTimeout(next, 3000); });
  })();
}
function bsClean(){
  var keep = {}; keep[bsBase() + BS_BUILD.shell] = 1;
  BS_BUILD.mods.forEach(function(p){ keep[bsBase() + p] = 1; });
  BS_BUILD.fonts.forEach(function(f){ keep[bsBase() + f.u] = 1; });
  var nxt = bsLs('bs_ver'); try{ nxt = JSON.parse(nxt); if(nxt && nxt.shell) keep[bsBase() + nxt.shell] = 1; }catch(e){}
  bsCache().then(function(c){
    return c.keys().then(function(ks){ ks.forEach(function(r){ if(!keep[r.url]) c.delete(r); }); });
  }).catch(function(){});
  // шрифты прошлых сборок в localStorage (R95)
  try{
    for(var i = localStorage.length - 1; i >= 0; i--){
      var k = localStorage.key(i);
      if(k && k.indexOf('bs_f:f/') === 0 && !keep[bsBase() + k.slice(5)]) localStorage.removeItem(k);
    }
  }catch(e){}
}

// ── Шрифт: Manrope (переменный, 200-800), кириллица и латиница, swap: текст виден сразу ──
function bsFonts(){
  var F = BS_BUILD.fonts || [];
  var css = function(){
    var s = document.createElement('style');
    s.textContent = F.map(function(f){ return "@font-face{font-family:'Manrope';font-style:normal;font-weight:200 800;font-display:swap;src:url(" + bsBase() + f.u + ") format('woff2');unicode-range:" + f.r + "}"; }).join('');
    document.head.appendChild(s);
  };
  if(!window.FontFace || !document.fonts){ css(); return; }
  // R95: шрифт из localStorage подключается синхронно, до первой отрисовки: повторное открытие сразу в Manrope,
  // без подмены шрифта и сдвига текста через долю секунды. Первое открытие: системный шрифт, Manrope после загрузки
  F = F.filter(function(f){ return !bsFontLs(f); });
  if(!F.length) return;
  if(!window.caches){ css(); return; }
  F.forEach(function(f){
    var url = bsBase() + f.u;
    bsCache().then(function(c){
      return c.match(url).then(function(r){
        if(r) return r.arrayBuffer();
        return fetch(url).then(function(r2){ if(!r2.ok) throw new Error('font'); c.put(url, r2.clone()); return r2.arrayBuffer(); });
      });
    }).then(function(buf){
      var ff = new FontFace('Manrope', buf, {style: 'normal', weight: '200 800', unicodeRange: f.r, display: 'swap'});
      return ff.load().then(function(){ document.fonts.add(ff); bsFontSave(f, buf); });
    }).catch(function(){ if(!bsFonts._css){ bsFonts._css = 1; css(); } });
  });
}

function bsFontLs(f){
  var b = bsLs('bs_f:' + f.u); if(!b) return false;
  try{
    var bin = atob(b), u8 = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var ff = new FontFace('Manrope', u8.buffer, {style: 'normal', weight: '200 800', unicodeRange: f.r, display: 'swap'});
    document.fonts.add(ff);
    if(ff.status === 'error') throw new Error('font');
    return true;
  }catch(e){ bsLs('bs_f:' + f.u, null); return false; }
}
function bsFontSave(f, buf){
  setTimeout(function(){
    try{
      var u8 = new Uint8Array(buf), s = '';
      for(var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      if(s.length < 120000) bsLs('bs_f:' + f.u, btoa(s));
    }catch(e){}
  }, 1000);
}

// ── Версия: после выкладки приложение обновляется само ──
// Загрузчик уже сверил версию (window.__bsChecked); иначе сверяем здесь. Новая версия скачивается в кеш
// и включается сразу, если человек ещё ничего не нажал, иначе при следующем возвращении в приложение
var __bsNext = null, __bsVerAt = 0;
// Модуля этой версии на сайте уже нет: выложена новая. Скачать её и перезапуститься
function bsGone(){
  if(window.__bsGoneAt && Date.now() - window.__bsGoneAt < 60000) return;
  window.__bsGoneAt = Date.now();
  bsVerCheck(true);
}
function bsVerCheck(now){
  __bsVerAt = Date.now();
  // R95: загрузчик уже спросил version.json параллельно с запуском: его ответ, без второго запроса
  var pre = window.__bsVerP; window.__bsVerP = null;
  return (pre || fetch(bsBase() + 'version.json?t=' + Date.now(), {cache: 'no-store'})
    .then(function(r){ return r.ok ? r.json() : null; }))
    .then(function(j){
      if(!j || !j.v || !j.shell || j.v === BS_BUILD.v) return;
      // R95: открыто как index.html: свежая версия приходит по своему адресу (?v=), мимо кеша браузера
      if(window.__bsInline){
        bsLs('bs_ver', JSON.stringify({v: j.v, shell: j.shell}));
        __bsNext = j.v;
        if(now || (!__bsTouched && Date.now() - __bsBoot < 8000)) bsRestart();
        return;
      }
      return bsGet(j.shell).then(function(t){
        if(t && t.indexOf('<!--/bs-shell-->') > 0) return t;
        return fetch(bsBase() + j.shell).then(function(r){ return r.ok ? r.text() : null; });
      }).then(function(t){
        if(!t || t.indexOf('<!--/bs-shell-->') < 0) return;
        return bsPut(j.shell, t, 'text/html; charset=utf-8').then(function(){
          bsLs('bs_ver', JSON.stringify({v: j.v, shell: j.shell}));
          __bsNext = j.v;
          if(now || (!__bsTouched && Date.now() - __bsBoot < 8000)) bsRestart();
        });
      });
    }).catch(function(){});
}
// Перезапуск на новую версию. Через загрузчик: reload (он возьмёт её из Cache Storage). Как index.html: переход на
// index.html?v=<версия>, у этого адреса нет копии в кеше браузера. Один переход на версию за сеанс: если сайт ещё
// отдаёт старую копию (выкладка не доехала), приложение не прыгает по кругу, новая включится при следующем открытии
function bsRestart(){
  if(!window.__bsInline){ location.reload(); return; }
  var k = 'bs_nav_v', done = null; try{ done = sessionStorage.getItem(k); }catch(e){}
  if(done === __bsNext) return;
  try{ sessionStorage.setItem(k, __bsNext); }catch(e){}
  location.replace(bsBase() + '?v=' + encodeURIComponent(__bsNext) + location.hash);
}
// R95: первые секунды экраны появляются без анимации (html.bs-boot): первый кадр сразу готовый, обновление
// данных из сети не мигает. С первого касания и через 4 секунды анимации переходов как раньше
function bsBootEnd(){ document.documentElement.classList.remove('bs-boot'); }
function bsBooted(){ bsLs('bs_boot', null); try{ __bsPerf.init = Math.round(performance.now()); }catch(e){} }

(function(){
  bsFonts();
  ['touchstart', 'pointerdown', 'keydown'].forEach(function(ev){ document.addEventListener(ev, function(){ __bsTouched = true; bsBootEnd(); }, {capture: true, passive: true}); });
  setTimeout(bsBootEnd, 4000);
  // запуск без загрузчика (старый сохранённый index.html или прямой адрес) тоже запоминает версию
  if(!bsLs('bs_ver') || window.__bsInline) bsLs('bs_ver', JSON.stringify({v: BS_BUILD.v, shell: BS_BUILD.shell}));
  if(window.__bsChecked !== BS_BUILD.v) setTimeout(bsVerCheck, window.__bsVerP ? 0 : 1500);
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState !== 'visible') return;
    if(__bsNext){ bsRestart(); return; }
    if(Date.now() - __bsVerAt > 60000) bsVerCheck();
  });
  // R95: модули разделов в память раньше (было через 2,5 с): первое касание раздела не ждёт синхронной загрузки
  setTimeout(function(){
    if(window.requestIdleCallback) requestIdleCallback(bsPrefetch, {timeout: 2000}); else bsPrefetch();
  }, 1200);
})();
