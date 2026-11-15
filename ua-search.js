
(function () {
'use strict';

if (window.UA_SEARCH_120) return;
window.UA_SEARCH_120 = true;

var API = 'https://uakino.ax';
var COMPONENT = 'ua_search_120';
var LIMIT = 60;
var MAX_PAGES = 30;

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

var DEBUG = true;

function log() {
 if(DEBUG && window.console) {
  var a = Array.prototype.slice.call(arguments);
  a.unshift('[UA Search 0.8.7]');
  console.log.apply(console,a);
 }
}

function note(s) {
 try { Lampa.Noty.show(s); }
 catch(e) { log(s); }
}

function enc(s) {
 return encodeURIComponent(s == null ? '' : String(s));
}

function norm(s) {
 return String(s || '').toLowerCase()
  .replace(/[^a-zа-яіїєґ0-9]+/gi,' ')
  .trim();
}

function http(url,json) {
 return new Promise(function(resolve,reject) {
  var x = new XMLHttpRequest();

  x.open('GET',url,true);
  x.timeout = 20000;

  x.onload = function() {
   if(x.status < 200 || x.status >= 300) {
    reject(Error('HTTP '+x.status));
    return;
   }

   try {
    resolve(json ? JSON.parse(x.responseText) : x.responseText);
   } catch(e) {
    reject(e);
   }
  };

  x.onerror = function() {
   reject(Error('Помилка мережі / CORS'));
  };

  x.ontimeout = function() {
   reject(Error('Таймаут'));
  };

  x.send();
 });
}

function request(path) {
 return http(API+path,true);
}

function list(cat,page) {
 if(cat.indexOf('ext_')===0)return externalList(cat,page);
 return request(
  '/hls/api/lampa/list?cat='+enc(cat)+
  '&page='+page+'&limit='+LIMIT
 ).then(function(d) {
  return Array.isArray(d.results) ? d.results : [];
 });
}

function absolute(url,base) {
 if(!url) return '';

 try {
  return new URL(url,base || API+'/').href;
 } catch(e) {
  if(/^https?:/i.test(url)) return url;
  return API+(url.charAt(0)==='/'?'':'/')+url;
 }
}

function posterUrl(it) {
 var p = it.poster || it.poster_path || it.img || '';

 if(!p) return '';
 if(/^https?:/i.test(p)) return p;

 if(p.indexOf('/t/p/')===0)
  return 'https://image.tmdb.org'+p;

 if(p.charAt(0)==='/') return API+p;

 return 'https://image.tmdb.org/t/p/w342/'+p;
}

function yearOf(it) {
 return Number(
  it.year ||
  String(it.release_date || it.first_air_date || '')
   .slice(0,4)
 ) || 0;
}

function ratingOf(it) {
 return Number(it.rating || it.vote_average) || 0;
}

function titleOf(it) {
 return it.title || it.name || 'Без назви';
}

function itemKey(it) {
 return String(
  it.uakino_id || it.id || it.url ||
  it.title || it.name || ''
 );
}

function metadata(it) {
 var p = [];

 if(yearOf(it)) p.push(String(yearOf(it)));
 if(ratingOf(it))
  p.push('★ '+ratingOf(it).toFixed(1));

 return p.join(' · ');
}

function parseAttributes(s) {
 var out = {};
 var re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
 var m;

 while((m=re.exec(s)))
  out[m[1]] = m[2].replace(/^"|"$/g,'');

 return out;
}

function parseMaster(text,url) {
 var lines = String(text).split(/\r?\n/);
 var qualities = [];

 for(var i=0;i<lines.length;i++) {
  var line = lines[i].trim();

  if(line.indexOf('#EXT-X-STREAM-INF:')!==0)
   continue;

  var a = parseAttributes(line.substring(18));
  var next = '';

  for(var j=i+1;j<lines.length;j++) {
   var v = lines[j].trim();

   if(v && v.charAt(0)!=='#') {
    next = v;
    break;
   }
  }

  if(!next) continue;

  var height = Number(
   (a.RESOLUTION || '').split('x')[1]
  ) || 0;

  qualities.push({
   name:height ? height+'p' : 'Варіант',
   height:height,
   bandwidth:Number(a.BANDWIDTH)||0,
   url:absolute(next,url)
  });
 }

 qualities.sort(function(a,b) {
  return b.height-a.height ||
   b.bandwidth-a.bandwidth;
 });

 return qualities;
}

function resolveStream(it) {
 var id = it.uakino_id || it.id;

 if(!id)
  return Promise.reject(Error('Відсутній UAKino ID'));

 return request(
  '/hls/api/play?movie='+enc(id)+
  '&s=lp'+Date.now()
 ).then(function(data) {
  var url = absolute(
   data.manifest_abs || data.manifest
  );

  if(!url) throw Error('Потік недоступний');

  return {url:url,data:data};
 });
}

function playStream(it,stream,quality) {
 var url = quality && quality.url ?
  quality.url : stream.url;

 var item = {
  title:titleOf(it),
  url:url,
  hls_type:'hlsjs'
 };

 if(stream.data && Array.isArray(stream.data.subs)) {
  item.subtitles = stream.data.subs.map(function(s) {
   return {
    label:s.label || 'Субтитри',
    url:absolute(s.url)
   };
  });
 }

 try {
  Lampa.Player.play(item);
  Lampa.Player.playlist([item]);
 } catch(e) {
  note('Помилка плеєра: '+e.message);
 }
}

function castOf(it) {
 var raw = it.cast || it.actors || it.stars || [];

 if(typeof raw==='string') {
  return raw.split(/[,;]/).map(function(s) {
   return {name:s.trim()};
  }).filter(function(a) {
   return !!a.name;
  });
 }

 if(!Array.isArray(raw)) return [];

 return raw.map(function(a) {
  if(typeof a==='string') return {name:a};

  return {
   name:a.name || a.actor || '',
   character:a.character || a.role || '',
   photo:a.profile_path || a.photo || a.image || ''
  };
 }).filter(function(a) {
  return !!a.name;
 });
}

function reactionsOf(it) {
 var r = it.reactions || it.votes || {};

 var likes = it.likes;
 var dislikes = it.dislikes;

 if(likes == null) likes = r.likes;
 if(dislikes == null) dislikes = r.dislikes;

 if(likes == null && dislikes == null)
  return null;

 return {
  likes:Number(likes)||0,
  dislikes:Number(dislikes)||0
 };
}

/* ============================================
   CONTROLLER / SEARCH FIX
============================================ */

var searchSession = null;
var searchSessionId = 0;

function controllerName() {
 try {
  return String(Lampa.Controller.enabled() || '');
 } catch(e) {
  return '';
 }
}

function menuElement() {
 return $('.menu [data-uas120="menu"]').first();
}

function focusMenu() {
 try {
  Lampa.Controller.toggle('menu');

  var el = menuElement();

  if(el.length) {
   Lampa.Controller.collectionSet($('.menu'));
   Lampa.Controller.collectionFocus(el,$('.menu'));
  }

  log('Menu focus restored',controllerName());
 } catch(e) {
  log('Menu focus error',e.message);

  try {Lampa.Controller.toggle('menu');}
  catch(err) {}
 }
}

function restoreAfterSearch(session,reason) {
 if(!session || session.finished) return;

 session.finished = true;

 log('Restore requested:',reason);

 if(session.cleanup) session.cleanup();
 if(session.observer) {
  try {session.observer.disconnect();}
  catch(e) {}
 }
 if(session.timer) clearInterval(session.timer); if(session.backTimer)  clearTimeout(session.backTimer); if(searchSession === session)
  searchSession = null;

 // Let Lampa finish closing its input/modal first.
 setTimeout(function() {
  log('Controller before restore:',controllerName());

  focusMenu();

  setTimeout(function() {
   var current = controllerName();

   log('Controller after restore:',current);

   // Second activation handles delayed input cleanup.
   if(current !== 'menu') focusMenu();
  },180);

 },120);
}

function finishSearch(session,value) {
 if(!session || session.finished) return;

 var text = String(value || '').trim();

 if(text) {
  session.finished = true;
  if(session.cleanup) session.cleanup();

  if(session.observer) {
   try {session.observer.disconnect();}
   catch(e) {}
  }

  if(session.timer) clearInterval(session.timer);
  if(session.backTimer) clearTimeout(session.backTimer);

  if(searchSession === session)
   searchSession = null;

  log('Search submitted:',text);

  show(text,'new','Пошук: '+text);

 } else {
  restoreAfterSearch(session,'empty callback');
 }
}

function isSearchInputVisible() {
 // These selectors are intentionally broad:
 // Lampa skins can render different keyboard layouts.
 var selectors = [
  '.input--visible',
  '.input__body:visible',
  '.simple-keyboard:visible',
  '.keyboard:visible',
  '.modal--visible',
  '.modal:visible input',
  '.input:visible input',
  'input:focus',
  'textarea:focus'
 ];

 for(var i=0;i<selectors.length;i++) {
  try {
   if($(selectors[i]).length) return true;
  } catch(e) {}
 }

 return false;
}

function search() {
 if(searchSession && !searchSession.finished) {
  log('Search already active');
  return;
 }

 var session = {
  id:++searchSessionId,
  finished:false,
  openedAt:Date.now(),
  seenInput:false,
  observer:null,
  timer:null,
  backTimer:null,
  lastController:controllerName()
 };

 searchSession = session;

 log('Opening search, controller:',session.lastController);

 // Important:
 // Do not restore the old "select" controller.
 // The category picker is already closed.
 function cancelledByBack() {
  if(session.finished) return;
  if(session.backTimer) clearTimeout(session.backTimer);
  session.backTimer = setTimeout(function() {
   if(session.finished) return;

   log('Back detected, controller:',controllerName());

   // The keyboard has had time to process Back.
   restoreAfterSearch(session,'Back key');
  },160);
 }

 function onKey(e) {
  if(session.finished) return;

  var key = e.key || '';
  var code = e.keyCode || e.which;

  if(
   key==='Escape' ||
   key==='BrowserBack' ||
   key==='GoBack' ||
   code===27 ||
   code===461 ||
   code===10009
  ) {
   cancelledByBack();
  }
 }

 document.addEventListener('keydown',onKey,true);

 var originalFinish = finishSearch;

 function cleanupListener() {
  document.removeEventListener('keydown',onKey,true);
 }

 var oldRestore = restoreAfterSearch;

 // Listener is removed by the session cleanup.
 session.cleanup = cleanupListener;

 try {
  Lampa.Input.edit({
   title:'Пошук UAKino',
   value:'',
   free:true
  },function(value) {
   cleanupListener();
   originalFinish(session,value);
  });
 } catch(e) {
  cleanupListener();
  log('Input error:',e.message);
  restoreAfterSearch(session,'input exception');
  return;
 }

 // Observe changes to input/modal DOM.
 // This is a fallback for Lampa builds where Back
 // closes the input without invoking its callback.
 try {
  session.observer = new MutationObserver(function() {
   if(session.finished) return;

   if(isSearchInputVisible())
    session.seenInput = true;

   if(
    session.seenInput &&
    !isSearchInputVisible() &&
    Date.now()-session.openedAt>350
   ) {
    cleanupListener();
    restoreAfterSearch(session,'input removed');
   }
  });

  session.observer.observe(document.body,{
   childList:true,
   subtree:true,
   attributes:true,
   attributeFilter:['class','style']
  });
 } catch(e) {
  log('Observer unavailable:',e.message);
 }

 // Fallback for native keyboard implementations.
 var ticks = 0;

 session.timer = setInterval(function() {
  if(session.finished) {
   clearInterval(session.timer);
   cleanupListener();
   return;
  }

  ticks++;

  var visible = isSearchInputVisible();

  if(visible) session.seenInput = true;

  if(
   session.seenInput &&
   !visible &&
   ticks>5
  ) {
   cleanupListener();
   restoreAfterSearch(session,'keyboard disappeared');
   return;
  }

  // Do not leave a permanent polling timer.
  if(ticks>=300) {
   clearInterval(session.timer);
   log('Search watcher timeout');
  }

 },100);

 // Wrap cleanup to also remove the keyboard listener.
 var originalCleanup = session.cleanup;

 session.cleanup = function() {
  originalCleanup();
 };
}

/* ============================================
   CATALOG COMPONENT
============================================ */

function Page(o) {
 var root,scroll,filterBar,statusBar,body,detail;
 var tiles=[],filters=[],detailControls=[];
 var allItems=[],visibleItems=[],seen={};

 var cursor=0,filterCursor=0,detailCursor=0;
 var zone='tiles',view='catalog';

 var selected=null;
 var stream=null;
 var qualities=[];
 var selectedQuality=null;

 var page=0;
 var loading=false;
 var hasMore=true;
 var started=false;
 var destroyed=false;
 var requestId=0;
 var detailRequest=0;
 var emptyPages=0;

 var category=o.cat || 'new';
 var query=String(o.query || '');

 var settings={
  year:'all',
  rating:0,
  sort:'default'
 };

 function active() {
  if(destroyed) return false;

  try {
   var a=Lampa.Activity.active();
   return !!(a && a.component===COMPONENT);
  } catch(e) {
   return false;
  }
 }

 function focus(el) {
  if(!el || !active()) return;
  if(!$.contains(document,el)) return;
  try {
   var wrap=scroll.render();
   Lampa.Controller.collectionSet(wrap);
   Lampa.Controller.collectionFocus($(el),wrap);
   // Lampa.Scroll uses translate3d on TV, not native scrollTop.
   // Its viewport must be sized by Layer before update can move rows.
   scroll.update($(el),true);
  } catch(e) { log('Focus error:',e.message); }
 }

 function focusTile(n) {
  if(!tiles.length) return;

  zone='tiles';
  cursor=Math.max(0,Math.min(tiles.length-1,n));
  focus(tiles[cursor]);
 }

 function focusFilter(n) {
  if(!filters.length) return;

  zone='filters';
  filterCursor=Math.max(
   0,Math.min(filters.length-1,n)
  );
  focus(filters[filterCursor]);
 }

 function focusDetail(n) {
  if(!detailControls.length) return;

  zone='detail';
  detailCursor=Math.max(
   0,Math.min(detailControls.length-1,n)
  );
  focus(detailControls[detailCursor]);
 }

 function restoreFocus() {
  if(!active()) return;

  if(view==='detail')
   focusDetail(detailCursor);
  else if(zone==='filters')
   focusFilter(filterCursor);
  else if(tiles.length)
   focusTile(cursor);
  else
   focusFilter(filterCursor);
 }

 function columns() {  if(tiles.length<2) return 1;

  var y=tiles[0].getBoundingClientRect().top;
  var n=0;

  for(var i=0;i<tiles.length;i++) {
   if(Math.abs(
    tiles[i].getBoundingClientRect().top-y
   )>5) break;
   n++;
  }

  return Math.max(1,n); }
 function move(dir) {  if(!active()) return;

  if(view==='detail') {
   if(dir==='up') {
    if(detailCursor===0)
     Lampa.Controller.toggle('head');    else
     focusDetail(detailCursor-1);   }

   if(dir==='down')
    focusDetail(detailCursor+1);

   if(dir==='left')
    Lampa.Controller.toggle('menu');

   return;
  }

  if(zone==='filters') {
   if(dir==='left') {
    if(filterCursor===0)
     Lampa.Controller.toggle('menu');
    else
     focusFilter(filterCursor-1);
   }

   if(dir==='right')
    focusFilter(filterCursor+1);

   if(dir==='down' && tiles.length)
    focusTile(cursor);

   if(dir==='up')
    Lampa.Controller.toggle('head');

   return;
  }

  if(!tiles.length) {
   if(dir==='up') focusFilter(filterCursor);
   if(dir==='left') Lampa.Controller.toggle('menu');
   return;
  }

  var cols=columns();
  var next=cursor;

  if(dir==='up') {
   if(cursor<cols) {
    focusFilter(filterCursor);
    return;
   }

   next=cursor-cols;
  }

  if(dir==='down')
   next=Math.min(tiles.length-1,cursor+cols);

  if(dir==='left') {
   if(cursor%cols===0) {
    Lampa.Controller.toggle('menu');
    return;
   }

   next=cursor-1;
  }

  if(
   dir==='right' &&
   cursor%cols!==cols-1 &&
   cursor+1<tiles.length
  ) next=cursor+1;

  focusTile(next);

  if(
   dir==='down' &&
   cursor>=tiles.length-cols*3
  ) loadNext();
 }

 function updateStatus(msg) {
  if(!statusBar) return;

  statusBar.text(
   'Завантажено: '+allItems.length+
   ' · Показано: '+visibleItems.length+
   ' · Сторінка: '+page+
   (msg?' · '+msg:'')
  );
 }

 function applyFilters() {
  var result=allItems.slice();

  if(query) {
   var term=norm(query);

   result=result.filter(function(it) {
    return norm([
     it.title,
     it.name,
     it.original,
     it.original_title,
     it.original_name
    ].join(' ')).indexOf(term)>=0;
   });
  }

  if(settings.year!=='all') {
   result=result.filter(function(it) {
    var y=yearOf(it);
    if(!y) return false;

    if(settings.year==='2020+')
     return y>=2020;

    if(settings.year==='2010-2019')
     return y>=2010 && y<=2019;

    if(settings.year==='before2010')
     return y<2010;

    if(/^\d{4}$/.test(String(settings.year)))
     return y===Number(settings.year);

    return true;
   });
  }

  if(settings.rating) {
   result=result.filter(function(it) {
    return ratingOf(it)>=settings.rating;
   });
  }

  if(settings.sort==='rating') {
   result.sort(function(a,b) {
    return ratingOf(b)-ratingOf(a);
   });
  }

  if(settings.sort==='year') {
   result.sort(function(a,b) {
    return yearOf(b)-yearOf(a);
   });
  }

  if(settings.sort==='title') {
   result.sort(function(a,b) {
    return titleOf(a).localeCompare(titleOf(b),'uk');
   });
  }

  return result;
 }

 function makeCard(it) {
  var el=$(
   '<div class="uas120-card selector">'+
    '<div class="uas120-poster"></div>'+
    '<div class="uas120-name"></div>'+
    '<div class="uas120-meta"></div>'+
   '</div>'
  );

  var p=posterUrl(it);

  if(p) {
   el.find('.uas120-poster').css(
    'background-image',
    'url("'+p.replace(/"/g,'%22')+'")'
   );
  }

  el.find('.uas120-name').text(titleOf(it));
  el.find('.uas120-meta').text(metadata(it));

  el.on('hover:enter',function() {
   openDetails(it);
  });

  el.on('hover:focus',function() {
   zone='tiles';

   var n=tiles.indexOf(el[0]);
   if(n>=0) cursor=n;
  });

  return el;
 }

 function draw(preserve) {
  if(destroyed) return;

  var oldKey=null;

  if(preserve && tiles[cursor])
   oldKey=$(tiles[cursor]).attr('data-key');

  visibleItems=applyFilters();
  body.empty();
  tiles=[];

  if(!visibleItems.length) {
   body.append(
    $('<div class="uas120-empty"></div>')
     .text(
      loading ?
      'Завантаження…' :
      'Немає результатів для вибраних фільтрів'
     )
   );

   updateStatus(loading?'Завантаження…':'');
   return;
  }

  var grid=$('<div class="uas120-grid"></div>');

  visibleItems.forEach(function(it,index) {
   var el=makeCard(it);

   el.attr('data-key',itemKey(it));
   grid.append(el);
   tiles.push(el[0]);

   if(oldKey && itemKey(it)===oldKey)
    cursor=index;
  });

  body.append(grid);

  cursor=Math.max(
   0,Math.min(cursor,tiles.length-1)
  );

  updateStatus(loading?'Завантаження…':'');

  try {Lampa.Layer.update();}
  catch(e) {}

  if(started && active() && view==='catalog') {
   setTimeout(function() {
    if(started && active() && view==='catalog')
     restoreFocus();
   },80);
  }
 }

 function loadNext() {
  if(destroyed || loading || !hasMore) return;

  if(page>=MAX_PAGES) {
   hasMore=false;
   updateStatus('Ліміт сторінок');
   return;
  }

  loading=true;

  var next=page+1;
  var token=++requestId;

  updateStatus('Завантаження…');

  list(category,next).then(function(items) {
   if(destroyed || token!==requestId) return;

   var added=0;

   items.forEach(function(it) {
    var key=itemKey(it);

    if(!key || seen[key]) return;

    seen[key]=true;
    allItems.push(it);
    added++;
   });

   page=next;
   loading=false;

   if(!items.length)
    hasMore=false;
   else if(!added) {
    emptyPages++;
    if(emptyPages>=2) hasMore=false;
   } else {
    emptyPages=0;
   }

   draw(true);

   if(!hasMore)
    updateStatus('Кінець каталогу');
   else if(!visibleItems.length)
    loadNext();

  }).catch(function(e) {
   if(destroyed || token!==requestId) return;

   loading=false;
   updateStatus('Помилка: '+e.message);
  });
 }

 function selectOptions(title,items,callback) {
  Lampa.Select.show({
   title:title,
   items:items,

   onBack:function() {
    setTimeout(function() {
     if(active()) {
      Lampa.Controller.toggle('content');
      restoreFocus();
     }
    },70);
   },

   onSelect:function(it) {
    callback(it.value);

    try {Lampa.Select.hide();}
    catch(e) {}

    setTimeout(function() {
     if(active()) {
      Lampa.Controller.toggle('content');
      restoreFocus();
     }
    },70);
   }  });
 }

 function filterAction(type) {
  if(type==='reset') {
   settings={
    year:'all',
    rating:0,
    sort:'default'
   };

   renderFilters();
   draw(true);   focusFilter(0);   return;
  }

  var choices=[];
  var title='';

  if(type==='year') {
   title='Рік випуску';
   choices=[
    {title:'Усі роки',value:'all'},    {title:'2020 і новіші',value:'2020+'},
    {title:'2010–2019',value:'2010-2019'},
    {title:'До 2010',value:'before2010'}
   ];
   choices.push({title:'──── Конкретний рік ────',value:'all'});
   for(var yr=new Date().getFullYear();yr>=1950;yr--)
    choices.push({title:String(yr),value:String(yr)});
  }

  if(type==='rating') {
   title='Мінімальний рейтинг';

   choices=[
    {title:'Будь-який',value:0},
    {title:'Від 5',value:5},
    {title:'Від 6',value:6},
    {title:'Від 7',value:7},
    {title:'Від 8',value:8},
    {title:'Від 9',value:9}
   ];
  }

  if(type==='sort') {
   title='Сортування';

   choices=[
    {title:'Звичайне',value:'default'},
    {title:'За рейтингом',value:'rating'},
    {title:'За роком',value:'year'},
    {title:'За назвою',value:'title'}
   ];
  }
  selectOptions(title,choices,function(v){
   settings[type]=v;
   renderFilters();
   draw(true);
  });
 }
 function renderFilters(){
  filterBar.empty();
  filters=[];
  var names={default:'Звичайне',rating:'Рейтинг',year:'Рік',title:'Назва'};
  [
   ['year','Рік: '+(settings.year==='all'?'Усі':settings.year)],
   ['rating','Рейтинг: '+(settings.rating||'Усі')],
   ['sort','Сортування: '+names[settings.sort]],
   ['reset','Скинути']
  ].forEach(function(pair){
   var el=$('<div class="uas120-filter selector"></div>').text(pair[1]);
   el.on('hover:enter',function(){filterAction(pair[0]);});
   el.on('hover:focus',function(){zone='filters';filterCursor=filters.indexOf(el[0]);});
   filterBar.append(el);
   filters.push(el[0]);
  });
 }
 function addDetailControl(label,fn){
  var el=$('<div class="uas120-action selector"></div>').text(label);
  el.on('hover:enter',fn);
  el.on('hover:focus',function(){zone='detail';detailCursor=detailControls.indexOf(el[0]);});
  detail.append(el);
  detailControls.push(el[0]);
 }
 function renderDetails(){
  if(destroyed||view!=='detail'||!selected)return;
  detail.empty();
  detailControls=[];
  var head=$('<div class="uas120-detail-head"></div>');
  var image=$('<div class="uas120-detail-poster"></div>');
  var p=posterUrl(selected);
  if(p)image.css('background-image','url("'+p.replace(/"/g,'%22')+'")');
  var info=$('<div class="uas120-detail-info"></div>');
  info.append($('<div class="uas120-detail-title"></div>').text(titleOf(selected)));
  info.append($('<div class="uas120-meta"></div>').text(metadata(selected)));
  info.append($('<div class="uas120-description"></div>').text(selected.overview||selected.description||selected.plot||selected.short_story||'Опис відсутній'));
  head.append(image,info);
  detail.append(head);
  var reactions=reactionsOf(selected);
  if(reactions)detail.append($('<div class="uas120-reactions"></div>').text('👍 '+reactions.likes+'   👎 '+reactions.dislikes));
  var actors=castOf(selected);
  if(actors.length){
   detail.append($('<div class="uas120-heading"></div>').text('Актори'));
   var row=$('<div class="uas120-cast"></div>');
   actors.slice(0,20).forEach(function(actor){
    var el=$('<div class="uas120-actor"></div>');
    var photo=$('<div class="uas120-actor-photo"></div>');
    if(actor.photo)photo.css('background-image','url("'+absolute(actor.photo).replace(/"/g,'%22')+'")');
    el.append(photo,$('<div></div>').text(actor.name),$('<small></small>').text(actor.character||''));
    row.append(el);
   });
   detail.append(row);
  }
  if(selected.external_source){
   addDetailControl('▶ Знайти відеопотік',function(){
    var item=selected,token=detailRequest;
    note('Перевіряю сторінку відео…');
    externalStreams(item.url).then(function(data){
     if(destroyed||token!==detailRequest||selected!==item)return;
     var rows=data.streams.map(function(x,i){return {title:'▶ '+(i+1)+'. '+x.origin+' · '+x.url.slice(0,90),value:i};});
     if(!data.streams.length)rows.push({title:'Наступна перевірка: player-control / postMessage у index.js',value:-201});
     if(!rows.length)rows.push({title:'Прямих відеопотоків у HTML не знайдено',value:-1});
     rows.push({title:'Діагностика: '+data.iframes.length+' iframe · '+(data.checked||0)+' перевірено · '+data.streams.length+' потоків',value:-2});
     (data.errors||[]).slice(0,3).forEach(function(err,i){rows.push({title:'HTTP помилка '+(i+1)+': '+err,value:-300-i});});
     (data.controlInfo||[]).filter(function(line){return /data-tag1 JSON|ciphertext:|iv:|salt:|не знайдено/i.test(line);}).forEach(function(line,i){rows.push({title:'CONTROL '+(i+1)+': '+line,value:-1100-i});});
     (data.inlinePlayerInfo||[]).forEach(function(line,i){rows.push({title:'INLINE-ПЛЕЄР '+(i+1)+': '+line,value:-1400-i});});
     (data.jsFindings||[]).filter(function(line){return /player-control|data-tag1|ciphertext|decrypt|PBKDF2|AES|postMessage|requestMessage/i.test(line)&&!/збігів немає|CryptoJS доступний/i.test(line);}).slice(0,8).forEach(function(line,i){rows.push({title:'JS-ПЛЕЄР '+(i+1)+': '+line,value:-1200-i});});
     (data.jsErrors||[]).slice(0,3).forEach(function(line,i){rows.push({title:'JS-ПОМИЛКА '+(i+1)+': '+line,value:-1300-i});});
     Lampa.Select.show({
      title:'Відео · '+item.external_source,
      items:rows,
      onSelect:function(row){
       if(row.value<0){try{Lampa.Select.hide();}catch(e){}setTimeout(function(){if(active()){Lampa.Controller.toggle('content');restoreFocus();}},100);return;}
       var candidate=data.streams[row.value];
       if(!candidate)return;
       try{Lampa.Select.hide();}catch(e){}
       try{Lampa.Player.play({title:titleOf(item),url:candidate.url,hls_type:/\.m3u8(?:[?#]|$)/i.test(candidate.url)?'hlsjs':undefined});}
       catch(e){note('Плеєр: '+e.message);}
      },
      onBack:function(){setTimeout(function(){if(active()){Lampa.Controller.toggle('content');restoreFocus();}},100);}
     });
    }).catch(function(e){note('Не вдалося отримати відео: '+e.message);});
   });
   addDetailControl('Сторінка: '+selected.url.slice(0,65),function(){note('Сторінка джерела: '+selected.external_source);});
   addDetailControl('← До каталогу',closeDetails);
   detail.append($('<div class="uas120-stream-status"></div>').text('Діагностика: HTML-маркери, JS-скрипти, елементи плеєра та iframe.'));
   if(started&&active())setTimeout(restoreFocus,70);
   return;
  }
  addDetailControl('▶ Дивитися',function(){
   if(stream)playStream(selected,stream,selectedQuality);
   else note('Завантаження відео…');
  });
  addDetailControl('Якість: '+(selectedQuality?selectedQuality.name:'Auto'),function(){
   if(!stream)return note('Завантаження відео…');
   selectOptions('Якість відео',[{title:'Auto (адаптивна)',value:-1}].concat(qualities.map(function(q,i){return {title:q.name,value:i};})),function(i){
    selectedQuality=i<0?null:qualities[i];
    renderDetails();
    detailCursor=1;
   });
  });
  addDetailControl('← До каталогу',closeDetails);
  detail.append($('<div class="uas120-stream-status"></div>').text(stream?'Доступних варіантів: '+qualities.length:'Завантаження потоку…'));
  if(started&&active())setTimeout(restoreFocus,70);
 }
 function openDetails(it){
  selected=it;stream=null;qualities=[];selectedQuality=null;detailCursor=0;
  view='detail';zone='detail';filterBar.hide();statusBar.hide();body.hide();detail.show();
  renderDetails();
  var token=++detailRequest;
  if(it.external_source)return;
  resolveStream(it).then(function(s){
   if(destroyed||token!==detailRequest||view!=='detail')return;
   stream=s;renderDetails();
   return http(s.url,false).then(function(text){
    if(destroyed||token!==detailRequest||view!=='detail')return;
    qualities=parseMaster(text,s.url);
    renderDetails();
   }).catch(function(){});
  }).catch(function(e){
   if(token===detailRequest&&view==='detail')detail.find('.uas120-stream-status').text('Помилка: '+e.message);
  });
 }
 function closeDetails(){
  detailRequest++;
  view='catalog';
  zone='tiles';
  selected=null;
  detail.hide();
  filterBar.show();
  statusBar.show();
  body.show();
  // Lampa can leave the controller on head/menu after a detail or Select dialog.
  // Restore both the content controller and the previously selected tile.
  setTimeout(function(){
   if(!active())return;
   try{Lampa.Controller.toggle('content');}catch(e){log('Controller restore:',e.message);}
   // Recalculate viewport after hiding details: Lampa.Scroll uses
   // translate3d and needs Layer sizing before scrolling to focused row.
   try{scroll.minus(false);}catch(e){}
   try{Lampa.Layer.update();}catch(e){}
   if(tiles.length)focusTile(cursor);
   else focusFilter(filterCursor);
   setTimeout(function(){
    if(!active()||view!=='catalog')return;
    try{Lampa.Layer.update();}catch(e){}
    var el=zone==='tiles'?tiles[cursor]:filters[filterCursor];
    if(el)try{scroll.update($(el),true);}catch(e){}
   },100);
  },120);
 }
 this.create=function(){
  root=$('<div class="uas120-page"></div>');
  scroll=new Lampa.Scroll({mask:true,over:true,step:250});
  filterBar=$('<div class="uas120-filters"></div>');
  statusBar=$('<div class="uas120-status"></div>');
  body=$('<div class="uas120-body"></div>');
  detail=$('<div class="uas120-detail"></div>').hide();
  scroll.append(filterBar);scroll.append(statusBar);scroll.append(body);scroll.append(detail);
  root.append(scroll.render());
  // Required for Lampa.Layer to calculate the scroll viewport height.
  scroll.minus(false);
  renderFilters();loadNext();
 };
 this.start=function(){
  started=true;
  Lampa.Controller.add('content',{
   toggle:function(){if(active())restoreFocus();},
   up:function(){move('up');},down:function(){move('down');},
   left:function(){move('left');},right:function(){move('right');},
   enter:function(){
    if(!active())return;
    var el=view==='detail'?detailControls[detailCursor]:(zone==='filters'?filters[filterCursor]:tiles[cursor]);
    if(el)$(el).trigger('hover:enter');
   },
   back:function(){if(view==='detail')closeDetails();else{started=false;Lampa.Activity.backward();}}
  });
  Lampa.Controller.toggle('content');
 };
 this.pause=function(){started=false;};
 this.stop=function(){started=false;};
 this.render=function(){return root;};
 this.destroy=function(){destroyed=true;started=false;requestId++;detailRequest++;try{scroll.destroy();}catch(e){}if(root)root.remove();};
}
function show(query,cat,title){
 Lampa.Activity.push({url:'',title:title||'UA Search',component:COMPONENT,query:query||'',cat:cat||'new',page:1});
}


var EXTERNAL_SOURCES={
 uaserials:{name:'UASerials · Фільми',url:'https://uaserials.com/films/'},
 uaserials_series:{name:'UASerials · Серіали',url:'https://uaserials.com/series/'},
 cikava:{name:'Цікава Ідея',url:'https://cikava-ideya.top/'},
 uafix:{name:'UAFIX',url:'https://uafix.cc/'}
};
function externalList(cat,page){
 var src=EXTERNAL_SOURCES[cat.slice(4)];
 if(!src)return Promise.resolve([]);
 var pageUrl=page===1?src.url:src.url+'page/'+page+'/';
 return new Promise(function(resolve,reject){
  var done=false;
  var timer=setTimeout(function(){finish(Error('Таймаут джерела'));},16000);
  function finish(err,items){
   if(done)return;done=true;clearTimeout(timer);
   if(err)reject(err);else resolve(items);
  }
  try{
   var req=new Lampa.Reguest();
   if(typeof req.native!=='function')return finish(Error('Native HTTP недоступний'));
   req.native(pageUrl,function(raw){
    try{
     var html=typeof raw==='string'?raw:(raw&&typeof raw.data==='string'?raw.data:JSON.stringify(raw||''));
     var doc=new DOMParser().parseFromString(String(html),'text/html');
     var anchors=doc.querySelectorAll('a[href]'),items=[],seen={};
     for(var i=0;i<anchors.length;i++){
      var a=anchors[i],img=a.querySelector('img');
      if(!img&&a.parentElement)img=a.parentElement.querySelector('img');
      if(!img)continue;
      var href=a.getAttribute('href')||'',url=absolute(href,pageUrl);
      if(url.indexOf(new URL(src.url).origin+'/')!==0||seen[url])continue;
      if(/\/(?:page|category|genre|year|search|login|register|contact|about|privacy|tag)(?:\/|$)/i.test(url))continue;
      var title=(a.getAttribute('title')||img.getAttribute('alt')||a.textContent||'').replace(/\s+/g,' ').trim();
      if(title.length<3||title.length>130)continue;
      var poster=img.getAttribute('data-src')||img.getAttribute('data-original')||img.getAttribute('data-lazy-src')||img.getAttribute('src')||'';
      if(!poster||poster.indexOf('data:')===0)continue;
      poster=absolute(poster,pageUrl);
      if(!/^https?:\/\//i.test(poster))continue;
      seen[url]=true;
      items.push({title:title,poster:poster,url:url,id:url,external_source:src.name});
      if(items.length>=80)break;
     }
     finish(null,items);
    }catch(e){finish(e);}
   },function(e){finish(Error('HTTP: '+String(e&&e.message||e&&e.status||'помилка')));},false,{dataType:'text'});
  }catch(e){finish(e);}
 });
}


function externalStreams(pageUrl){
 return new Promise(function(resolve,reject){
  var finished=false,timer=setTimeout(function(){finish(Error('Таймаут сторінки 15 с'));},15000);
  function finish(err,result){
   if(finished)return;finished=true;clearTimeout(timer);
   if(err)reject(err);else resolve(result);
  }
  try{
   var req=new Lampa.Reguest();
   if(typeof req.native!=='function')return finish(Error('Native HTTP недоступний'));
   req.native(pageUrl,function(raw){
    try{
     var html=typeof raw==='string'?raw:(raw&&typeof raw.data==='string'?raw.data:JSON.stringify(raw||''));
     var doc=new DOMParser().parseFromString(String(html),'text/html');
     var candidates=[],seen={},embedded=[],diagnostics=[{url:pageUrl,status:'HTML OK',bytes:html.length}];
     function add(url,origin){
      if(!url)return;
      url=String(url).replace(/&amp;/g,'&').replace(/\\\//g,'/');
      if(/^(?:blob:|data:|javascript:)/i.test(url))return;
      url=absolute(url,pageUrl);
      if(!/^https?:\/\//i.test(url)||seen[url])return;
      seen[url]=true;
      if(/\.(?:m3u8|mp4|mpd)(?:[?#]|$)/i.test(url))candidates.push({url:url,origin:origin});
      else if(origin==='iframe')embedded.push(url);
     }
     var els=doc.querySelectorAll('video[src],video source[src],source[src],iframe[src]');
     for(var i=0;i<els.length;i++)add(els[i].getAttribute('src'),els[i].tagName.toLowerCase());
     var attrs=doc.querySelectorAll('[data-file],[data-video],[data-src],[data-hls]');
     for(var j=0;j<attrs.length;j++){
      ['data-file','data-video','data-src','data-hls'].forEach(function(k){
       var v=attrs[j].getAttribute(k);
       if(v&&/\.(?:m3u8|mp4|mpd)(?:[?#]|$)/i.test(v))add(v,k);
      });
     }
     var re=/(?:https?:)?(?:\\\/\\\/|\/\/)[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?/gi,m;
     while((m=re.exec(html))&&candidates.length<20)add(m[0],'html');
     var indicators=[];
     var terms=['player','iframe','embed','video','m3u8','mp4','jwplayer','plyr','hls','ajax','dle','kodik','ashdi','collaps','moonwalk'];
     var lowerHtml=html.toLowerCase();
     terms.forEach(function(term){
      var pos=0,total=0;
      while((pos=lowerHtml.indexOf(term,pos))!==-1&&total<999){total++;pos+=term.length;}
      if(total)indicators.push(term+': '+total);
     });
     var scripts=doc.querySelectorAll('script[src]'),scriptUrls=[];
     for(var si=0;si<scripts.length&&scriptUrls.length<15;si++){
      var scriptUrl=absolute(scripts[si].getAttribute('src'),pageUrl);
      if(scriptUrl&&/^https?:/i.test(scriptUrl))scriptUrls.push(scriptUrl);
     }
     var clues=[],playerSnippets=[],ajaxCalls=[];
     function cleanSnippet(value){
      return String(value||'').replace(/<[^>]*>/g,' ').replace(/\\u00(?:22|3c|3e)/gi,' ').replace(/\s+/g,' ').trim().slice(0,230);
     }
     var tags=doc.querySelectorAll('[id],[class],[data-src],[data-url],[data-file],[data-player]');
     for(var ti=0;ti<tags.length&&clues.length<12;ti++){
      var tag=tags[ti];
      var signature=(tag.tagName+' '+(tag.id||'')+' '+(typeof tag.className==='string'?tag.className:'')).toLowerCase();
      if(!/player|video|episode|series|season|voice|translation|tabs|playlist/.test(signature))continue;
      var attrsText=[];
      for(var ai=0;ai<tag.attributes.length&&attrsText.length<6;ai++){
       var at=tag.attributes[ai];
       if(/^(id|class|data-|onclick)/i.test(at.name))attrsText.push(at.name+'='+at.value.slice(0,80));
      }
      var entry=cleanSnippet(tag.tagName+' '+attrsText.join(' '));
      if(entry&&clues.indexOf(entry)<0)clues.push(entry);
     }
     var inlineScripts=doc.querySelectorAll('script:not([src])');
     for(var is=0;is<inlineScripts.length&&ajaxCalls.length<12;is++){
      var source=inlineScripts[is].textContent||'';
      var rx=/\$\.ajax\s*\(|\$\.post\s*\(|\$\.get\s*\(|fetch\s*\(|dle_news_id|player|playlist|episode/gi;
      var match,found=0;
      while((match=rx.exec(source))&&found<3&&ajaxCalls.length<12){
       var context=cleanSnippet(source.slice(Math.max(0,match.index-75),match.index+155));
       if(context&&!/googletag|adsbygoogle|mirdox|banner|analytics|ratingCount/i.test(context)){
        ajaxCalls.push(context);found++;
       }
      }
     }
     var patterns=['dle-player','dle_player','player-container','player_block','video-player','video_player','data-player','data-file','episode','playlist'];
     patterns.forEach(function(term){
      var start=0,found=0;
      while((start=lowerHtml.indexOf(term,start))>=0&&found<2&&playerSnippets.length<16){
       var snippet=cleanSnippet(html.slice(Math.max(0,start-70),Math.min(html.length,start+180)));
       if(snippet&&!/googletag|adsbygoogle|mirdox|banner/i.test(snippet))playerSnippets.push(term+': '+snippet);
       start+=term.length;found++;
      }
     });
     var playerTree=[];
     var playerRoot=doc.querySelector('#player, .fplayer');
     if(playerRoot){
      var tree=playerRoot.outerHTML||'';
      var limit=8000;
      playerTree.push('Контейнер #player: '+tree.length+' символів');
      for(var off=0;off<tree.length&&off<limit;off+=260){
       playerTree.push('HTML #player '+(off+1)+'-'+Math.min(off+260,tree.length)+': '+tree.slice(off,off+260).replace(/\s+/g,' '));
      }
      var playerLinks=playerRoot.querySelectorAll('a[href],iframe[src],video[src],source[src],[data-src],[data-file],[data-url],[onclick]');
      for(var pi=0;pi<playerLinks.length&&pi<30;pi++){
       var pn=playerLinks[pi],pv=pn.getAttribute('href')||pn.getAttribute('src')||pn.getAttribute('data-src')||pn.getAttribute('data-file')||pn.getAttribute('data-url')||pn.getAttribute('onclick');
       if(pv)playerTree.push('Атрибут '+(pi+1)+': '+pn.tagName+' '+pv.slice(0,220));
      }
     }else playerTree.push('Контейнер #player / .fplayer не знайдено');
     var encodedInfo=[];
     if(playerRoot){
      var scanNodes=[playerRoot],desc=playerRoot.querySelectorAll('*');
      for(var di=0;di<desc.length&&di<80;di++)scanNodes.push(desc[di]);
      for(var ni=0;ni<scanNodes.length&&encodedInfo.length<30;ni++){
       var node=scanNodes[ni],attrsList=node.attributes||[];
       for(var aj=0;aj<attrsList.length&&encodedInfo.length<30;aj++){
        var at=attrsList[aj],value=at.value||'';
        if(!value||at.name==='class'||at.name==='style')continue;
        encodedInfo.push(node.tagName+' '+at.name+' ('+value.length+'): '+value.slice(0,145));
       }
      }
      var textContent=playerRoot.textContent||'';
      var tokens=textContent.match(/[A-Za-z0-9+/_=-]{80,}/g)||[];
      for(var bi=0;bi<tokens.length&&bi<8;bi++){
       var token=tokens[bi];
       encodedInfo.push('Закодований блок '+(bi+1)+' · '+token.length+' символів · початок: '+token.slice(0,65));
       if(typeof atob==='function'&&/^[A-Za-z0-9+/]+={0,2}$/.test(token)&&token.length%4===0){
        try{
         var decoded=atob(token);
         var readable=decoded.replace(/[^\x20-\x7e]/g,' ').slice(0,150);
         encodedInfo.push('Base64 проба '+(bi+1)+': '+readable);
        }catch(e){}
       }
      }
     }
     var controlInfo=[],jsFindings=[],jsErrors=[];
     var control=doc.querySelector('player-control,[data-tag1]');
     if(control){
      controlInfo.push('Елемент: '+control.tagName);
      for(var ca=0;ca<control.attributes.length;ca++){
       var attribute=control.attributes[ca];
       if(!/^data-/.test(attribute.name))continue;
       if(attribute.name==='data-tag1'){
        try{
         var payload=JSON.parse(attribute.value);
         controlInfo.push('data-tag1 JSON: '+Object.keys(payload).join(', '));
         ['ciphertext','iv','salt'].forEach(function(key){
          if(payload[key])controlInfo.push(key+': '+String(payload[key]).length+' символів');
         });
        }catch(ex){controlInfo.push('data-tag1 JSON: '+ex.message);}
       }else controlInfo.push(attribute.name+': '+attribute.value.slice(0,90));
      }
     }else controlInfo.push('player-control не знайдено');
     var inlinePlayerInfo=[],inlineHits=0;
     function inlineContext(code,index,term){
      var left=Math.max(0,index-110),right=Math.min(code.length,index+230);
      return term+' @'+index+': '+code.slice(left,right).replace(/\s+/g,' ').replace(/(ciphertext|salt|iv)\s*[:=]\s*["'][^"']{30,}["']/gi,'$1: [приховано]').slice(0,340);
     }
     for(var ip=0;ip<inlineScripts.length&&inlinePlayerInfo.length<16;ip++){
      var code=inlineScripts[ip].textContent||'';
      if(!code||/googletagmanager|adsbygoogle|ratingCount|analytics/i.test(code.slice(0,350)))continue;
      var rx=/(player-control|data-tag1|ciphertext|CryptoJS\.AES|CryptoJS\.PBKDF2|AES\.decrypt|decrypt\s*\(|getAttribute\s*\(\s*['"]data-tag1)/gi;
      var m,count=0;
      while((m=rx.exec(code))&&count<3&&inlinePlayerInfo.length<16){
       inlinePlayerInfo.push('INLINE '+(ip+1)+' ('+code.length+'): '+inlineContext(code,m.index,m[0]));
       count++;inlineHits++;
      }
     }
     if(!inlineHits)inlinePlayerInfo.push('INLINE: викликів дешифрування або data-tag1 у вбудованих скриптах немає');
     var controlParent=control&&control.parentElement;
     if(controlParent){
      inlinePlayerInfo.push('PLAYER-CONTROL: батько '+controlParent.tagName+' #'+(controlParent.id||'—')+' .'+String(controlParent.className||'').slice(0,70));
      var adjacent=controlParent.querySelectorAll('script:not([src])');
      inlinePlayerInfo.push('PLAYER-CONTROL: локальних script '+adjacent.length);
     }
     var relevantScripts=scriptUrls.filter(function(u){return /(?:index|player|app|main|bundle|crypto)/i.test(u)&&!/ads|banner|player_down|google/i.test(u);}).sort(function(a,b){return (/index(?:\.|-)/i.test(b)?1:0)-(/index(?:\.|-)/i.test(a)?1:0);}).slice(0,7);
     var queue=embedded.slice(0,3),checked=0,errors=[];
     function finishScan(){finish(null,{streams:candidates.slice(0,20),iframes:embedded.slice(0,8),checked:checked,errors:errors,diagnostics:diagnostics,bytes:html.length,indicators:indicators,scripts:scriptUrls,clues:clues,playerSnippets:playerSnippets,ajaxCalls:ajaxCalls,playerTree:playerTree,encodedInfo:encodedInfo,controlInfo:controlInfo,jsFindings:jsFindings,jsErrors:jsErrors,inlinePlayerInfo:inlinePlayerInfo});}
     function scanNext(){
      if(!queue.length)return finishScan();
      var url=queue.shift(),done=false,child=new Lampa.Reguest();
      checked++;
      var timer2=setTimeout(function(){complete(null,'Iframe timeout');},7000);
      function complete(raw,error){
       if(done)return;
       done=true;clearTimeout(timer2);
       if(error)errors.push(error);
       diagnostics.push({url:url,status:error||'HTML OK',bytes:raw?String(raw).length:0});
       if(raw){
        try{
         var page=new DOMParser().parseFromString(String(raw),'text/html');
         var nodes=page.querySelectorAll('video[src],source[src],[data-file],[data-hls]');
         for(var k=0;k<nodes.length;k++){
          var value=nodes[k].getAttribute('src')||nodes[k].getAttribute('data-file')||nodes[k].getAttribute('data-hls');
          if(!value)continue;
          var low=value.toLowerCase();
          if(low.indexOf('.m3u8')===-1&&low.indexOf('.mp4')===-1&&low.indexOf('.mpd')===-1)continue;
          var full=absolute(value,url);
          if(!seen[full]){seen[full]=true;candidates.push({url:full,origin:'iframe'});}
         }
        }catch(ex){errors.push(ex.message);}
       }
       scanNext();
      }
      try{
       child.native(url,function(raw){complete(typeof raw==='string'?raw:JSON.stringify(raw||''));},function(){complete(null,'Iframe HTTP error');},false,{dataType:'text'});
      }catch(ex){complete(null,ex.message);}
     }
     function scanScript(){
      if(!relevantScripts.length)return scanNext();
      var scriptUrl=relevantScripts.shift(),completed=false,request=new Lampa.Reguest();
      var guard=setTimeout(function(){doneScript(null,'timeout');},5500);
      function doneScript(raw,error){
       if(completed)return;
       completed=true;clearTimeout(guard);
       if(error)jsErrors.push(scriptUrl.slice(0,90)+': '+error);
       else{
        var code=String(raw||''),filename=scriptUrl.split('/').pop(),found=0;
        if(/crypto-js/i.test(filename)){
         jsFindings.push(filename+': CryptoJS доступний ('+code.length+' символів), пропущено бібліотечні збіги');
        }else{
         var patterns=[/player-control/gi,/data-tag1/gi,/ciphertext/gi,/requestMessage/gi,/postMessage/gi,/\.decrypt\s*\(/gi,/PBKDF2/gi,/AES\.decrypt/gi];
         patterns.forEach(function(rx){
          var match,count=0;
          while((match=rx.exec(code))&&count<2&&found<14){
           var from=Math.max(0,match.index-170),to=Math.min(code.length,match.index+430);
           jsFindings.push(filename+' ['+match[0]+'] @'+match.index+': '+code.slice(from,to).replace(/\s+/g,' ').slice(0,560));
           count++;found++;
          }
         });
         if(!found&&/index(?:\.js|\?)/i.test(filename))jsFindings.push(filename+': немає згадок плеєра ('+code.length+' символів)');
        }
       }
       scanScript();
      }
      try{request.native(scriptUrl,function(raw){doneScript(typeof raw==='string'?raw:JSON.stringify(raw||''));},function(){doneScript(null,'HTTP error');},false,{dataType:'text'});}catch(ex){doneScript(null,ex.message);}
     }
     scanScript();
    }catch(e){finish(e);}
   },function(e){finish(Error('HTTP: '+String(e&&e.message||e&&e.status||'помилка')));},false,{dataType:'text'});
  }catch(e){finish(e);}
 });
}

function menu(){
 var choices=[{title:'Пошук UAKino',value:'search'},{title:'UASerials · Фільми',value:'ext_uaserials'},{title:'UASerials · Серіали',value:'ext_uaserials_series'},{title:'Цікава Ідея · каталог (тест)',value:'ext_cikava'},{title:'UAFIX · каталог (тест)',value:'ext_uafix'}].concat(CATS.map(function(c){return {title:c[1],value:c[0]};}));
 Lampa.Select.show({title:'UA Search 1.2.0',items:choices,onBack:function(){setTimeout(focusMenu,80);},onSelect:function(item){
  try{Lampa.Select.hide();}catch(e){}
  if(item.value==='search')setTimeout(search,180);
  else{
   if(item.value.indexOf('ext_')===0){show('',item.value,EXTERNAL_SOURCES[item.value.slice(4)].name);return;}
   var c=CATS.filter(function(x){return x[0]===item.value;})[0];
   show('',item.value,c?c[1]:'UA Search');
  }
 }});
}
function addMenu(){
 if($('.menu [data-uas120="menu"]').length)return;
 var list=$('.menu .menu__list').first();
 if(!list.length)return;
 var el=$('<li class="menu__item selector" data-uas120="menu"><div class="menu__ico">UA</div><div class="menu__text">UA Search</div></li>');
 el.on('hover:enter',menu);
 var anchor=$('.menu [data-action="settings"]').first();
 if(anchor.length)anchor.before(el);else list.prepend(el);
}
function addSearch(){
 var area=$('.activity--active').find('.search,.search-box,.search__body').first();
 if(!area.length||area.find('[data-uas120="search"]').length)return;
 var el=$('<div class="uas120-search selector" data-uas120="search">UA Search · українські фільми</div>');
 el.on('hover:enter click',search);
 area.prepend(el);
}
function init(){
 if(!window.Lampa||!Lampa.Component||!Lampa.Activity||!Lampa.Select||!Lampa.Input||!window.$)return setTimeout(init,500);
 Lampa.Component.add(COMPONENT,Page);
 var css='.uas120-page{height:100%}.uas120-filters{display:flex;flex-wrap:wrap;gap:.7em;padding:1.2em 3em .4em}.uas120-filter{padding:.65em 1em;border-radius:.5em;background:#303642;color:#fff}.uas120-filter.focus{background:#fff;color:#111}.uas120-status{padding:.4em 3em;font-size:.9em;opacity:.7}.uas120-body{padding:1em 3em 4em}.uas120-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}.uas120-card{min-width:0;padding:.4em;border-radius:.6em}.uas120-card.focus{background:#fff;color:#111}.uas120-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.35em}.uas120-name{font-size:1.1em;font-weight:600;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.uas120-meta{font-size:.9em;opacity:.7;margin-top:.3em}.uas120-empty{padding:2em;opacity:.7}.uas120-search{padding:.7em 1em;margin:.5em;border-radius:.5em;background:#1f6feb;color:#fff}.uas120-detail{padding:1.5em 3em 5em}.uas120-detail-head{display:flex;gap:2em;margin-bottom:1.5em}.uas120-detail-poster{width:13em;min-width:13em;aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.5em}.uas120-detail-info{flex:1;min-width:0}.uas120-detail-title{font-size:2em;font-weight:700;margin-bottom:.4em}.uas120-description{font-size:1.05em;line-height:1.5;max-width:55em;margin-top:1em}.uas120-reactions{font-size:1.2em;margin:1em 0}.uas120-heading{font-size:1.4em;font-weight:700;margin:1em 0 .6em}.uas120-cast{display:flex;gap:1em;overflow-x:auto;margin-bottom:1.5em}.uas120-actor{width:8em;min-width:8em}.uas120-actor-photo{width:100%;aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.4em}.uas120-action{display:block;padding:.9em 1.2em;margin:.5em 0;background:#303642;border-radius:.5em;max-width:32em}.uas120-action.focus{background:#fff;color:#111}.uas120-stream-status{opacity:.7;font-size:.9em;margin-top:1em}body.true--mobile .uas120-grid{grid-template-columns:repeat(3,minmax(0,1fr))}';
 $('<style id="uas120-style"></style>').text(css).appendTo('head');
 var ready=false;
 function start(){if(ready)return;ready=true;addMenu();setInterval(function(){try{addMenu();addSearch();}catch(e){log(e.message);}},2000);note('UA Search 1.2.0 активовано');}
 if(window.appready)start();
 else Lampa.Listener.follow('app',function(e){if(e.type==='ready')start();});
}
init();
})();