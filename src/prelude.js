// R95: первые строки приложения (сборка ставит их в начало <head>, до стилей и разметки).
// index.html теперь само приложение целиком: первый запуск не ждёт второго файла после загрузчика,
// повторный открывает его из кеша браузера (GitHub Pages: проверка 304) без Cache Storage и document.write.
// 1. Пакет данных просим сразу, пока разбирается остальное (POST /api/v1/app/bootstrap): appGet возьмёт этот ответ.
//    Загрузчик (старые копии в кеше Telegram) делает то же сам: тогда здесь ничего.
// 2. __bsInline: приложение открыто как index.html (не через загрузчик); новая версия включается переходом
//    на свежий адрес (runtime.js bsVerCheck), а не перезапуском из Cache Storage.
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
