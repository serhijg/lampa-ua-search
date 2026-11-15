
(function () {
'use strict';

if (window.UA_SEARCH_086) return;
window.UA_SEARCH_086 = true;

var API = 'https://uakino.ax';
var COMPONENT = 'ua_search_086';
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

function note(s) {
 try { Lampa.Noty.show(s); }
 catch(e) { console.log(s); }
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
    reject(Error('HTTP ' + x.status));
    return;
   }

   try {
    resolve(json ? JSON.parse(x.responseText) : x.responseText);
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

function request(path) {
 return http(API + path,true);
}

function list(cat,page) {
 return request(
  '/hls/api/lampa/list?cat=' + enc(cat) +
  '&page=' + page +
  '&limit=' + LIMIT
 ).then(function(d) {
  return Array.isArray(d.results) ? d.results : [];
 });
}

function absolute(url,base) {
 if(!url) return '';

 try {
  return new URL(url,base || API + '/').href;
 } catch(e) {
  if(/^https?:/i.test(url)) return url;
  return API + (url.charAt(0)==='/' ? '' : '/') + url;
 }
}

function posterUrl(it) {
 var p = it.poster || it.poster_path || it.img || '';
 if(!p) return '';
 if(/^https?:/i.test(p)) return p;
 if(p.indexOf('/t/p/')===0)
  return 'https://image.tmdb.org' + p;
 if(p.charAt(0)==='/') return API + p;
 return 'https://image.tmdb.org/t/p/w342/' + p;
}

function yearOf(it) {
 return Number(it.year ||
  String(it.release_date || it.first_air_date || '').slice(0,4)
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
 if(ratingOf(it)) p.push('★ '+ratingOf(it).toFixed(1));
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
 if(!it.uakino_id)
  return Promise.reject(Error('Відсутній UAKino ID'));

 return request(
  '/hls/api/play?movie=' + enc(it.uakino_id) +
  '&s=lp' + Date.now()
 ).then(function(data) {
  var url = absolute(data.manifest_abs || data.manifest);

  if(!url) throw Error('Потік недоступний');

  if(!/\.m3u8($|\?)/i.test(url))
   url += '.m3u8';

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
 if(typeof raw==='string')
  return raw.split(/[,;]/).map(function(s) {
   return {name:s.trim()};
  }).filter(function(a){return !!a.name;});

 if(!Array.isArray(raw)) return [];

 return raw.map(function(a) {
  if(typeof a==='string')
   return {name:a};

  return {
   name:a.name || a.actor || '',
   character:a.character || a.role || '',
   photo:a.profile_path || a.photo || a.image || ''
  };
 }).filter(function(a){return !!a.name;});
}

function reactionsOf(it) {
 var r=it.reactions || it.votes || {};

 var likes=it.likes;
 var dislikes=it.dislikes;

 if(likes == null) likes=r.likes;
 if(dislikes == null) dislikes=r.dislikes;

 if(likes == null && dislikes == null)
  return null;

 return {
  likes:Number(likes)||0,
  dislikes:Number(dislikes)||0
 };
}

function Page(o) {
 var root,scroll,filterBar,statusBar,body,detail;
 var tiles=[],filters=[],detailControls=[];
 var allItems=[],visibleItems=[],seen={};

 var cursor=0,filterCursor=0,detailCursor=0;
 var zone='tiles',view='catalog';
 var selected=null,stream=null,qualities=[];
 var selectedQuality=null;

 var page=0,loading=false,hasMore=true;
 var started=false,destroyed=false,requestId=0;
 var detailRequest=0,emptyPages=0;

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
  } catch(e) {return false;}
 }

 function focus(el) {
  if(!el || !active()) return;
  if(!$.contains(document,el)) return;

  try {
   var wrap=scroll.render();
   Lampa.Controller.collectionSet(wrap);
   Lampa.Controller.collectionFocus($(el),wrap);
   scroll.update($(el),true);
  } catch(e) {
   console.log('UA focus:',e);
  }
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
  filterCursor=Math.max(0,Math.min(filters.length-1,n));
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

 function columns() {
  if(tiles.length<2) return 1;

  var y=tiles[0].getBoundingClientRect().top;
  var n=0;

  for(var i=0;i<tiles.length;i++) {
   if(Math.abs(
    tiles[i].getBoundingClientRect().top-y
   )>5) break;
   n++;
  }

  return Math.max(1,n);
 }

 function move(dir) {
  if(!active()) return;

  if(view==='detail') {
   if(dir==='up') {
    if(detailCursor===0)
     Lampa.Controller.toggle('head');
    else
     focusDetail(detailCursor-1);
   }

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

  if(dir==='right' &&
     cursor%cols!==cols-1 &&
     cursor+1<tiles.length)
   next=cursor+1;

  focusTile(next);

  if(dir==='down' && cursor>=tiles.length-cols*3)
   loadNext();
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
     it.title,it.name,it.original,
     it.original_title,it.original_name
    ].join(' ')).indexOf(term)>=0;
   });
  }

  if(settings.year!=='all') {
   result=result.filter(function(it) {
    var y=yearOf(it);
    if(!y) return false;

    if(settings.year==='2020+') return y>=2020;
    if(settings.year==='2010-2019')
     return y>=2010 && y<=2019;
    if(settings.year==='before2010') return y<2010;
    return true;
   });
  }

  if(settings.rating)
   result=result.filter(function(it) {
    return ratingOf(it)>=settings.rating;
   });

  if(settings.sort==='rating')
   result.sort(function(a,b) {
    return ratingOf(b)-ratingOf(a);
   });

  if(settings.sort==='year')
   result.sort(function(a,b) {
    return yearOf(b)-yearOf(a);
   });

  if(settings.sort==='title')
   result.sort(function(a,b) {
    return titleOf(a).localeCompare(titleOf(b),'uk');
   });

  return result;
 }

 function makeCard(it) {
  var el=$(
   '<div class="uas86-card selector">'+
    '<div class="uas86-poster"></div>'+
    '<div class="uas86-name"></div>'+
    '<div class="uas86-meta"></div>'+
   '</div>'
  );

  var p=posterUrl(it);

  if(p) el.find('.uas86-poster').css(
   'background-image',
   'url("'+p.replace(/"/g,'%22')+'")'
  );

  el.find('.uas86-name').text(titleOf(it));
  el.find('.uas86-meta').text(metadata(it));

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
    $('<div class="uas86-empty"></div>')
     .text(loading?'Завантаження…':
      'Немає результатів для вибраних фільтрів')
   );
   updateStatus(loading?'Завантаження…':'');
   return;
  }

  var grid=$('<div class="uas86-grid"></div>');

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

  try {Lampa.Layer.update();}catch(e){}

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

   if(!items.length) hasMore=false;
   else if(!added) {
    emptyPages++;
    if(emptyPages>=2) hasMore=false;
   } else emptyPages=0;

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
    try {Lampa.Select.hide();}catch(e){}

    setTimeout(function() {
     if(active()) {
      Lampa.Controller.toggle('content');
      restoreFocus();
     }
    },70);
   }
  });
 }

 function filterAction(type) {
  if(type==='reset') {
   settings={year:'all',rating:0,sort:'default'};
   renderFilters();
   draw(true);
   focusFilter(0);
   return;
  }

  var choices=[],title='';

  if(type==='year') {
   title='Рік випуску';
   choices=[
    {title:'Усі роки',value:'all'},
    {title:'2020 і новіші',value:'2020+'},
    {title:'2010–2019',value:'2010-2019'},
    {title:'До 2010',value:'before2010'}
   ];
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

  selectOptions(title,choices,function(v) {
   settings[type]=v;
   renderFilters();
   draw(true);
  });
 }

 function renderFilters() {
  filterBar.empty();
  filters=[];

  var names={
   default:'Звичайне',
   rating:'Рейтинг',
   year:'Рік',
   title:'Назва'
  };

  var defs=[
   ['year','Рік: '+(settings.year==='all'?'Усі':settings.year)],
   ['rating','Рейтинг: '+(settings.rating||'Усі')],
   ['sort','Сортування: '+names[settings.sort]],
   ['reset','Скинути']
  ];

  defs.forEach(function(d) {
   var el=$('<div class="uas86-filter selector"></div>');
   el.text(d[1]);

   el.on('hover:enter',function() {
    filterAction(d[0]);
   });

   el.on('hover:focus',function() {
    zone='filters';
    filterCursor=filters.indexOf(el[0]);
   });

   filterBar.append(el);
   filters.push(el[0]);
  });
 }

 function detailButton(text,action) {
  var el=$('<div class="uas86-action selector"></div>');
  el.text(text);

  el.on('hover:enter',action);
  el.on('hover:focus',function() {
   zone='detail';
   var n=detailControls.indexOf(el[0]);
   if(n>=0) detailCursor=n;
  });

  detail.append(el);
  detailControls.push(el[0]);
 }

 function renderDetails() {
  if(view!=='detail' || !selected || destroyed)
   return;

  detail.empty();
  detailControls=[];

  var header=$('<div class="uas86-detail-header"></div>');
  var poster=$('<div class="uas86-detail-poster"></div>');
  var info=$('<div class="uas86-detail-info"></div>');
  var p=posterUrl(selected);

  if(p)
   poster.css('background-image',
    'url("'+p.replace(/"/g,'%22')+'")');

  info.append(
   $('<div class="uas86-detail-title"></div>')
    .text(titleOf(selected))
  );

  info.append(
   $('<div class="uas86-detail-meta"></div>')
    .text(metadata(selected))
  );

  var original=selected.original_title ||
   selected.original_name || selected.original || '';

  if(original && original!==titleOf(selected))
   info.append(
    $('<div class="uas86-detail-original"></div>')
     .text(original)
   );

  var genres=selected.genres || selected.genre || '';

  if(Array.isArray(genres))
   genres=genres.map(function(g) {
    return typeof g==='string' ? g : (g.name||'');
   }).filter(Boolean).join(', ');

  if(genres)
   info.append(
    $('<div class="uas86-detail-genres"></div>')
     .text(genres)
   );

  var description=selected.overview ||
   selected.description ||
   selected.plot ||
   selected.short_story || '';

  info.append(
   $('<div class="uas86-detail-description"></div>')
    .text(description || 'Опис відсутній у даних каталогу.')
  );

  header.append(poster).append(info);
  detail.append(header);

  var reactions=reactionsOf(selected);

  if(reactions) {
   detail.append(
    $('<div class="uas86-reactions"></div>')
     .text('👍 '+reactions.likes+'   👎 '+reactions.dislikes)
   );
  }

  var cast=castOf(selected);

  if(cast.length) {
   detail.append(
    $('<div class="uas86-section-title"></div>')
     .text('Актори')
   );

   var castRow=$('<div class="uas86-cast"></div>');

   cast.slice(0,20).forEach(function(actor) {
    var card=$('<div class="uas86-actor"></div>');
    var photo=$('<div class="uas86-actor-photo"></div>');

    if(actor.photo) {
     var url=actor.photo;

     if(url.charAt(0)==='/')
      url='https://image.tmdb.org/t/p/w185'+url;

     photo.css('background-image',
      'url("'+url.replace(/"/g,'%22')+'")');
    }

    card.append(photo);
    card.append(
     $('<div class="uas86-actor-name"></div>')
      .text(actor.name)
    );

    if(actor.character)
     card.append(
      $('<div class="uas86-actor-role"></div>')
       .text(actor.character)
     );

    castRow.append(card);
   });

   detail.append(castRow);
  }

  detailButton('▶ Дивитися',function() {
   if(!stream) {
    note('Потік ще завантажується');
    return;
   }
   playStream(selected,stream,selectedQuality);
  });

  detailButton(
   'Якість: '+(selectedQuality ? selectedQuality.name : 'Auto'),
   function() {
    if(!stream) {
     note('Зачекай на завантаження потоку');
     return;
    }

    var choices=[
     {title:'Auto (адаптивна)',value:-1}
    ];

    qualities.forEach(function(q,i) {
     choices.push({title:q.name,value:i});
    });

    selectOptions('Якість відео',choices,function(v) {
     selectedQuality=v===-1 ? null : qualities[v];
     renderDetails();
     focusDetail(1);
    });
   }
  );

  detailButton('← Назад до каталогу',closeDetails);

  detail.append(
   $('<div class="uas86-detail-status"></div>')
    .text(stream ?
     'Доступних варіантів якості: '+qualities.length :
     'Отримання інформації про потік…')
  );

  if(started && active()) {
   setTimeout(function() {
    if(view==='detail' && active())
     focusDetail(detailCursor);
   },60);
  }
 }

 function openDetails(it) {
  selected=it;
  stream=null;
  qualities=[];
  selectedQuality=null;
  detailCursor=0;
  view='detail';
  zone='detail';

  filterBar.hide();
  statusBar.hide();
  body.hide();
  detail.show();

  renderDetails();

  var token=++detailRequest;

  resolveStream(it).then(function(s) {
   if(destroyed || token!==detailRequest ||
      view!=='detail') return;

   stream=s;
   renderDetails();

   return http(s.url,false).then(function(text) {
    if(destroyed || token!==detailRequest ||
       view!=='detail') return;

    qualities=parseMaster(text,s.url);
    renderDetails();

   }).catch(function() {
    if(view==='detail' && token===detailRequest) {
     renderDetails();
     detail.find('.uas86-detail-status')
      .text('Якість Auto. HLS-варіанти недоступні.');
    }
   });

  }).catch(function(e) {
   if(destroyed || token!==detailRequest ||
      view!=='detail') return;

   renderDetails();
   detail.find('.uas86-detail-status')
    .text('Помилка потоку: '+e.message);
  });
 }

 function closeDetails() {
  detailRequest++;
  view='catalog';
  zone='tiles';
  selected=null;

  detail.hide();
  filterBar.show();
  statusBar.show();
  body.show();

  setTimeout(function() {
   if(active()) focusTile(cursor);
  },50);
 }

 this.create=function() {
  root=$('<div class="uas86-page"></div>');

  scroll=new Lampa.Scroll({
   mask:true,
   over:true,
   step:250
  });

  try {scroll.minus();}catch(e){}

  filterBar=$('<div class="uas86-filters"></div>');
  statusBar=$('<div class="uas86-status"></div>');
  body=$('<div class="uas86-body"></div>');
  detail=$('<div class="uas86-detail"></div>').hide();

  scroll.append(filterBar);
  scroll.append(statusBar);
  scroll.append(body);
  scroll.append(detail);

  root.append(scroll.render());

  renderFilters();
  body.text('Завантаження…');
  loadNext();
 };

 this.start=function() {
  started=true;

  Lampa.Controller.add('content',{
   toggle:function() {
    if(active()) restoreFocus();
   },
   up:function(){move('up');},
   down:function(){move('down');},
   left:function(){move('left');},
   right:function(){move('right');},

   enter:function() {
    if(!active()) return;

    var el=view==='detail' ?
     detailControls[detailCursor] :
     zone==='filters' ?
      filters[filterCursor] : tiles[cursor];

    if(el) $(el).trigger('hover:enter');
   },

   back:function() {
    if(view==='detail') {
     closeDetails();
    } else {
     started=false;
     Lampa.Activity.backward();
    }
   }
  });

  Lampa.Controller.toggle('content');
 };

 this.pause=function(){started=false;};
 this.stop=function(){started=false;};
 this.render=function(){return root;};

 this.destroy=function() {
  destroyed=true;
  started=false;
  requestId++;
  detailRequest++;

  try {scroll.destroy();}catch(e){}
  if(root) root.remove();

  tiles=[];
  filters=[];
  detailControls=[];
  allItems=[];
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

// Restore focus when the input is dismissed empty.
function search() {
 var previous='content';

 try {
  var enabled=Lampa.Controller.enabled();
  if(enabled) previous=enabled;
 } catch(e) {}

 var completed=false;

 function restore() {
  if(completed) return;
  completed=true;

  setTimeout(function() {
   try {
    var a=Lampa.Activity.active();
    if(a && a.component===COMPONENT)
     Lampa.Controller.toggle('content');
    else
     Lampa.Controller.toggle(previous);
   } catch(e) {
    try {Lampa.Controller.toggle('menu');}
    catch(err) {}
   }
  },150);
 }

 Lampa.Input.edit({
  title:'Пошук UAKino',
  value:'',
  free:true
 },function(v) {
  if(v && String(v).trim()) {
   completed=true;
   show(String(v).trim(),'new',
    'Пошук: '+String(v).trim());
  } else {
   restore();
  }
 });

 // Some Lampa builds do not call the input callback on Back.
 // Detect the disappearance of the input dialog.
 var checks=0;
 var timer=setInterval(function() {
  checks++;

  if(completed || checks>100) {
   clearInterval(timer);
   return;
  }

  var inputVisible=$(
   '.input--visible, .modal--visible, .simple-keyboard'
  ).filter(':visible').length>0;

  if(checks>3 && !inputVisible) {
   clearInterval(timer);
   restore();
  }
 },100);
}

function menu() {
 var items=[{
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
  title:'UA Search 0.8.6',
  items:items,

  onBack:function() {
   Lampa.Controller.toggle('menu');
  },

  onSelect:function(it) {
   try {Lampa.Select.hide();}catch(e){}

   if(it.action==='search')
    setTimeout(search,120);
   else if(it.action==='toloka') {
    note('Toloka: вбудований пошук поки недоступний');
    try {window.open('https://toloka.to/','_blank');}
    catch(e){}
   } else
    show('',it.cat,it.title);
  }
 });
}

function addMenu() {
 if($('.menu [data-uas86="menu"]').length)
  return;

 var target=$('.menu .menu__list').first();
 if(!target.length) return;

 var item=$(
  '<li class="menu__item selector" data-uas86="menu">'+
  '<div class="menu__ico">UA</div>'+
  '<div class="menu__text">UA Search</div>'+
  '</li>'
 );

 item.on('hover:enter',menu);

 var anchor=$('.menu [data-action="settings"]').first();

 if(anchor.length) anchor.before(item);
 else target.prepend(item);
}

function addSearchButton() {
 var page=$('.activity--active');
 if(!page.length) return;

 var area=page.find(
  '.search, .search-box, .search__body'
 ).first();

 if(!area.length) return;
 if(area.find('[data-uas86="search"]').length) return;

 var button=$(
  '<div class="uas86-search selector" data-uas86="search">'+
  'UA Search · українські фільми'+
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

 var css=[
 '.uas86-page{height:100%}',
 '.uas86-filters{display:flex;flex-wrap:wrap;gap:.7em;padding:1.2em 3em .4em}',
 '.uas86-filter{padding:.65em 1em;border-radius:.5em;background:#303642;color:#fff}',
 '.uas86-filter.focus{background:#fff;color:#111}',
 '.uas86-status{padding:.4em 3em;font-size:.9em;opacity:.7}',
 '.uas86-body{padding:1em 3em 4em}',
 '.uas86-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}',
 '.uas86-card{min-width:0;padding:.4em;border-radius:.6em}',
 '.uas86-card.focus{background:#fff;color:#111}',
 '.uas86-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.35em}',
 '.uas86-name{font-size:1.1em;font-weight:600;line-height:1.3;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
 '.uas86-meta{font-size:.9em;opacity:.7;margin-top:.3em}',
 '.uas86-empty{padding:2em;opacity:.7}',
 '.uas86-search{padding:.7em 1em;margin:.5em;border-radius:.5em;background:#1f6feb;color:#fff}',
 '.uas86-detail{padding:1.5em 3em 5em}',
 '.uas86-detail-header{display:flex;gap:2em;margin-bottom:1.5em}',
 '.uas86-detail-poster{width:13em;min-width:13em;aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.5em}',
 '.uas86-detail-info{flex:1;min-width:0}',
 '.uas86-detail-title{font-size:2em;font-weight:700;margin-bottom:.4em}',
 '.uas86-detail-meta{font-size:1.1em;opacity:.85;margin-bottom:.5em}',
 '.uas86-detail-original{opacity:.7;margin-bottom:.5em}',
 '.uas86-detail-genres{opacity:.85;margin-bottom:.7em}',
 '.uas86-detail-description{font-size:1.05em;line-height:1.5;max-width:55em}',
 '.uas86-reactions{font-size:1.2em;margin:1em 0}',
 '.uas86-section-title{font-size:1.4em;font-weight:700;margin:1em 0 .6em}',
 '.uas86-cast{display:flex;gap:1em;overflow-x:auto;margin-bottom:1.5em}',
 '.uas86-actor{width:8em;min-width:8em}',
 '.uas86-actor-photo{width:100%;aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.4em}',
 '.uas86-actor-name{font-size:.95em;font-weight:600;margin-top:.4em}',
 '.uas86-actor-role{font-size:.8em;opacity:.7}',
 '.uas86-action{display:block;padding:.9em 1.2em;margin:.5em 0;background:#303642;border-radius:.5em;max-width:32em}',
 '.uas86-action.focus{background:#fff;color:#111}',
 '.uas86-detail-status{opacity:.7;font-size:.9em;margin-top:1em}',
 'body.true--mobile .uas86-grid{grid-template-columns:repeat(3,minmax(0,1fr))}',
 'body.true--mobile .uas86-detail-header{flex-direction:column}'
 ].join('');

 $('<style id="uas86-style"></style>')
  .text(css).appendTo('head');

 var initialized=false;

 function ready() {
  if(initialized) return;
  initialized=true;

  addMenu();

  setInterval(function() {
   try {
    addMenu();
    addSearchButton();
   } catch(e) {
    console.log('UA Search UI:',e);
   }
  },2000);

  note('UA Search 0.8.6 активовано');
 }

 if(window.appready) ready();
 else {
  Lampa.Listener.follow('app',function(e) {
   if(e.type==='ready') ready();
  });
 }

 window.UASearch086={
  open:menu,
  search:search
 };
}

init();
})();
