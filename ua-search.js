
(function(){
'use strict';
if(window.UA_SEARCH_081)return;
window.UA_SEARCH_081=true;

var API='https://uakino.ax';
var cats=[
 ['new','Новинки'],
 ['films','Фільми'],
 ['series','Серіали'],
 ['cartoons','Мультфільми'],
 ['anime','Аніме'],
 ['top','Найкраще']
];

function note(t){
 try{Lampa.Noty.show(t)}
 catch(e){console.log(t)}
}

function enc(t){
 return encodeURIComponent(t==null?'':String(t))
}

function norm(t){
 return String(t||'').toLowerCase()
  .replace(/[^a-zа-яіїєґ0-9]+/gi,' ').trim()
}

function req(path){
 return new Promise(function(ok,bad){
  var x=new XMLHttpRequest();
  x.open('GET',API+path,true);
  x.timeout=15000;
  x.onload=function(){
   try{
    if(x.status<200||x.status>=300)
     throw Error('HTTP '+x.status);
    ok(JSON.parse(x.responseText))
   }catch(e){bad(e)}
  };
  x.onerror=function(){bad(Error('CORS або мережа'))};
  x.ontimeout=function(){bad(Error('Таймаут'))};
  x.send()
 })
}

function list(cat,page){
 return req('/hls/api/lampa/list?cat='+
  enc(cat)+'&page='+page+'&limit=60')
  .then(function(d){return d.results||[]})
}

function findItems(query){
 var jobs=[];
 cats.forEach(function(c){
  [1,2].forEach(function(page){
   jobs.push(list(c[0],page)
    .catch(function(){return []}))
  })
 });
 return Promise.all(jobs).then(function(groups){
  var found={},out=[],n=norm(query);
  groups.forEach(function(g){
   g.forEach(function(it){
    var k=it.uakino_id||it.id||it.title;
    if(!found[k]&&norm([
     it.title,it.original,it.original_title
    ].join(' ')).indexOf(n)>=0){
     found[k]=1;
     out.push(it)
    }
   })
  });
  return out
 })
}

function abs(u){
 return /^https?:/i.test(u||'')?u:API+(u||'')
}

function openItem(it){
 var id=it.uakino_id;
 if(!id){
  note('UAKino: немає внутрішнього ID');
  return
 }
 Lampa.Loading.start(function(){
  Lampa.Loading.stop()
 });
 req('/hls/api/play?movie='+enc(id)+
  '&s=lp'+Date.now()).then(function(p){
  Lampa.Loading.stop();
  var u=abs(p.manifest_abs||p.manifest);
  if(!p.manifest_abs&&!p.manifest)
   throw Error('Немає потоку');
  if(!/\.m3u8($|\?)/i.test(u))u+='.m3u8';
  var item={
   title:it.title||'UAKino',
   url:u,
   hls_type:'hlsjs'
  };
  if(p.subs&&p.subs.length)
   item.subtitles=p.subs.map(function(s){
    return{label:s.label,url:abs(s.url)}
   });
  Lampa.Player.play(item);
  Lampa.Player.playlist([item])
 }).catch(function(e){
  Lampa.Loading.stop();
  note('UAKino: '+e.message)
 })
}

function Page(o){
 var root,scroll,body,tiles=[],cursor=0,cols=5;

 function focus(i){
  if(!tiles.length)return;
  cursor=Math.max(0,Math.min(tiles.length-1,i));
  Lampa.Controller.collectionSet(scroll.render());
  Lampa.Controller.collectionFocus(
   tiles[cursor],scroll.render()
  );
  try{
   scroll.update($(tiles[cursor]),true)
  }catch(e){}
 }

 function draw(items){
  body.empty();
  tiles=[];
  cursor=0;
  if(!items.length)
   body.text('Нічого не знайдено. Пошук охоплює лише перші сторінки каталогу.');
  var grid=$('<div class="uas81-grid"></div>');
  items.forEach(function(it){
   var poster=it.poster||it.poster_path||it.img||'';
   if(poster&&!/^https?:/i.test(poster))
    poster=poster.charAt(0)==='/'?
     API+poster:
     'https://image.tmdb.org/t/p/w342'+
     (poster.charAt(0)==='/'?'':'/')+poster;
   var el=$(
    '<div class="uas81-card selector">'+
    '<div class="uas81-poster"></div>'+
    '<div class="uas81-name"></div></div>'
   );
   if(poster)
    el.find('.uas81-poster').css(
     'background-image',
     'url("'+poster.replace(/"/g,'%22')+'")'
    );
   el.find('.uas81-name').text(
    it.title||it.name||'Без назви'
   );
   el.on('hover:enter',function(){openItem(it)});
   el.on('hover:focus',function(){
    cursor=tiles.indexOf(el[0])
   });
   grid.append(el);
   tiles.push(el[0])
  });
  body.append(grid);
  try{Lampa.Layer.update()}catch(e){}
  if(tiles.length)focus(0)
 }

 this.create=function(){
  root=$('<div class="uas81-page"></div>');
  scroll=new Lampa.Scroll({
   mask:true,over:true,step:250
  });
  body=$('<div class="uas81-body">Завантаження…</div>');
  scroll.append(body);
  root.append(scroll.render());
  (o.query?findItems(o.query):list(o.cat||'new',1))
   .then(draw)
   .catch(function(e){
    body.text('Помилка каталогу: '+e.message)
   })
 };

 this.start=function(){
  Lampa.Controller.add('content',{
   toggle:function(){focus(cursor)},
   up:function(){
    if(cursor<cols)Lampa.Controller.toggle('head');
    else focus(cursor-cols)
   },
   down:function(){focus(cursor+cols)},
   left:function(){
    if(cursor%cols)focus(cursor-1);
    else Lampa.Controller.toggle('menu')
   },
   right:function(){
    if(cursor%cols!==cols-1)focus(cursor+1)
   },
   enter:function(){
    if(tiles[cursor])
     $(tiles[cursor]).trigger('hover:enter')
   },
   back:function(){Lampa.Activity.backward()}
  });
  Lampa.Controller.toggle('content')
 };
 this.pause=function(){};
 this.stop=function(){};
 this.render=function(){return root};
 this.destroy=function(){
  try{scroll.destroy()}catch(e){}
  if(root)root.remove()
 }
}

function show(query,cat,title){
 Lampa.Activity.push({
  url:'',
  title:title||'UA Search',
  component:'ua_search_081',
  query:query||'',
  cat:cat||'new',
  page:1
 })
}

function search(){
 Lampa.Input.edit({
  title:'Пошук UAKino',
  value:'',
  free:true
 },function(v){
  if(v&&v.trim())
   show(v.trim(),'','Пошук: '+v.trim())
 })
}

function menu(){
 var items=[{
  title:'Пошук UAKino',
  action:'search'
 }];
 cats.forEach(function(c){
  items.push({title:c[1],cat:c[0]})
 });
 items.push({
  title:'Toloka — сайт',
  action:'toloka'
 });
 Lampa.Select.show({
  title:'UA Search 0.8.1',
  items:items,
  onBack:function(){
   Lampa.Controller.toggle('menu')
  },
  onSelect:function(it){
   if(it.action==='search')search();
   else if(it.action==='toloka'){
    note('Toloka: вбудований пошук поки недоступний');
    try{
     window.open('https://toloka.to/','_blank')
    }catch(e){}
   }else show('',it.cat,it.title)
  }
 })
}

function insert(){
 try{
  var anchor=$(
   '.menu [data-action="settings"]'
  ).first();
  var target=$('.menu .menu__list').first();
  if(!target.length)return;

  if(!$('.menu [data-uas81="menu"]').length){
   var item=$(
    '<li class="menu__item selector" data-uas81="menu">'+
    '<div class="menu__ico">UA</div>'+
    '<div class="menu__text">UA Search</div></li>'
   );
   item.on('hover:enter',menu);
   if(anchor.length)anchor.before(item);
   else target.prepend(item)
  }

  var searchPage=$(
   '.activity--active .search, '+
   '.activity--active .search-box, '+
   '.activity--active .search__body'
  ).first();

  if(searchPage.length&&
   !searchPage.find('[data-uas81="search"]').length){
   var b=$(
    '<div class="uas81-search selector" '+
    'data-uas81="search">'+
    'UA Search · пошук українською</div>'
   );
   b.on('hover:enter click',search);
   searchPage.prepend(b)
  }
 }catch(e){
  console.log('UA Search menu',e)
 }
}

function init(){
 if(!window.Lampa||
    !Lampa.Component||
    !Lampa.Activity||
    !Lampa.Select||
    !Lampa.Input||
    !window.$){
  setTimeout(init,500);
  return
 }

 Lampa.Component.add('ua_search_081',Page);

 $('<style id="uas81-style">'+
  '.uas81-body{padding:1.5em 3em}'+
  '.uas81-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}'+
  '.uas81-card{min-width:0;padding:.35em;border-radius:.5em}'+
  '.uas81-card.focus{background:#fff;color:#111}'+
  '.uas81-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.3em}'+
  '.uas81-name{font-size:1.1em;line-height:1.3;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'+
  '.uas81-search{padding:.7em 1em;margin:.5em;border-radius:.5em;background:#1f6feb;color:#fff}'+
  'body.true--mobile .uas81-grid{grid-template-columns:repeat(3,minmax(0,1fr))}'+
  '</style>'
 ).appendTo('head');

 function ready(){
  insert();

  if(window.MutationObserver){
   var scheduled=false;
   new MutationObserver(function(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(function(){
     scheduled=false;
     insert()
    },150)
   }).observe(document.body,{
    childList:true,
    subtree:true
   })
  }

  setInterval(insert,5000);
  note('UA Search 0.8.1 активовано')
 }

 if(window.appready)ready();
 else Lampa.Listener.follow('app',function(e){
  if(e.type==='ready')ready()
 });

 window.UASearch081={
  open:menu,
  search:search
 };
}

init();
})();
