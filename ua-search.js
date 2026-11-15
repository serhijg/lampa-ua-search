
(function () {
'use strict';

if (window.UA_SEARCH_082) return;
window.UA_SEARCH_082 = true;

var API = 'https://uakino.ax';
var CATS = [
 ['new','Новинки'],
 ['films','Фільми'],
 ['series','Серіали'],
 ['multserialy','Мультсеріали'],
 ['cartoons','Мультфільми'],
 ['dorama','Дорами'],
 ['anime','Аніме'],
 ['4k','4K'],
 ['top','Найкраще']
];

function note(s) {
 try { Lampa.Noty.show(s); }
 catch(e) { console.log(s); }
}

function enc(v) {
 return encodeURIComponent(v == null ? '' : String(v));
}

function norm(s) {
 return String(s || '').toLowerCase()
  .replace(/[^a-zа-яіїєґ0-9]+/gi,' ')
  .trim();
}

function request(path) {
 return new Promise(function(resolve,reject) {
  var x = new XMLHttpRequest();
  x.open('GET',API + path,true);
  x.timeout = 15000;

  x.onload = function() {
   try {
    if(x.status < 200 || x.status >= 300)
     throw Error('HTTP ' + x.status);
    resolve(JSON.parse(x.responseText));
   } catch(e) { reject(e); }
  };

  x.onerror = function() {
   reject(Error('CORS / мережа'));
  };
  x.ontimeout = function() {
   reject(Error('Таймаут'));
  };
  x.send();
 });
}

function list(cat,page) {
 return request(
  '/hls/api/lampa/list?cat=' + enc(cat) +
  '&page=' + page + '&limit=60'
 ).then(function(d) {
  return d.results || [];
 });
}

function findItems(query) {
 var jobs = [];
 CATS.forEach(function(c) {
  [1,2].forEach(function(page) {
   jobs.push(
    list(c[0],page).catch(function(){return [];})
   );
  });
 });

 return Promise.all(jobs).then(function(groups) {
  var seen = {},out = [],term = norm(query);
  groups.forEach(function(group) {
   group.forEach(function(it) {
    var id = it.uakino_id || it.id || it.title;
    var title = norm([
     it.title,it.name,it.original,
     it.original_title,it.original_name
    ].join(' '));
    if(!seen[id] && title.indexOf(term) >= 0) {
     seen[id] = true;
     out.push(it);
    }
   });
  });
  return out;
 });
}

function absolute(url) {
 if(!url) return '';
 return /^https?:/i.test(url) ? url : API + url;
}

function posterUrl(it) {
 var p = it.poster || it.poster_path || it.img || '';
 if(!p) return '';
 if(/^https?:/i.test(p)) return p;
 if(p.indexOf('/t/p/') === 0)
  return 'https://image.tmdb.org' + p;
 if(p.indexOf('/') === 0) return API + p;
 return 'https://image.tmdb.org/t/p/w342/' + p;
}

function metadata(it) {
 var year = it.year ||
  (it.release_date || it.first_air_date || '').slice(0,4);
 var rating = it.rating || it.vote_average;
 var parts = [];

 if(year) parts.push(String(year));
 if(rating && !isNaN(Number(rating))) {
  parts.push('★ ' + Number(rating).toFixed(1));
 }
 return parts.join('  ·  ');
}

function openItem(it) {
 var id = it.uakino_id;
 if(!id) {
  note('UAKino: відсутній ID матеріалу');
  return;
 }

 Lampa.Loading.start(function() {
  Lampa.Loading.stop();
 });

 request('/hls/api/play?movie=' + enc(id) +
  '&s=lp' + Date.now()).then(function(p) {
  Lampa.Loading.stop();

  var url = absolute(p.manifest_abs || p.manifest);
  if(!url) throw Error('Потік недоступний');

  if(!/\.m3u8($|\?)/i.test(url)) url += '.m3u8';

  var item = {
   title: it.title || it.name || 'UAKino',
   url: url,
   hls_type: 'hlsjs'
  };

  if(p.subs && p.subs.length) {
   item.subtitles = p.subs.map(function(s) {
    return {label:s.label,url:absolute(s.url)};
   });
  }

  Lampa.Player.play(item);
  Lampa.Player.playlist([item]);
 }).catch(function(e) {
  Lampa.Loading.stop();
  note('UAKino: ' + e.message);
 });
}

function Page(o) {
 var root,scroll,body,tiles = [];
 var cursor = 0;
 var destroyed = false;
 var requestId = 0;
 var started = false;
 var previousController = 'menu';

 function active() {
  try {
   var a = Lampa.Activity.active();
   return a && a.component === 'ua_search_082';
  } catch(e) { return false; }
 }

 function columns() {
  if(tiles.length < 2) return 1;
  var y = tiles[0].getBoundingClientRect().top;
  var count = 0;
  for(var i=0;i<tiles.length;i++) {
   if(Math.abs(tiles[i].getBoundingClientRect().top-y)>5)
    break;
   count++;
  }
  return Math.max(1,count);
 }

 function focus(i) {
  if(!tiles.length || destroyed) return;
  cursor = Math.max(0,Math.min(tiles.length-1,i));
  var el = tiles[cursor];
  var wrap = scroll.render();

  try {
   Lampa.Controller.collectionSet(wrap);
   Lampa.Controller.collectionFocus(el,wrap);
   scroll.update($(el),true);
  } catch(e) {
   console.log('UA focus:',e);
  }
 }

 function move(direction) {
  if(!tiles.length) return;

  var cols = columns();
  var next = cursor;

  if(direction === 'up') {
   if(cursor < cols) {
    Lampa.Controller.toggle('head');
    return;
   }
   next = cursor-cols;
  }

  if(direction === 'down')
   next = Math.min(tiles.length-1,cursor+cols);

  if(direction === 'left') {
   if(cursor%cols === 0) {
    Lampa.Controller.toggle('menu');
    return;
   }
   next = cursor-1;
  }

  if(direction === 'right') {
   if(cursor%cols !== cols-1 && cursor+1 < tiles.length)
    next = cursor+1;
  }

  focus(next);
 }

 function draw(items) {
  if(destroyed) return;

  body.empty();
  tiles = [];
  cursor = 0;

  if(!items.length) {
   body.append(
    $('<div class="uas82-empty"></div>')
     .text('Нічого не знайдено в доступних сторінках UAKino')
   );
   return;
  }

  var grid = $('<div class="uas82-grid"></div>');

  items.forEach(function(it) {
   var el = $(
    '<div class="uas82-card selector">' +
     '<div class="uas82-poster"></div>' +
     '<div class="uas82-name"></div>' +
     '<div class="uas82-meta"></div>' +
    '</div>'
   );

   var poster = posterUrl(it);
   if(poster) {
    el.find('.uas82-poster').css(
     'background-image',
     'url("' + poster.replace(/"/g,'%22') + '")'
    );
   }

   el.find('.uas82-name').text(
    it.title || it.name || 'Без назви'
   );
   el.find('.uas82-meta').text(metadata(it));

   el.on('hover:enter',function() {
    openItem(it);
   });

   el.on('hover:focus',function() {
    cursor = tiles.indexOf(el[0]);
   });

   grid.append(el);
   tiles.push(el[0]);
  });

  body.append(grid);

  try { Lampa.Layer.update(); } catch(e) {}

  if(started && active()) {
   setTimeout(function() {
    if(!destroyed && active()) focus(0);
   },100);
  }
 }

 this.create = function() {
  root = $('<div class="uas82-page"></div>');
  scroll = new Lampa.Scroll({
   mask:true,
   over:true,
   step:250
  });

  try { scroll.minus(); } catch(e) {}

  body = $('<div class="uas82-body"></div>');
  body.text('Завантаження…');
  scroll.append(body);
  root.append(scroll.render());

  var current = ++requestId;
  var promise = o.query ?
   findItems(o.query) : list(o.cat || 'new',1);

  promise.then(function(items) {
   if(destroyed || current !== requestId) return;
   draw(items);
  }).catch(function(e) {
   if(!destroyed && current === requestId)
    body.text('Помилка: ' + e.message);
  });
 };

 this.start = function() {
  started = true;

  Lampa.Controller.add('content',{
   toggle:function() {
    if(tiles.length) focus(cursor);
    else Lampa.Controller.collectionSet(scroll.render());
   },
   up:function(){move('up');},
   down:function(){move('down');},
   left:function(){move('left');},
   right:function(){move('right');},
   enter:function() {
    if(tiles[cursor])
     $(tiles[cursor]).trigger('hover:enter');
   },
   back:function() {
    Lampa.Activity.backward();
   }
  });

  Lampa.Controller.toggle('content');
 };

 this.pause = function() {
  started = false;
 };

 this.stop = function() {
  started = false;
 };

 this.render = function() {return root;};

 this.destroy = function() {
  destroyed = true;
  requestId++;
  try {scroll.destroy();}catch(e){}
  if(root) root.remove();
  tiles = [];
 };
}

function show(query,cat,title) {
 Lampa.Activity.push({
  url:'',
  title:title || 'UA Search',
  component:'ua_search_082',
  query:query || '',
  cat:cat || 'new',
  page:1
 });
}

function search() {
 Lampa.Input.edit({
  title:'Пошук UAKino',
  value:'',
  free:true
 },function(v) {
  if(v && v.trim()) {
   show(v.trim(),'','Пошук: '+v.trim());
  }
 });
}

function menu() {
 var items = [{
  title:'Пошук UAKino',
  action:'search'
 }];

 CATS.forEach(function(c) {
  items.push({title:c[1],cat:c[0]});
 });

 items.push({
  title:'Toloka — відкрити сайт',
  action:'toloka'
 });

 Lampa.Select.show({
  title:'UA Search 0.8.2',
  items:items,
  onBack:function() {
   Lampa.Controller.toggle('menu');
  },
  onSelect:function(it) {
   if(it.action === 'search') {
    // Закриваємо Select перед відкриттям поля вводу.
    try { Lampa.Select.hide(); } catch(e) {}
    setTimeout(search,100);
   } else if(it.action === 'toloka') {
    note('Toloka: вбудований пошук поки недоступний');
    try {window.open('https://toloka.to/','_blank');}
    catch(e){}
   } else {
    try {Lampa.Select.hide();}catch(e){}
    show('',it.cat,it.title);
   }
  }
 });
}

function addMenu() {
 if($('.menu [data-uas82="menu"]').length) return;

 var target = $('.menu .menu__list').first();
 if(!target.length) return;

 var item = $(
  '<li class="menu__item selector" data-uas82="menu">' +
  '<div class="menu__ico">UA</div>' +
  '<div class="menu__text">UA Search</div>' +
  '</li>'
 );

 item.on('hover:enter',menu);

 var anchor = $('.menu [data-action="settings"]').first();
 if(anchor.length) anchor.before(item);
 else target.prepend(item);
}

function addSearchButton() {
 var page = $('.activity--active');
 if(!page.length) return;

 var area = page.find('.search, .search-box, .search__body').first();
 if(!area.length) return;
 if(area.find('[data-uas82="search"]').length) return;

 var button = $(
  '<div class="uas82-search selector" data-uas82="search">' +
  'UA Search · українські фільми' +
  '</div>'
 );

 button.on('hover:enter click',search);
 area.prepend(button);
}

function init() {
 if(!window.Lampa ||
    !Lampa.Component ||
    !Lampa.Activity ||
    !Lampa.Select ||
    !Lampa.Input ||
    !window.$) {
  setTimeout(init,500);
  return;
 }

 Lampa.Component.add('ua_search_082',Page);

 var css =
 '.uas82-page{height:100%}' +
 '.uas82-body{padding:1.5em 3em 4em}' +
 '.uas82-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}' +
 '.uas82-card{min-width:0;padding:.4em;border-radius:.6em}' +
 '.uas82-card.focus{background:#fff;color:#111}' +
 '.uas82-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.35em}' +
 '.uas82-name{font-size:1.1em;font-weight:600;line-height:1.3;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
 '.uas82-meta{font-size:.9em;opacity:.7;margin-top:.3em;min-height:1.2em}' +
 '.uas82-card.focus .uas82-meta{opacity:.8}' +
 '.uas82-empty{padding:2em;opacity:.7}' +
 '.uas82-search{padding:.7em 1em;margin:.5em;border-radius:.5em;background:#1f6feb;color:#fff}' +
 'body.true--mobile .uas82-grid{grid-template-columns:repeat(3,minmax(0,1fr))}';

 $('<style id="uas82-style"></style>')
  .text(css).appendTo('head');

 var initialized = false;

 function ready() {
  if(initialized) return;
  initialized = true;

  addMenu();

  // Перевіряємо кнопки без MutationObserver.
  setInterval(function() {
   try {
    addMenu();
    addSearchButton();
   } catch(e) {
    console.log('UA Search UI:',e);
   }
  },2000);

  note('UA Search 0.8.2 активовано');
 }

 if(window.appready) ready();
 else {
  Lampa.Listener.follow('app',function(e) {
   if(e.type === 'ready') ready();
  });
 }

 window.UASearch082 = {
  open:menu,
  search:search
 };
}

init();
})();
