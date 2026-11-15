
(function () {
'use strict';

if (window.UA_SEARCH_083) return;
window.UA_SEARCH_083 = true;

var API = 'https://uakino.ax';
var COMPONENT = 'ua_search_083';
var CONTROL = 'ua_search_083_control';

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

var state = {
 cat: 'new',
 year: 'all',
 rating: 0,
 sort: 'default'
};

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
  var seen = {};
  var out = [];
  var term = norm(query);

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

function getYear(it) {
 return Number(it.year ||
  (it.release_date || it.first_air_date || '').slice(0,4)
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

 return parts.join('  ·  ');
}

function filtered(items,cat) {
 var out = items.slice();

 if(state.year !== 'all') {
  out = out.filter(function(it) {
   var y = getYear(it);
   if(!y) return false;

   if(state.year === '2020+')
    return y >= 2020;

   if(state.year === '2010-2019')
    return y >= 2010 && y <= 2019;

   if(state.year === 'before2010')
    return y < 2010;

   return true;
  });
 }

 if(state.rating > 0) {
  out = out.filter(function(it) {
   return getRating(it) >= state.rating;
  });
 }

 if(state.sort === 'rating') {
  out.sort(function(a,b) {
   return getRating(b) - getRating(a);
  });
 }

 if(state.sort === 'year') {
  out.sort(function(a,b) {
   return getYear(b) - getYear(a);
  });
 }

 if(state.sort === 'title') {
  out.sort(function(a,b) {
   return String(a.title || a.name || '')
    .localeCompare(String(b.title || b.name || ''),'uk');
  });
 }

 return out;
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

  if(!/\.m3u8($|\?)/i.test(url))
   url += '.m3u8';

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
 var root,scroll,body,filterBar;
 var tiles = [];
 var controls = [];
 var allItems = [];
 var cursor = 0;
 var filterCursor = 0;
 var zone = 'tiles';
 var destroyed = false;
 var started = false;
 var requestId = 0;
 var previousController = 'content';

 function active() {
  try {
   var a = Lampa.Activity.active();
   return a && a.component === COMPONENT;
  } catch(e) { return false; }
 }

 function restore() {
  try {
   Lampa.Controller.toggle(previousController);
  } catch(e) {
   try { Lampa.Controller.toggle('content'); }
   catch(err) {}
  }
 }

 function focusElement(el) {
  if(!el || destroyed || !active()) return;

  var $el = $(el);

  if(!$el.length || !$.contains(document,el))
   return;

  try {
   Lampa.Controller.collectionSet(scroll.render());
   Lampa.Controller.collectionFocus($el,scroll.render());
   scroll.update($el,true);
  } catch(e) {
   console.log('UA Search focus:',e);
  }
 }

 function focusTile(i) {
  if(!tiles.length) return;

  zone = 'tiles';
  cursor = Math.max(0,Math.min(tiles.length-1,i));
  focusElement(tiles[cursor]);
 }

 function focusFilter(i) {
  if(!controls.length) return;

  zone = 'filters';
  filterCursor = Math.max(
   0,Math.min(controls.length-1,i)
  );

  focusElement(controls[filterCursor]);
 }

 function columns() {
  if(tiles.length < 2) return 1;

  var y = tiles[0].getBoundingClientRect().top;
  var count = 0;

  for(var i=0;i<tiles.length;i++) {
   if(Math.abs(
    tiles[i].getBoundingClientRect().top-y
   ) > 5) break;
   count++;
  }

  return Math.max(1,count);
 }

 function move(direction) {
  if(zone === 'filters') {
   if(direction === 'left')
    return focusFilter(filterCursor-1);

   if(direction === 'right')
    return focusFilter(filterCursor+1);

   if(direction === 'down' && tiles.length)
    return focusTile(0);

   if(direction === 'up')
    return Lampa.Controller.toggle('head');

   return;
  }

  if(!tiles.length) {
   if(direction === 'up' && controls.length)
    focusFilter(0);
   return;
  }

  var cols = columns();
  var next = cursor;

  if(direction === 'up') {
   if(cursor < cols) {
    if(controls.length) focusFilter(0);
    else Lampa.Controller.toggle('head');
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
   if(cursor%cols !== cols-1 &&
      cursor+1 < tiles.length)
    next = cursor+1;
  }

  focusTile(next);
 }

 function choose(title,items,selected,callback) {
  Lampa.Select.show({
   title:title,
   items:items,
   onBack:function() {
    if(active()) {
     Lampa.Controller.toggle(CONTROL);
     focusFilter(filterCursor);
    }
   },
   onSelect:function(it) {
    callback(it.value);

    try { Lampa.Select.hide(); } catch(e) {}

    renderFilters();
    draw();

    setTimeout(function() {
     if(active()) {
      Lampa.Controller.toggle(CONTROL);
      focusFilter(filterCursor);
     }
    },80);
   }
  });
 }

 function filterAction(type) {
  if(type === 'year') {
   choose('Рік випуску',[
    {title:'Усі роки',value:'all'},
    {title:'2020 і новіші',value:'2020+'},
    {title:'2010–2019',value:'2010-2019'},
    {title:'До 2010',value:'before2010'}
   ],state.year,function(v) {
    state.year = v;
   });
  }

  if(type === 'rating') {
   choose('Мінімальний рейтинг',[
    {title:'Будь-який',value:0},
    {title:'Від 5',value:5},
    {title:'Від 6',value:6},
    {title:'Від 7',value:7},
    {title:'Від 8',value:8},
    {title:'Від 9',value:9}
   ],state.rating,function(v) {
    state.rating = v;
   });
  }

  if(type === 'sort') {
   choose('Сортування',[
    {title:'За замовчуванням',value:'default'},
    {title:'За рейтингом',value:'rating'},
    {title:'За роком',value:'year'},
    {title:'За назвою',value:'title'}
   ],state.sort,function(v) {
    state.sort = v;
   });
  }

  if(type === 'reset') {
   state.year = 'all';
   state.rating = 0;
   state.sort = 'default';
   renderFilters();
   draw();
   focusFilter(0);
  }
 }

 function renderFilters() {
  filterBar.empty();
  controls = [];

  var definitions = [
   ['year','Рік: ' +
    (state.year === 'all' ? 'Усі' : state.year)],
   ['rating','Рейтинг: ' +
    (state.rating || 'Усі')],
   ['sort','Сортування: ' +
    ({default:'Звичайне',rating:'Рейтинг',
      year:'Рік',title:'Назва'}[state.sort])],
   ['reset','Скинути']
  ];

  definitions.forEach(function(def) {
   var el = $(
    '<div class="uas83-filter selector"></div>'
   );

   el.text(def[1]);

   el.on('hover:enter',function() {
    filterAction(def[0]);
   });

   el.on('hover:focus',function() {
    zone = 'filters';
    filterCursor = controls.indexOf(el[0]);
   });

   filterBar.append(el);
   controls.push(el[0]);
  });
 }

 function draw() {
  if(destroyed) return;

  body.empty();
  tiles = [];
  cursor = 0;

  var items = filtered(allItems,o.cat);

  if(!items.length) {
   body.append(
    $('<div class="uas83-empty"></div>')
     .text('Немає результатів для вибраних фільтрів')
   );
   return;
  }

  var grid = $('<div class="uas83-grid"></div>');

  items.forEach(function(it) {
   var el = $(
    '<div class="uas83-card selector">' +
     '<div class="uas83-poster"></div>' +
     '<div class="uas83-name"></div>' +
     '<div class="uas83-meta"></div>' +
    '</div>'
   );

   var poster = posterUrl(it);

   if(poster) {
    el.find('.uas83-poster').css(
     'background-image',
     'url("' + poster.replace(/"/g,'%22') + '")'
    );
   }

   el.find('.uas83-name').text(
    it.title || it.name || 'Без назви'
   );

   el.find('.uas83-meta').text(metadata(it));

   el.on('hover:enter',function() {
    openItem(it);
   });

   el.on('hover:focus',function() {
    zone = 'tiles';
    cursor = tiles.indexOf(el[0]);
   });

   grid.append(el);
   tiles.push(el[0]);
  });

  body.append(grid);

  try { Lampa.Layer.update(); } catch(e) {}

  if(started && active()) {
   setTimeout(function() {
    if(!destroyed && active() &&
       zone === 'tiles')
     focusTile(0);
   },100);
  }
 }

 this.create = function() {
  root = $('<div class="uas83-page"></div>');

  scroll = new Lampa.Scroll({
   mask:true,
   over:true,
   step:250
  });

  try { scroll.minus(); } catch(e) {}

  filterBar = $('<div class="uas83-filters"></div>');
  body = $('<div class="uas83-body"></div>');

  body.text('Завантаження…');

  scroll.append(filterBar);
  scroll.append(body);
  root.append(scroll.render());

  renderFilters();

  var current = ++requestId;
  var promise = o.query ?
   findItems(o.query) : list(o.cat || 'new',1);

  promise.then(function(items) {
   if(destroyed || current !== requestId) return;

   allItems = items;
   draw();
  }).catch(function(e) {
   if(!destroyed && current === requestId)
    body.text('Помилка: ' + e.message);
  });
 };

 this.start = function() {
  started = true;

  try {
   var current = Lampa.Controller.enabled();
   if(current && current !== CONTROL)
    previousController = current;
  } catch(e) {}

  Lampa.Controller.add(CONTROL,{
   toggle:function() {
    if(destroyed) return;

    if(zone === 'filters' && controls.length)
     focusFilter(filterCursor);
    else if(tiles.length)
     focusTile(cursor);
    else if(controls.length)
     focusFilter(0);
   },

   up:function(){move('up');},
   down:function(){move('down');},
   left:function(){move('left');},
   right:function(){move('right');},

   enter:function() {
    if(zone === 'filters' && controls[filterCursor]) {
     $(controls[filterCursor]).trigger('hover:enter');
    } else if(tiles[cursor]) {
     $(tiles[cursor]).trigger('hover:enter');
    }
   },

   back:function() {
    started = false;
    Lampa.Activity.backward();
   }
  });

  Lampa.Controller.toggle(CONTROL);
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
  controls = [];

  setTimeout(function() {
   try {
    if(Lampa.Controller.enabled() === CONTROL)
     restore();
   } catch(e) {}
  },0);
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
   show(v.trim(),'','Пошук: '+v.trim());
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
  title:'UA Search 0.8.3',
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
 if($('.menu [data-uas83="menu"]').length) return;

 var target = $('.menu .menu__list').first();
 if(!target.length) return;

 var item = $(
  '<li class="menu__item selector" data-uas83="menu">' +
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

 var area = page.find(
  '.search, .search-box, .search__body'
 ).first();

 if(!area.length) return;
 if(area.find('[data-uas83="search"]').length) return;

 var button = $(
  '<div class="uas83-search selector" data-uas83="search">' +
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
 '.uas83-page{height:100%}' +
 '.uas83-filters{display:flex;flex-wrap:wrap;gap:.7em;padding:1.2em 3em .4em}' +
 '.uas83-filter{padding:.65em 1em;border-radius:.5em;background:#303642;color:#fff;font-size:1em}' +
 '.uas83-filter.focus{background:#fff;color:#111}' +
 '.uas83-body{padding:1em 3em 4em}' +
 '.uas83-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}' +
 '.uas83-card{min-width:0;padding:.4em;border-radius:.6em}' +
 '.uas83-card.focus{background:#fff;color:#111}' +
 '.uas83-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.35em}' +
 '.uas83-name{font-size:1.1em;font-weight:600;line-height:1.3;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
 '.uas83-meta{font-size:.9em;opacity:.7;margin-top:.3em;min-height:1.2em}' +
 '.uas83-empty{padding:2em;opacity:.7}' +
 '.uas83-search{padding:.7em 1em;margin:.5em;border-radius:.5em;background:#1f6feb;color:#fff}' +
 'body.true--mobile .uas83-grid{grid-template-columns:repeat(3,minmax(0,1fr))}';

 $('<style id="uas83-style"></style>')
  .text(css).appendTo('head');

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

  note('UA Search 0.8.3 активовано');
 }

 if(window.appready) ready();
 else {
  Lampa.Listener.follow('app',function(e) {
   if(e.type === 'ready') ready();
  });
 }

 window.UASearch083 = {
  open:menu,
  search:search
 };
}

init();
})();
