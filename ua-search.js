
(function () {
  'use strict';
  var VERSION = '0.7.7';
  var BASE = 'https://uakino.ax';
  var STORE = 'ua_search_filters_07';
  var TIMEOUT = 20000;
  if (window.__UA_SEARCH_077__) return;
  window.__UA_SEARCH_077__ = true;

  var defaults = {genre:'',yearFrom:0,yearTo:0,type:'',quality:'',sort:'default',country:'',rating:0,category:'new',pages:3};
  var lists = {
    genre:[['','Усі жанри'],[28,'Бойовик'],[12,'Пригоди'],[16,'Анімація'],[35,'Комедія'],[80,'Кримінал'],[99,'Документальний'],[18,'Драма'],[10751,'Сімейний'],[14,'Фентезі'],[36,'Історичний'],[27,'Жахи'],[9648,'Детектив'],[10749,'Мелодрама'],[878,'Фантастика'],[53,'Трилер']],
    type:[['','Усі типи'],['films','Фільми'],['series','Серіали'],['cartoons','Мультфільми'],['multserialy','Мультсеріали'],['anime','Аніме'],['dorama','Дорами']],
    quality:[['','Будь-яка'],['2160','4K'],['1080','1080p'],['720','720p']],
    sort:[['default','Порядок UAKino'],['rating_desc','Рейтинг ↓'],['rating_asc','Рейтинг ↑'],['year_desc','Спочатку нові'],['year_asc','Спочатку старі'],['title_asc','Назва А–Я']],
    country:[['','Усі країни'],['UA','Україна'],['US','США'],['GB','Велика Британія'],['FR','Франція'],['DE','Німеччина'],['PL','Польща'],['JP','Японія'],['KR','Південна Корея'],['CA','Канада']],
    rating:[[0,'Будь-який'],[5,'5+'],[6,'6+'],[7,'7+'],[7.5,'7.5+'],[8,'8+'],[8.5,'8.5+'],[9,'9+']],
    category:[['new','Новинки'],['films','Фільми'],['series','Серіали'],['cartoons','Мультфільми'],['multserialy','Мультсеріали'],['anime','Аніме'],['dorama','Дорами'],['4k','4K'],['top','Найкраще']],
    pages:[[1,'30 записів'],[2,'60 записів'],[3,'90 записів'],[5,'150 записів']]
  };
  var state = Object.assign({}, defaults);
  var cache = {};
  var gridRegistered = false;
  var booted = false;
  var attempts = 0;
  var searchButtonTimer = null;

  function log(e) { try { console.log('[UA Search '+VERSION+']',e); } catch (_) {} }
  function notice(t) { try { Lampa.Noty.show('UA Search: '+t); } catch (_) { log(t); } }
  function readState() { try { var s=Lampa.Storage.get(STORE,{}); if(s && typeof s==='object') Object.keys(defaults).forEach(function(k){if(s[k]!==undefined)state[k]=s[k];}); }catch(e){log(e);} }
  function saveState() { try {Lampa.Storage.set(STORE,state);}catch(e){log(e);} }
  function label(arr,v){for(var i=0;i<arr.length;i++)if(String(arr[i][0])===String(v))return arr[i][1];return String(v);}
  function years(){var r=[[0,'Без обмеження']];for(var y=new Date().getFullYear()+1;y>=1950;y--)r.push([y,String(y)]);return r;}
  function select(title,items,cb){
    try {Lampa.Select.show({title:title,items:items,onSelect:function(x){try{cb(x);}catch(e){log(e);notice(e.message);}},onBack:function(){}});}
    catch(e){log(e);notice('Не вдалося відкрити меню');}
  }
  function choose(k,title){var a=(k==='yearFrom'||k==='yearTo')?years():lists[k];select(title,a.map(function(x){return {title:x[1],value:x[0],selected:String(x[0])===String(state[k])};}),function(x){state[k]=x.value;saveState();setTimeout(filtersMenu,80);});}
  function filtersMenu(){
    var fields=[['genre','Жанр'],['yearFrom','Рік від'],['yearTo','Рік до'],['type','Тип контенту'],['quality','Якість'],['sort','Сортування'],['country','Країна'],['rating','Мінімальний рейтинг'],['category','Категорія'],['pages','Кількість сторінок']];
    var rows=fields.map(function(f){return {title:f[1],subtitle:label((f[0]==='yearFrom'||f[0]==='yearTo')?years():lists[f[0]],state[f[0]]),key:f[0]};});
    rows.push({title:'Показати плитки UAKino',action:'catalog'});
    rows.push({title:'Скинути фільтри',action:'reset'});
    select('UA Search '+VERSION+' · Фільтри',rows,function(x){
      if(x.action==='catalog')return catalog();
      if(x.action==='reset'){state=Object.assign({},defaults);saveState();return setTimeout(filtersMenu,80);}
      if(x.key)choose(x.key,x.title);
    });
  }
  function request(path){return new Promise(function(resolve,reject){
    var xhr=new XMLHttpRequest(),finished=false,timer;
    function done(err,data){if(finished)return;finished=true;clearTimeout(timer);if(err)reject(err);else resolve(data);}
    try{
      xhr.open('GET',BASE+path,true);xhr.timeout=TIMEOUT;
      timer=setTimeout(function(){try{xhr.abort();}catch(_){}done(new Error('Таймаут 20 секунд'));},TIMEOUT);
      xhr.onload=function(){if(xhr.status<200||xhr.status>=300)return done(new Error('HTTP '+xhr.status));try{done(null,JSON.parse(xhr.responseText));}catch(e){done(new Error('Некоректний JSON'));}};
      xhr.onerror=function(){done(new Error('Мережева помилка / CORS'));};
      xhr.ontimeout=function(){done(new Error('Таймаут 20 секунд'));};
      xhr.send();
    }catch(e){done(e);}
  });}
  function loading(on){try{if(Lampa.Loading){if(on)Lampa.Loading.start();else Lampa.Loading.stop();}}catch(e){log(e);}}
  function page(cat,n){var k=cat+':'+n,c=cache[k];if(c&&Date.now()-c.time<120000)return Promise.resolve(c.data);
    return request('/hls/api/lampa/list?cat='+encodeURIComponent(cat)+'&page='+n+'&limit=30').then(function(d){if(!d||!Array.isArray(d.results))throw new Error('Невідомий формат каталогу');cache[k]={time:Date.now(),data:d};return d;});}
  function norm(x){var z=Object.assign({},x);z._title=String(x.title||x.name||'Без назви');z._year=parseInt(x.year||x.release_date||x.first_air_date,10)||0;
    var r=x.rating!=null?x.rating:x.vote_average;z._rating=(r==null||r==='')?null:Number(r);if(!isFinite(z._rating))z._rating=null;
    z._genres=x.genre_ids||x.genres||[];z._countries=x.production_countries||x.origin_country||x.countries||[];z._quality=String(x.quality||x.video_quality||'').toLowerCase();return z;}
  function contains(a,v,field){if(!v)return true;if(!Array.isArray(a))return false;return a.some(function(x){var q=typeof x==='object'?(x[field]||x.id||x.name||''):x;return String(q).toUpperCase()===String(v).toUpperCase();});}
  function match(x){
    if(state.yearFrom&&(!x._year||x._year<Number(state.yearFrom)))return false;
    if(state.yearTo&&(!x._year||x._year>Number(state.yearTo))return false;
    if(state.rating&&(x._rating===null||x._rating<Number(state.rating)))return false;
    if(!contains(x._genres,state.genre,'id'))return false;
    if(!contains(x._countries,state.country,'iso_3166_1'))return false;
    if(state.quality){var q=String(state.quality);if(q==='2160'&&!/2160|4k|uhd/.test(x._quality))return false;if(q==='1080'&&!/1080|fhd/.test(x._quality))return false;if(q==='720'&&!/720|\bhd\b/.test(x._quality))return false;}
    if(state.type){var t=String(x.type||x.category||x.content_type||'').toLowerCase();var aliases={films:['films','film','movie'],series:['series','serial','tv'],cartoons:['cartoons','cartoon','animation'],multserialy:['multserialy','animated_series'],anime:['anime'],dorama:['dorama']};if(t&&aliases[state.type]&&aliases[state.type].indexOf(t)<0)return false;}
    return true;
  }
  function sortItems(a){var s=state.sort;if(s==='default')return a;return a.sort(function(x,y){
    if(s==='rating_desc')return (y._rating==null?-1:y._rating)-(x._rating==null?-1:x._rating);
    if(s==='rating_asc')return (x._rating==null?99:x._rating)-(y._rating==null?99:y._rating);
    if(s==='year_desc')return y._year-x._year;
    if(s==='year_asc')return x._year-y._year;
    if(s==='title_asc')return x._title.localeCompare(y._title,'uk');return 0;
  });}
  function tmdbId(x){var v=x.tmdb_id||x.tmdb||x.tmdbId;if(v&&typeof v==='object')v=v.id;return /^\d+$/.test(String(v||''))&&Number(v)>0?Number(v):null;}
  function mediaType(x){var t=String(x.media_type||x.type||x.content_type||'').toLowerCase();return x.is_series===true||['tv','series','serial'].indexOf(t)>=0?'tv':'movie';}
  function poster(x){
    var v=x.poster_path||x.poster||x.img||x.image||x.poster_url||'';
    if(typeof v!=='string')return '';
    if(/^https?:\/\//i.test(v))return v;
    if(/^\/\//.test(v))return 'https:'+v;
    if(/^\/hls\//.test(v))return BASE+v;
    if(/^\/[^/]/.test(v))return 'https://image.tmdb.org/t/p/w500'+v;
    return '';
  }
  function openCard(x){
    var id=tmdbId(x);
    if(!id){notice('Для цього запису немає TMDB ID — відкриття картки недоступне');return;}
    try{
      var type=mediaType(x);
      var card={id:id,title:x._title,name:x._title,media_type:type,release_date:x.release_date||'',first_air_date:x.first_air_date||'',poster_path:x.poster_path||''};
      Lampa.Activity.push({component:'full',source:'tmdb',method:type,id:id,card:card,movie:card,title:x._title,page:1});
    }catch(e){log(e);notice('Картка: '+e.message);}
  }
  function registerGrid(){
    if(gridRegistered)return true;
    if(!Lampa.Component||typeof Lampa.Component.add!=='function'||!Lampa.Activity||!Lampa.Controller||!Lampa.Card||!window.$)return false;
    Lampa.Component.add('ua_search_grid_077',function(){
      var self=this,root=$('<div class="ua-search-grid-077"></div>'),list=$('<div class="ua-search-grid-077__list"></div>'),buttons=[],current=0,items=[],destroyed=false;
      var css='.ua-search-grid-077{padding:1.5em 2.5em;min-height:100%;box-sizing:border-box}.ua-search-grid-077__heading{font-size:1.7em;margin-bottom:1em}.ua-search-grid-077__list{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:1.2em}.ua-search-grid-077__list .card{width:100%;margin:0}.ua-search-grid-077__list .card--focus{outline:3px solid #fff}.ua-search-grid-077__empty{padding:2em}';
      if(!document.getElementById('ua-search-grid-077-style')){$('<style id="ua-search-grid-077-style"></style>').text(css).appendTo('head');}
      function focus(i){if(!buttons.length)return;current=Math.max(0,Math.min(i,buttons.length-1));buttons.forEach(function(b,n){b.el.toggleClass('card--focus',n===current);});var node=buttons[current].el[0];if(node&&node.scrollIntoView)node.scrollIntoView({block:'nearest',inline:'nearest'});}
      function cols(){var width=list.width(),w=175;return Math.max(1,Math.floor(width/w));}
      function navigate(dir){if(dir==='left')focus(current-1);if(dir==='right')focus(current+1);if(dir==='up')focus(current-cols());if(dir==='down')focus(current+cols());}
      function openSelected(){if(buttons[current])openCard(buttons[current].data);}
      this.create=function(){
        items=(this.activity&&this.activity.items)||[];
        root.empty().append($('<div class="ua-search-grid-077__heading"></div>').text('UAKino · '+items.length+' результатів')).append(list);
        list.empty();buttons=[];
        items.forEach(function(x){
          try{
            var id=tmdbId(x),type=mediaType(x),p=poster(x);
            var data={id:id||0,title:x._title,name:x._title,media_type:type,poster_path:p,release_date:x.release_date||String(x._year||''),vote_average:x._rating||0};
            var card=new Lampa.Card(data,{card_category:true,card_type:'true'});
            if(typeof card.create==='function')card.create();
            var el=card.render();
            if(!el||!el.length)throw new Error('Card.render порожній');
            el.addClass('selector').attr('tabindex','0');
            el.on('hover:enter click',function(){openCard(x);});
            el.on('hover:focus',function(){var i=buttons.findIndex(function(b){return b.el[0]===el[0];});if(i>=0)current=i;});
            list.append(el);buttons.push({el:el,data:x,card:card});
          }catch(e){log('Card error: '+e.message);}
        });
        if(!buttons.length)list.append('<div class="ua-search-grid-077__empty">Немає карток для відображення</div>');
        return root;
      };
      this.start=function(){
        if(destroyed)return;
        Lampa.Controller.add('ua_search_grid_077',{
          toggle:function(){focus(current);},
          left:function(){navigate('left');},right:function(){navigate('right');},up:function(){navigate('up');},down:function(){navigate('down');},
          enter:openSelected,
          back:function(){Lampa.Activity.backward();}
        });
        Lampa.Controller.toggle('ua_search_grid_077');
      };
      this.pause=function(){};
      this.stop=function(){};
      this.render=function(){return root;};
      this.destroy=function(){destroyed=true;buttons.forEach(function(b){try{if(b.card&&b.card.destroy)b.card.destroy();}catch(_){}});root.remove();};
    });
    gridRegistered=true;return true;
  }
  function showGrid(items){
    if(!registerGrid()){notice('У цій збірці недоступні компоненти плиток Lampa');return;}
    try{if(Lampa.Select&&Lampa.Select.hide)Lampa.Select.hide();}catch(e){log(e);}
    setTimeout(function(){try{Lampa.Activity.push({component:'ua_search_grid_077',title:'UA Search · UAKino',items:items,page:1});}catch(e){log(e);notice('Не вдалося відкрити плитки: '+e.message);}},180);
  }
  function catalog(){
    var cat=state.type||state.category,count=Math.max(1,Math.min(5,Number(state.pages)||3)),all=[];
    loading(true);
    function next(n){if(n>count)return Promise.resolve(all);return page(cat,n).then(function(d){all=all.concat(d.results);if(d.total_pages)count=Math.min(count,Number(d.total_pages)||count);return next(n+1);});}
    next(1).then(function(raw){loading(false);var seen={};var unique=raw.filter(function(x){var k=String(x.uakino_id||x.id||((x.title||x.name)+':'+x.year));if(seen[k])return false;seen[k]=true;return true;});
      var result=sortItems(unique.map(norm).filter(match));if(!result.length){notice('За вибраними фільтрами нічого не знайдено');return;}showGrid(result);
    }).catch(function(e){loading(false);log(e);notice('Каталог: '+e.message);});
  }
  function test(){loading(true);page('new',1).then(function(d){loading(false);notice('API працює: '+d.results.length+' записів');}).catch(function(e){loading(false);notice('API: '+e.message);});}
  function main(){select('UA Search '+VERSION,[{title:'Фільтри',action:'filters'},{title:'Плитки UAKino',action:'catalog'},{title:'Тест API',action:'test'}],function(x){if(x.action==='filters')filtersMenu();if(x.action==='catalog')catalog();if(x.action==='test')test();});}
  function addSearchButton(){
    try{
      var root=document.querySelector('.search--active, .search-main, .search__content, .search');
      if(!root||root.querySelector('.ua-search-077-button'))return;
      var b=document.createElement('div');b.className='ua-search-077-button selector';b.textContent='⚙ Фільтри UA Search';b.style.cssText='display:inline-block;padding:12px 18px;margin:10px;border:2px solid #777;border-radius:8px;color:white;cursor:pointer';
      b.addEventListener('click',filtersMenu);
      if(window.$)$(b).on('hover:enter',filtersMenu);
      root.insertBefore(b,root.firstChild);
    }catch(e){log(e);}
  }
  function install(){
    if(booted)return;
    if(!window.Lampa||!Lampa.Select||!Lampa.Storage||!Lampa.SettingsApi||typeof Lampa.SettingsApi.addParam!=='function'){
      if(++attempts<50)setTimeout(install,500);return;
    }
    booted=true;readState();
    try{Lampa.SettingsApi.addParam({component:'interface',param:{name:'ua_search_077_open',type:'trigger',default:false},field:{name:'UA Search 0.7.7',description:'Фільтри та плитки UAKino'},onChange:main});}catch(e){log(e);}
    try{if(Lampa.Listener&&Lampa.Listener.follow)Lampa.Listener.follow('activity',function(e){var d=e&&e.data||e||{},component=String(d.component||'');if(component.indexOf('search')===0){setTimeout(addSearchButton,150);setTimeout(addSearchButton,500);}});}catch(e){log(e);}
    window.LampaUASearch={version:VERSION,open:main,filters:filtersMenu,catalog:catalog,test:test};
    notice(VERSION+' завантажена');
  }
  try{install();}catch(e){log(e);}
})();
          
