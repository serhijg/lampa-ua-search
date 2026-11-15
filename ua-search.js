
(function () {
  'use strict';
  if (window.UA_SEARCH_08) return;
  window.UA_SEARCH_08 = true;
  var API = 'https://uakino.ax';
  var CATS = ['new','films','series','cartoons','multserialy','anime','dorama','top'];
  var LABELS = ['Новинки','Фільми','Серіали','Мультфільми','Мультсеріали','Аніме','Дорами','Найкраще'];
  function notify(s) { try { Lampa.Noty.show(s); } catch (e) {} }
  function request(path) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', API + path, true); x.timeout = 12000;
      x.onload = function () { try { if (x.status < 200 || x.status >= 300) throw Error('HTTP ' + x.status); resolve(JSON.parse(x.responseText)); } catch(e) { reject(e); } };
      x.onerror = function () { reject(Error('CORS / мережа')); };
      x.ontimeout = function () { reject(Error('Таймаут')); };
      x.send();
    });
  }
  function enc(v) { return encodeURIComponent(v == null ? '' : String(v)); }
  function normalize(s) { return String(s || '').toLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
  function unique(items) {
    var seen = {}, out = [];
    items.forEach(function (it) { var k = it.uakino_id || it.id || normalize(it.title); if (!seen[k]) { seen[k] = 1; out.push(it); } });
    return out;
  }
  function search(q, done) {
    var term = normalize(q), all = [], idx = 0;
    function next() {
      if (idx >= CATS.length) return done(unique(all));
      var cat = CATS[idx++];
      request('/hls/api/lampa/list?cat=' + enc(cat) + '&page=1&limit=100').then(function (data) {
        (data.results || []).forEach(function (it) {
          if (normalize([it.title,it.name,it.original,it.original_title,it.original_name].join(' ')).indexOf(term) !== -1) all.push(it);
        });
        next();
      }).catch(function () { next(); });
    }
    next();
  }
  function openItem(it) {
    var id = it.uakino_id;
    if (!id) return notify('UAKino: немає ID матеріалу');
    request('/hls/api/play?movie=' + enc(id) + '&s=lp' + Date.now()).then(function (p) {
      var u = p.manifest_abs || p.manifest || '';
      if (u && !/^https?:/i.test(u)) u = API + u;
      if (!u) return notify('UAKino: потік недоступний');
      if (!/\.m3u8($|\?)/.test(u)) u += '.m3u8';
      var item = { title: it.title || it.name || 'UAKino', url: u, hls_type: 'hlsjs' };
      if (p.subs && p.subs.length) item.subtitles = p.subs.map(function (s) { return { label:s.label, url:/^https?:/.test(s.url) ? s.url : API + s.url }; });
      Lampa.Player.play(item); Lampa.Player.playlist([item]);
    }).catch(function (e) { notify('UAKino: ' + e.message); });
  }
  function Page(object) {
    var self = this, root, scroll, body, tiles = [], cursor = 0;
    function focus(n) {
      if (!tiles.length) return;
      cursor = Math.max(0,Math.min(tiles.length - 1,n));
      Lampa.Controller.collectionSet(scroll.render());
      Lampa.Controller.collectionFocus(tiles[cursor], scroll.render());
      try { scroll.update($(tiles[cursor]),true); } catch(e) {}
    }
    function draw(items) {
      body.empty(); tiles = []; cursor = 0;
      if (!items.length) body.append('<div style="padding:2em">Нічого не знайдено в доступних сторінках каталогу UAKino.</div>');
      var grid = $('<div class="uas-grid"></div>');
      items.forEach(function (it) {
        var poster = it.poster_path || it.poster || it.img || '';
        if (poster && !/^https?:/.test(poster)) poster = poster.indexOf('/t/p/') === 0 ? 'https://image.tmdb.org' + poster : poster.charAt(0) === '/' ? API + poster : 'https://image.tmdb.org/t/p/w342' + poster;
        var card = $('<div class="uas-card selector"><div class="uas-poster"></div><div class="uas-name"></div></div>');
        if (poster) card.find('.uas-poster').css('background-image','url("' + poster.replace(/"/g,'%22') + '")');
        card.find('.uas-name').text(it.title || it.name || 'Без назви');
        card.on('hover:enter',function () { openItem(it); });
        card.on('hover:focus',function () { cursor = tiles.indexOf(card[0]); });
        grid.append(card); tiles.push(card[0]);
      });
      body.append(grid);
      try { Lampa.Layer.update(); } catch(e) {}
      if (tiles.length) focus(0);
    }
    this.create = function () {
      root = $('<div class="uas-page"></div>');
      scroll = new Lampa.Scroll({mask:true,over:true,step:250});
      body = $('<div class="uas-body">Завантаження…</div>');
      scroll.append(body); root.append(scroll.render());
      if (object.query) {
        search(object.query,draw);
      } else {
        request('/hls/api/lampa/list?cat=' + enc(object.cat || 'new') + '&page=1&limit=100')
          .then(function (d) { draw(d.results || []); })
          .catch(function (e) { body.text('Помилка UAKino: ' + e.message); });
      }
    };
    this.start = function () {
      Lampa.Controller.add('content',{
        toggle:function () { if (tiles.length) focus(cursor); },
        up:function () { if (cursor < 5) Lampa.Controller.toggle('head'); else focus(cursor - 5); },
        down:function () { focus(cursor + 5); },
        left:function () { if (cursor % 5) focus(cursor - 1); else Lampa.Controller.toggle('menu'); },
        right:function () { if (cursor % 5 !== 4) focus(cursor + 1); },
        enter:function () { if (tiles[cursor]) $(tiles[cursor]).trigger('hover:enter'); },
        back:function () { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('content');
    };
    this.pause = function () {};
    this.stop = function () {};
    this.render = function () { return root; };
    this.destroy = function () { if (scroll) scroll.destroy(); if (root) root.remove(); };
  }
  function show(query,cat,title) { Lampa.Activity.push({title:title || 'UA Search',component:'ua_search_08',query:query || '',cat:cat || 'new',page:1}); }
  function menu() {
    var opts = [{title:'Пошук UAKino',action:'search'}];
    CATS.forEach(function (c,i) { opts.push({title:LABELS[i],cat:c}); });
    opts.push({title:'Toloka — відкрити сайт',action:'toloka'});
    Lampa.Select.show({title:'UA Search 0.8',items:opts,onBack:function () { Lampa.Controller.toggle('menu'); },onSelect:function (it) {
      if (it.action === 'toloka') {
        notify('Toloka: потрібна авторизація на сайті; вбудований пошук поки недоступний');
        try { window.open('https://toloka.to/','_blank'); } catch(e) {}
      } else if (it.action === 'search') {
        Lampa.Input.edit({title:'Пошук українською',value:'',free:true},function (q) { if (q && q.trim()) show(q.trim(),'','UAKino: ' + q); });
      } else show('',it.cat,it.title);
    }});
  }
  function init() {
    if (!window.Lampa || !Lampa.Component || !Lampa.Select || !Lampa.Input || !window.$) return setTimeout(init,500);
    Lampa.Component.add('ua_search_08',Page);
    var css = '.uas-body{padding:1.5em 3em}.uas-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}.uas-card{min-width:0;padding:.35em;border-radius:.5em}.uas-card.focus{background:#fff;color:#111}.uas-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.3em}.uas-name{font-size:1.1em;line-height:1.3;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}body.true--mobile .uas-grid{grid-template-columns:repeat(3,minmax(0,1fr))}';
    $('<style>').text(css).appendTo('head');
    // Independent menu entry; no official UAKino plugin required.
    try {
      var item = $('<li class="menu__item selector"><div class="menu__ico">UA</div><div class="menu__text">UA Search</div></li>');
      item.on('hover:enter click',menu);
      $('.menu .menu__list, .menu .menu__body, .menu__list').first().append(item);
    } catch(e) {}
    window.UASearch08 = {open:menu,search:function(q){show(q,'','UAKino: '+q);}};
    notify('UA Search 0.8 завантажено');
  }
  init();
})();
