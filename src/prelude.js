// R95: первые строки приложения (сборка ставит их в начало <head>, до стилей и разметки).
// index.html теперь само приложение целиком: первый запуск не ждёт второго файла после загрузчика,
// повторный открывает его из кеша браузера (GitHub Pages: проверка 304) без Cache Storage и document.write.
// 1. Пакет данных просим сразу, пока разбирается остальное (POST /api/v1/app/bootstrap): appGet возьмёт этот ответ.
//    Загрузчик (старые копии в кеше Telegram) делает то же сам: тогда здесь ничего.
// 2. __bsInline: приложение открыто как index.html (не через загрузчик); новая версия включается переходом
//    на свежий адрес (runtime.js bsVerCheck), а не перезапуском из Cache Storage.
// 3. R96 (#42): одно приложение в Telegram. Резидент или команда в прошлый раз закрыли Telegram на платформе:
//    запуск сразу уходит туда (форма на app.bxclub.kz/tg, как кнопка «Платформа»), приложение не рисуется и
//    данные не просит. «Назад» из платформы возвращает сюда (bs_fw96s в этом окне), и следующий запуск снова
//    открывает приложение. Ссылка на раздел (start_param), окно внутри страницы и выключатель в «Профиле»: без перехода.
(function(){
  try{
    var ss = window.sessionStorage, ls = window.localStorage;
    if(ss.getItem('bs_fw96s')){ ls.removeItem('bs_fw96'); return; }
    if(ls.getItem('bs_fw96off') === '1' || window.top !== window.self || !window.URLSearchParams) return;
    var f = JSON.parse(ls.getItem('bs_fw96') || 'null'), role = ls.getItem('bs_view_as');
    if(!f || !f.u || Date.now() - (f.at || 0) > 30 * 864e5 || (role !== 'resident' && role !== 'admin')) return;
    var hp = new URLSearchParams(location.hash.slice(1)), init = hp.get('tgWebAppData') || '';
    var ip = new URLSearchParams(init), u = JSON.parse(ip.get('user') || 'null');
    if(!u || String(u.id) !== String(f.u) || ip.get('start_param') || hp.get('tgWebAppStartParam')) return;
    var F = document.createElement('form');
    F.method = 'post'; F.action = 'https://app.bxclub.kz/tg'; F.style.display = 'none';
    [['initData', init], ['v', hp.get('tgWebAppVersion')], ['pf', hp.get('tgWebAppPlatform')], ['th', hp.get('tgWebAppThemeParams')]].forEach(function(a){
      if(!a[1]) return;
      var i = document.createElement('input'); i.type = 'hidden'; i.name = a[0]; i.value = a[1]; F.appendChild(i);
    });
    ss.setItem('bs_fw96s', '1');
    window.__bsFw = 1; window.__bsPre = null;
    document.documentElement.className += ' bs-fw';
    var st = document.createElement('style');
    st.textContent = 'html.bs-fw,html.bs-fw body{background:#000}html.bs-fw body>*{display:none!important}html.bs-fw:after{content:"";position:fixed;left:50%;top:50%;width:30px;height:30px;margin:-15px;border:2.5px solid rgba(255,255,255,.15);border-top-color:#fff;border-radius:50%;animation:bsfw .8s linear infinite}@keyframes bsfw{to{transform:rotate(360deg)}}';
    document.documentElement.appendChild(st);
    document.documentElement.appendChild(F);
    // переход до конца загрузки страницы браузер записывает поверх текущего шага истории: свой шаг сначала,
    // чтобы «Назад» из платформы вернул в приложение
    try{ history.pushState({bsfw: 1}, '', location.href); }catch(e){}
    F.submit();
    // платформа не ответила за 20 секунд: открыть приложение (bs_fw96s уже стоит, перехода не будет)
    setTimeout(function(){ location.reload(); }, 20000);
  }catch(e){}
})();
(function(){
  var INLINE = /*BS_INLINE*/0, API = '/*API*/';
  if(INLINE) window.__bsInline = 1;
  if(window.__bsPre !== undefined) return;
  window.__bsPre = null;
  try{
    var init = '', u = null, et = null;
    try{ init = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData') || ''; }catch(e){}
    if(!init){ try{ init = (JSON.parse(sessionStorage.getItem('__telegram__initParams') || 'null') || {}).tgWebAppData || ''; }catch(e){} }
    try{ u = JSON.parse(new URLSearchParams(init).get('user') || 'null'); }catch(e){}
    try{ et = localStorage.getItem('bs_cache_et'); }catch(e){}
    // POST с текстом в теле: «простой» запрос, без предварительной проверки CORS (OPTIONS), то есть на один
    // круг до сервера быстрее; данные входа в теле, не в адресе. Сервер без /bootstrap: appGet спросит по-старому
    if(init && window.fetch && window.URLSearchParams){
      var b = new URLSearchParams({tg: init});
      if(u && u.id) b.set('chatId', u.id);
      if(et) b.set('et', et);
      window.__bsPre = {at: Date.now(), boot: 1, key: (u && u.id ? String(u.id) : '') + '|' + (et || ''),
        p: fetch(API + 'bootstrap', {method: 'POST', body: b.toString()}).catch(function(){ return null; })};
    }
  }catch(e){}
})();
