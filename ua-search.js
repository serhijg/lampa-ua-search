
(function () {
'use strict';

if (window.UA_SEARCH_084) return;
window.UA_SEARCH_084 = true;

var API = 'https://uakino.ax';
var COMPONENT = 'ua_search_084';

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

var LIMIT = 60;
var MAX_PAGES = 30;

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
  x.timeout = 20000;

  x.onload = function() {
   try {
    if(x.status < 200 || x.status >= 300)
     throw Error('HTTP ' + x.status);

    resolve(JSON.parse(x.responseText));
   } catch(e) {
    reject(e);
   }
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
  '&page=' + page +
  '&limit=' + LIMIT
 ).then(function(d) {
  return {
   items: Array.isArray(d.results) ? d.results : [],
   raw: d
  };
 });
}

function itemKey(it) {
 return String(
  it.uakino_id ||
  it.id ||
  it.url ||
  it.title ||
  it.name ||
  ''
 );
}

function absolute(url) {
 if(!url) return '';

 if(/^https?:\/\//i.test(url))
  return url;

 if(url.indexOf('//') === 0)
  return 'https:' + url;

 return API + (url.charAt(0) === '/' ? '' : '/') + url;
}

function posterUrl(it) {
 var p = it.poster || it.poster_path || it.img || '';

 if(!p) return '';

 if(/^https?:\/\//i.test(p))
  return p;

 if(p.indexOf('/t/p/') === 0)
  return 'https://image.tmdb.org' + p;

 if(p.charAt(0) === '/')
  return API + p;

 return 'https://image.tmdb.org/t/p/w342/' + p;
}

function getYear(it) {
 return Number(
  it.year ||
  String(it.release_date || it.first_air_date || '').slice(0,4)
 ) || 0;
}

function getRating(it) {
 return Number(it.rating || it.vote_average) || 0;
}

function metadata(it) {
 var parts = [];
 var year = getYear(it);
 var rating = getRating(it);

 if(year) parts.push(String(year));
 if(rating) parts.push('★ ' + rating.toFixed(1));

 return parts.join(' · ');
}

function openItem(it) {
 var id = it.uakino_id;

 if(!id) {
  note('UAKino: відсутній ID матеріалу');
  return;
 }

 try { Lampa.Loading.start(); } catch(e) {}

 request(
  '/hls/api/play?movie=' + enc(id) +
  '&s=lp' + Date.now()
 ).then(function(p) {
  try { Lampa.Loading.stop(); } catch(e) {}

  var url = absolute(p.manifest_abs || p.manifest);

  if(!url)
   throw Error('Потік недоступний');

  if(!/\.m3u8($|\?)/i.test(url))
   url += '.m3u8';

  var item = {
   title: it.title || it.name || 'UAKino',
   url: url,
   hls_type: 'hlsjs'
  };

  if(Array.isArray(p.subs)) {
   item.subtitles = p.subs.map(function(s) {
    return {
     label: s.label,
     url: absolute(s.url)
    };
   });
  }

  Lampa.Player.play(item);
  Lampa.Player.playlist([item]);

 }).catch(function(e) {
  try { Lampa.Loading.stop(); } catch(err) {}
  note('UAKino: ' + e.message);
 });
}

function Page(o) {
 var root;
 var scroll;
 var filterBar;
 var body;
 var statusBar;

 var tiles = [];
 var filters = [];
 var allItems = [];
 var visibleItems = [];
 var seen = {};

 var cursor = 0;
 var filterCursor = 0;
 var zone = 'tiles';

 var started = false;
 var destroyed = false;
 var loading = false;
 var hasMore = true;
 var page = 0;
 var requestId = 0;
 var emptyPages = 0;

 var query = String(o.query || '');
 var category = o.cat || 'new';

 var settings = {
  year: 'all',
  rating: 0,
  sort: 'default'
 };

 function active() {
  if(destroyed) return false;

  try {
   var a = Lampa.Activity.active();
   return !!(a && a.component === COMPONENT);
  } catch(e) {
   return false;
  }
 }

 function scrollRoot() {
  return scroll ? scroll.render() : null;
 }

 function focusElement(el) {
  if(!el || !active()) return;

  var $el = $(el);
  var container = scrollRoot();

  if(!$el.length || !container) return;
  if(!$.contains(document,el)) return;

  try {
   Lampa.Controller.collectionSet(container);
   Lampa.Controller.collectionFocus($el,container);
   scroll.update($el,true);
  } catch(e) {
   console.log('UA Search focus:',e);
  }
 }

 function focusTile(index) {
  if(!tiles.length) {
   if(filters.length) focusFilter(filterCursor);
   return;
  }

  zone = 'tiles';

  cursor = Math.max(
   0,
   Math.min(tiles.length-1,index)
  );

  focusElement(tiles[cursor]);
 }

 function focusFilter(index) {
  if(!filters.length) return;

  zone = 'filters';

  filterCursor = Math.max(
   0,
   Math.min(filters.length-1,index)
  );

  focusElement(filters[filterCursor]);
 }

 function restoreFocus() {
  if(!active()) return;

  if(zone === 'filters' && filters.length)
   focusFilter(filterCursor);
  else if(tiles.length)
   focusTile(cursor);
  else if(filters.length)
   focusFilter(filterCursor);
 }

 function columns() {
  if(tiles.length < 2) return 1;

  var first = tiles[0].getBoundingClientRect().top;
  var count = 0;

  for(var i=0;i<tiles.length;i++) {
   var top = tiles[i].getBoundingClientRect().top;

   if(Math.abs(top-first)>5)
    break;

   count++;
  }

  return Math.max(1,count);
 }

 function move(direction) {
  if(!active()) return;

  if(zone === 'filters') {
   if(direction === 'left') {
    focusFilter(filterCursor-1);
    return;
   }

   if(direction === 'right') {
    focusFilter(filterCursor+1);
    return;
   }

   if(direction === 'down') {
    if(tiles.length) focusTile(cursor);
    return;
   }

   if(direction === 'up') {
    Lampa.Controller.toggle('head');
    return;
   }

   return;
  }

  if(!tiles.length) {
   if(direction === 'up')
    focusFilter(filterCursor);
   return;
  }

  var cols = columns();
  var next = cursor;

  if(direction === 'up') {
   if(cursor < cols) {
    focusFilter(filterCursor);
    return;
   }

   next = cursor-cols;
  }

  if(direction === 'down') {
   next = Math.min(
    tiles.length-1,
    cursor+cols
   );
  }

  if(direction === 'left') {
   if(cursor%cols === 0) {
    Lampa.Controller.toggle('menu');
    return;
   }

   next = cursor-1;
  }

  if(direction === 'right') {
   if(cursor%cols !== cols-1 &&
      cursor+1 < tiles.length)
    next = cursor+1;
  }

  focusTile(next);

  if(direction === 'down' &&
     cursor >= tiles.length-cols*3) {
   loadNext();
  }
 }

 function updateStatus(message) {
  if(!statusBar) return;

  var text =
   'Завантажено: ' + allItems.length +
   ' · Показано: ' + visibleItems.length +
   ' · Сторінка: ' + page;

  if(message)
   text += ' · ' + message;

  statusBar.text(text);
 }

 function applyFilters() {
  var result = allItems.slice();

  if(query) {
   var term = norm(query);

   result = result.filter(function(it) {
    return norm([
     it.title,
     it.name,
     it.original,
     it.original_title,
     it.original_name
    ].join(' ')).indexOf(term)>=0;
   });
  }

  if(settings.year !== 'all') {
   result = result.filter(function(it) {
    var year = getYear(it);

    if(!year) return false;

    if(settings.year === '2020+')
     return year>=2020;

    if(settings.year === '2010-2019')
     return year>=2010 && year<=2019;

    if(settings.year === 'before2010')
     return year<2010;

    return true;
   });
  }

  if(settings.rating) {
   result = result.filter(function(it) {
    return getRating(it)>=settings.rating;
   });
  }

  if(settings.sort === 'rating') {
   result.sort(function(a,b) {
    return getRating(b)-getRating(a);
   });
  }

  if(settings.sort === 'year') {
   result.sort(function(a,b) {
    return getYear(b)-getYear(a);
   });
  }

  if(settings.sort === 'title') {
   result.sort(function(a,b) {
    return String(a.title || a.name || '')
     .localeCompare(
      String(b.title || b.name || ''),
      'uk'
     );
   });
  }

  return result;
 }

 function createCard(it) {
  var el = $(
   '<div class="uas84-card selector">' +
    '<div class="uas84-poster"></div>' +
    '<div class="uas84-name"></div>' +
    '<div class="uas84-meta"></div>' +
   '</div>'
  );

  var poster = posterUrl(it);

  if(poster) {
   el.find('.uas84-poster').css(
    'background-image',
    'url("' + poster.replace(/"/g,'%22') + '")'
   );
  }

  el.find('.uas84-name').text(
   it.title || it.name || 'Без назви'
  );

  el.find('.uas84-meta').text(metadata(it));

  el.on('hover:enter',function() {
   openItem(it);
  });

  el.on('hover:focus',function() {
   zone = 'tiles';
   var index = tiles.indexOf(el[0]);

   if(index>=0)
    cursor = index;
  });

  return el;
 }

 function draw(preserve) {
  if(destroyed) return;

  var oldKey = null;

  if(preserve && tiles[cursor]) {
   oldKey = $(tiles[cursor]).attr('data-key');
  }

  visibleItems = applyFilters();

  body.empty();
  tiles = [];

  if(!visibleItems.length) {
   body.append(
    $('<div class="uas84-empty"></div>')
     .text(
      loading ?
      'Завантаження матеріалів…' :
      'Немає результатів для вибраних фільтрів'
     )
   );

   updateStatus(loading ? 'Завантаження…' : '');

   return;
  }

  var grid = $('<div class="uas84-grid"></div>');

  visibleItems.forEach(function(it,index) {
   var el = createCard(it);

   el.attr('data-key',itemKey(it));
   grid.append(el);
   tiles.push(el[0]);

   if(oldKey && itemKey(it) === oldKey)
    cursor = index;
  });

  body.append(grid);

  cursor = Math.max(
   0,
   Math.min(cursor,tiles.length-1)
  );

  updateStatus(loading ? 'Завантаження…' : '');

  try { Lampa.Layer.update(); } catch(e) {}

  if(started && active()) {
   setTimeout(function() {
    if(started && active())
     restoreFocus();
   },80);
  }
 }

 function appendItems(items) {
  var added = 0;

  items.forEach(function(it) {
   var key = itemKey(it);

   if(!key || seen[key]) return;

   seen[key] = true;
   allItems.push(it);
   added++;
  });

  return added;
 }

 function loadNext() {
  if(destroyed || loading || !hasMore)
   return;

  if(page>=MAX_PAGES) {
   hasMore = false;
   updateStatus('Досягнуто ліміту сторінок');
   return;
  }

  loading = true;

  var nextPage = page+1;
  var current = ++requestId;

  updateStatus('Завантаження…');

  list(category,nextPage).then(function(result) {
   if(destroyed || current !== requestId)
    return;

   var items = result.items;
   var added = appendItems(items);

   page = nextPage;
   loading = false;

   if(!items.length) {
    hasMore = false;
   } else if(added === 0) {
    emptyPages++;

    if(emptyPages>=2)
     hasMore = false;
   } else {
    emptyPages = 0;
   }

   draw(true);

   if(!hasMore) {
    updateStatus('Кінець каталогу');
   } else if(!visibleItems.length && page<MAX_PAGES) {
    loadNext();
   }

  }).catch(function(e) {
   if(destroyed || current !== requestId)
    return;

   loading = false;
   updateStatus('Помилка: ' + e.message);

   note('UA Search: ' + e.message);
  });
 }

 function selectFilter(title,items,callback) {
  Lampa.Select.show({
   title:title,
   items:items,

   onBack:function() {
    setTimeout(function() {
     if(active()) {
      Lampa.Controller.toggle('content');
      focusFilter(filterCursor);
     }
    },50);
   },

   onSelect:function(it) {
    callback(it.value);

    try { Lampa.Select.hide(); } catch(e) {}

    renderFilters();
    draw(true);

    setTimeout(function() {
     if(active()) {
      Lampa.Controller.toggle('content');
      focusFilter(filterCursor);
     }
    },50);
   }
  });
 }

 function filterAction(type) {
  if(type === 'year') {
   selectFilter('Рік випуску',[
    {title:'Усі роки',value:'all'},
    {title:'2020 і новіші',value:'2020+'},
    {title:'2010–2019',value:'2010-2019'},
    {title:'До 2010',value:'before2010'}
   ],function(v) {
    settings.year = v;
   });
  }

  if(type === 'rating') {
   selectFilter('Мінімальний рейтинг',[
    {title:'Будь-який',value:0},
    {title:'Від 5',value:5},
    {title:'Від 6',value:6},
    {title:'Від 7',value:7},
    {title:'Від 8',value:8},
    {title:'Від 9',value:9}
   ],function(v) {
    settings.rating = v;
   });
  }

  if(type === 'sort') {
   selectFilter('Сортування',[
    {title:'Звичайне',value:'default'},
    {title:'За рейтингом',value:'rating'},
    {title:'За роком',value:'year'},
    {title:'За назвою',value:'title'}
   ],function(v) {
    settings.sort = v;
   });
  }

  if(type === 'reset') {
   settings.year = 'all';
   settings.rating = 0;
   settings.sort = 'default';

   renderFilters();
   draw(true);
   focusFilter(0);
  }
 }

 function renderFilters() {
  filterBar.empty();
  filters = [];

  var sortNames = {
   default:'Звичайне',
   rating:'Рейтинг',
   year:'Рік',
   title:'Назва'
  };

  var definitions = [
   ['year','Рік: ' +
    (settings.year === 'all' ?
     'Усі' : settings.year)],
   ['rating','Рейтинг: ' +
    (settings.rating || 'Усі')],
   ['sort','Сортування: ' +
    sortNames[settings.sort]],
   ['reset','Скинути']
  ];

  definitions.forEach(function(def) {
   var el = $(
    '<div class="uas84-filter selector"></div>'
   );

   el.text(def[1]);

   el.on('hover:enter',function() {
    filterAction(def[0]);
   });

   el.on('hover:focus',function() {
    zone = 'filters';
    filterCursor = filters.indexOf(el[0]);
   });

   filterBar.append(el);
   filters.push(el[0]);
  });
 }

 this.create = function() {
  root = $('<div class="uas84-page"></div>');

  scroll = new Lampa.Scroll({
   mask:true,
   over:true,
   step:250
  });

  try { scroll.minus(); } catch(e) {}

  filterBar = $('<div class="uas84-filters"></div>');
  statusBar = $('<div class="uas84-status"></div>');
  body = $('<div class="uas84-body"></div>');

  scroll.append(filterBar);
  scroll.append(statusBar);
  scroll.append(body);

  root.append(scroll.render());

  renderFilters();

  body.text('Завантаження…');

  loadNext();
 };

 this.start = function() {
  started = true;

  Lampa.Controller.add('content',{
   toggle:function() {
    if(!active()) return;

    var container = scrollRoot();

    if(container) {
     try {
      Lampa.Controller.collectionSet(container);
     } catch(e) {}
    }

    restoreFocus();
   },

   up:function() {
    move('up');
   },

   down:function() {
    move('down');
   },

   left:function() {
    move('left');
   },

   right:function() {
    move('right');
   },

   enter:function() {
    if(!active()) return;

    if(zone === 'filters') {
     if(filters[filterCursor])
      $(filters[filterCursor]).trigger('hover:enter');
    } else {
     if(tiles[cursor])
      $(tiles[cursor]).trigger('hover:enter');
    }
   },

   back:function() {
    started = false;
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

 this.render = function() {
  return root;
 };

 this.destroy = function() {
  destroyed = true;
  started = false;
  requestId++;

  try { scroll.destroy(); } catch(e) {}

  if(root) root.remove();

  tiles = [];
  filters = [];
  allItems = [];
 };
}

function show(query,cat,title) {
 Lampa.Activity.push({
  url:'',
  title:title || 'UA Search',
  component:COMPONENT,
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
  if(v && v.trim())
   show(v.trim(),'new','Пошук: '+v.trim());
 });
}

function menu() {
 var items = [{
  title:'Пошук UAKino',
  action:'search'
 }];

 CATS.forEach(function(c) {
  items.push({
   title:c[1],
   cat:c[0]
  });
 });

 items.push({
  title:'Toloka — відкрити сайт',
  action:'toloka'
 });

 Lampa.Select.show({
  title:'UA Search 0.8.4',
  items:items,

  onBack:function() {
   Lampa.Controller.toggle('menu');
  },

  onSelect:function(it) {
   if(it.action === 'search') {
    try { Lampa.Select.hide(); } catch(e) {}
    setTimeout(search,100);
   } else if(it.action === 'toloka') {
    note('Toloka: вбудований пошук поки недоступний');

    try {
     window.open('https://toloka.to/','_blank');
    } catch(e) {}
   } else {
    try { Lampa.Select.hide(); } catch(e) {}

    show('',it.cat,it.title);
   }
  }
 });
}

function addMenu() {
 if($('.menu [data-uas84="menu"]').length)
  return;

 var target = $('.menu .menu__list').first();

 if(!target.length) return;

 var item = $(
  '<li class="menu__item selector" data-uas84="menu">' +
  '<div class="menu__ico">UA</div>' +
  '<div class="menu__text">UA Search</div>' +
  '</li>'
 );

 item.on('hover:enter',menu);

 var anchor = $('.menu [data-action="settings"]').first();

 if(anchor.length)
  anchor.before(item);
 else
  target.prepend(item);
}

function addSearchButton() {
 var page = $('.activity--active');

 if(!page.length) return;

 var area = page.find(
  '.search, .search-box, .search__body'
 ).first();

 if(!area.length) return;

 if(area.find('[data-uas84="search"]').length)
  return;

 var button = $(
  '<div class="uas84-search selector" data-uas84="search">' +
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

 Lampa.Component.add(COMPONENT,Page);

 var css =
 '.uas84-page{height:100%}' +
 '.uas84-filters{display:flex;flex-wrap:wrap;gap:.7em;padding:1.2em 3em .4em}' +
 '.uas84-filter{padding:.65em 1em;border-radius:.5em;background:#303642;color:#fff}' +
 '.uas84-filter.focus{background:#fff;color:#111}' +
 '.uas84-status{padding:.4em 3em;font-size:.9em;opacity:.7}' +
 '.uas84-body{padding:1em 3em 4em}' +
 '.uas84-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}' +
 '.uas84-card{min-width:0;padding:.4em;border-radius:.6em}' +
 '.uas84-card.focus{background:#fff;color:#111}' +
 '.uas84-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.35em}' +
 '.uas84-name{font-size:1.1em;font-weight:600;line-height:1.3;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
 '.uas84-meta{font-size:.9em;opacity:.7;margin-top:.3em;min-height:1.2em}' +
 '.uas84-empty{padding:2em;opacity:.7}' +
 '.uas84-search{padding:.7em 1em;margin:.5em;border-radius:.5em;background:#1f6feb;color:#fff}' +
 'body.true--mobile .uas84-grid{grid-template-columns:repeat(3,minmax(0,1fr))}';

 $('<style id="uas84-style"></style>')
  .text(css)
  .appendTo('head');

 var initialized = false;

 function ready() {
  if(initialized) return;
  initialized = true;

  addMenu();

  setInterval(function() {
   try {
    addMenu();
    addSearchButton();
   } catch(e) {
    console.log('UA Search UI:',e);
   }
  },2000);

  note('UA Search 0.8.4 активовано');
 }

 if(window.appready)
  ready();
 else {
  Lampa.Listener.follow('app',function(e) {
   if(e.type === 'ready')
    ready();
  });
 }

 window.UASearch084 = {
  open:menu,
  search:search
 };
}

init();
})();
