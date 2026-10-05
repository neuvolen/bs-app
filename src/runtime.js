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
}

// ── Шрифт: Manrope (переменный, 200-800), кириллица и латиница, swap: текст виден сразу ──
function bsFonts(){
  var F = BS_BUILD.fonts || [];
  var css = function(){
    var s = document.createElement('style');
    s.textContent = F.map(function(f){ return "@font-face{font-family:'Manrope';font-style:normal;font-weight:200 800;font-display:swap;src:url(" + bsBase() + f.u + ") format('woff2');unicode-range:" + f.r + "}"; }).join('');
    document.head.appendChild(s);
  };
  if(!window.FontFace || !document.fonts || !window.caches){ css(); return; }
  F.forEach(function(f){
    var url = bsBase() + f.u;
    bsCache().then(function(c){
      return c.match(url).then(function(r){
        if(r) return r.arrayBuffer();
        return fetch(url).then(function(r2){ if(!r2.ok) throw new Error('font'); c.put(url, r2.clone()); return r2.arrayBuffer(); });
      });
    }).then(function(buf){
      var ff = new FontFace('Manrope', buf, {style: 'normal', weight: '200 800', unicodeRange: f.r, display: 'swap'});
      return ff.load().then(function(){ document.fonts.add(ff); });
    }).catch(function(){ if(!bsFonts._css){ bsFonts._css = 1; css(); } });
  });
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
  return fetch(bsBase() + 'version.json?t=' + Date.now(), {cache: 'no-store'})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){
      if(!j || !j.v || !j.shell || j.v === BS_BUILD.v) return;
      return bsGet(j.shell).then(function(t){
        if(t && t.indexOf('<!--/bs-shell-->') > 0) return t;
        return fetch(bsBase() + j.shell).then(function(r){ return r.ok ? r.text() : null; });
      }).then(function(t){
        if(!t || t.indexOf('<!--/bs-shell-->') < 0) return;
        return bsPut(j.shell, t, 'text/html; charset=utf-8').then(function(){
          bsLs('bs_ver', JSON.stringify({v: j.v, shell: j.shell}));
          __bsNext = j.v;
          if(now || (!__bsTouched && Date.now() - __bsBoot < 8000)) location.reload();
        });
      });
    }).catch(function(){});
}
function bsBooted(){ bsLs('bs_boot', null); try{ __bsPerf.init = Math.round(performance.now()); }catch(e){} }

(function(){
  bsFonts();
  ['touchstart', 'pointerdown', 'keydown'].forEach(function(ev){ document.addEventListener(ev, function(){ __bsTouched = true; }, {capture: true, passive: true}); });
  // запуск без загрузчика (старый сохранённый index.html или прямой адрес) тоже запоминает версию
  if(!bsLs('bs_ver')) bsLs('bs_ver', JSON.stringify({v: BS_BUILD.v, shell: BS_BUILD.shell}));
  if(window.__bsChecked !== BS_BUILD.v) setTimeout(bsVerCheck, 1500);
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState !== 'visible') return;
    if(__bsNext){ location.reload(); return; }
    if(Date.now() - __bsVerAt > 60000) bsVerCheck();
  });
  setTimeout(function(){
    if(window.requestIdleCallback) requestIdleCallback(bsPrefetch, {timeout: 4000}); else bsPrefetch();
  }, 2500);
})();
