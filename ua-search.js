(function (root) {
 'use strict';
 function decode(value) {
  if (typeof value !== 'string' || value.slice(-2) !== '==') return value;
  var bytes = atob(value.slice(0, -2)), out = '';
  if (bytes.length < 2) throw Error('Порожні дані Tortuga');
  for (var i = 1; i < bytes.length; i++)
   out += String.fromCharCode(bytes.charCodeAt(i) ^ ((bytes.charCodeAt(0) + 7 * (i - 1) + 13) % 256));
  try { return decodeURIComponent(escape(out)); } catch (e) { return out; }
 }
 function parse(html) {
  var start = html.indexOf('new TortugaCore(');
  if (start < 0) throw Error('Параметри TortugaCore не знайдено');
  var source = html.slice(start), options = {};
  ['file', 'st', 'fbu'].forEach(function (key) {
   var re = new RegExp('(?:^|[,{\\s])(?:"' + key + '"|\'' + key + '\'|' + key + ')\\s*:\\s*("(?:\\\\.|[^"\\\\])*")');
   var match = re.exec(source);
   if (match) options[key] = decode(JSON.parse(match[1]));
  });
  if (!options.file) throw Error('Поле file не знайдено');
  var tree;
  try { tree = JSON.parse(options.file); }
  catch (e) { tree = [{title: 'Відео', file: options.file}]; }
  if (!Array.isArray(tree)) throw Error('Невідомий формат каталогу');
  var episodes = [], isSeries = tree.some(function (node) { return node && Array.isArray(node.folder); });
  function walk(nodes, season) {
   nodes.forEach(function (node, index) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.folder)) {
     walk(node.folder, String(node.season || node.number || season || index + 1));
     return;
    }
    if (typeof node.file !== 'string') return;
    var voices = [], re = /(?:\{([^{}]*)\})?(https?:\/\/[^\s{}(),]+\.m3u8(?:\?[^\s{}(),]*)?)(?:\(subtitle:([^)]*)\))?/gi, m;
    while ((m = re.exec(node.file))) {
     var subs = [], sr = /\[([^\]]+)\](https?:\/\/[^,\s]+)/g, sm;
     while ((sm = sr.exec(m[3] || ''))) subs.push({label: sm[1], url: sm[2]});
     voices.push({name: m[1] || 'Оригінал', url: m[2], subtitles: subs});
    }
    if (voices.length) episodes.push({
     id: String(node.id || season + '-' + (node.number || index + 1)),
     season: String(season || '1'), number: String(node.number || index + 1),
     title: node.title || 'Серія ' + (index + 1), poster: node.poster || '', voices: voices
    });
   });
  }
  walk(tree, '');
  if (!episodes.length) throw Error('HLS-посилань у каталозі немає');
  return {episodes: episodes, isSeries: isSeries, st: options.st || ''};
 }
 function get(url) {
  return new Promise(function (resolve, reject) {
   var request = new Lampa.Reguest(), done = false;
   var timer = setTimeout(function () { finish(Error('Таймаут завантаження')); }, 15000);
   function finish(error, data) {
    if (done) return;
    done = true; clearTimeout(timer);
    if (error) reject(error); else resolve(data);
   }
   try {
    request.native(url, function (raw) {
     var text = typeof raw === 'string' ? raw : raw && raw.data;
     if (typeof text !== 'string') return finish(Error('Сервер повернув не текст'));
     finish(null, text);
    }, function () { finish(Error('Не вдалося завантажити сторінку')); }, false, {dataType: 'text',headers:/^https:\/\/zetvideo\.net\//i.test(url)?{Referer:'https://uafix.net/'}:{}});
   } catch (e) { finish(e); }
  });
 }
 function tortuga(url, base) {
  try {
   var u = new URL(url, base);
   return u.protocol === 'https:' && /^(?:www\.)?tortuga\.tw$/i.test(u.hostname) && /^\/(?:embed|vod)\/\d+\/?$/.test(u.pathname) ? u.href : '';
  } catch (e) { return ''; }
 }
 var cryptoPromise;
 function cryptoReady() {
  if (root.CryptoJS && root.CryptoJS.PBKDF2 && root.CryptoJS.algo.SHA512) return Promise.resolve(root.CryptoJS);
  if (cryptoPromise) return cryptoPromise;
  cryptoPromise = new Promise(function (resolve, reject) {
   var script = document.createElement('script'), done = false;
   var timer = setTimeout(function () { finish(Error('Таймаут бібліотеки дешифрування')); }, 15000);
   function finish(error) {
    if (done) return;
    done = true; clearTimeout(timer);
    script.onload = script.onerror = null;
    if (script.parentNode) script.parentNode.removeChild(script);
    if (error) reject(error); else resolve(root.CryptoJS);
   }
   script.src = 'https://uaserials.com/templates/common/js/crypto-js.min.js?v3.1.9-1';
   script.onload = function () {
    finish(root.CryptoJS && root.CryptoJS.PBKDF2 && root.CryptoJS.algo.SHA512 ? null : Error('Бібліотека дешифрування недоступна'));
   };
   script.onerror = function () { finish(Error('Не вдалося завантажити бібліотеку дешифрування')); };
   document.head.appendChild(script);
  }).catch(function (error) { cryptoPromise = null; throw error; });
  return cryptoPromise;
 }
 function decryptControl(raw, crypto) {
  var payload = JSON.parse(raw);
  var salt = crypto.enc.Hex.parse(payload.salt);
  var iv = crypto.enc.Hex.parse(payload.iv);
  var key = crypto.PBKDF2('297796CCB81D255125', salt, {
   hasher: crypto.algo.SHA512, keySize: 8, iterations: 999
  });
  var plain = crypto.AES.decrypt(payload.ciphertext, key, {iv: iv}).toString(crypto.enc.Utf8);
  return JSON.parse(plain.replace(/\\/g, ''));
 }
 function locate(html, base) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var control = doc.querySelector('player-control[data-tag1],player-control[data-tag2]');
  if (control) {
   return cryptoReady().then(function (crypto) {
    var tabs = [];
    ['data-tag1', 'data-tag2'].forEach(function (attribute) {
     var raw = control.getAttribute(attribute);
     if (!raw) return;
     var decoded = decryptControl(raw, crypto);
     if (!Array.isArray(decoded)) throw Error('Невідомий формат player-control');
     tabs = tabs.concat(decoded);
    });
    var defaultTab = control.getAttribute('data-default') || 'Плеєр';
    var candidates = tabs.filter(function (tab) {
     return tab && !/трейлер|trailer|тизер|teaser|промо|promo/i.test(tab.tabName || '') && tortuga(tab.url, base);
    });
    candidates.sort(function (a, b) {
     return Number(b.tabName === defaultTab) - Number(a.tabName === defaultTab);
    });
    if (!candidates.length) throw Error('У player-control не знайдено основний плеєр Tortuga');
    return tortuga(candidates[0].url, base);
   });
  }
  var frames = doc.querySelectorAll('iframe[src],iframe[data-src]');
  for (var i = 0; i < frames.length; i++) {
   var url = tortuga(frames[i].getAttribute('src') || frames[i].getAttribute('data-src'), base);
   if (url && /\/embed\//.test(url)) return Promise.resolve(url);
  }
  throw Error('Основний плеєр Tortuga не знайдено. Метадані embedUrl можуть містити трейлер');
 }
 function metadataFrom(html) {
  var doc=new DOMParser().parseFromString(html,'text/html'),out={};
  function visit(value){
   if(!value||typeof value!=='object')return;
   var types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
   if(types.some(function(type){return type==='Movie'||type==='TVSeries';})){
    out.overview=value.description||'';
    out.year=parseInt(value.datePublished||value.dateCreated||'',10)||0;
    out.rating=Number(value.aggregateRating&&value.aggregateRating.ratingValue)||0;
    out.cast=(Array.isArray(value.actor)?value.actor:[]).map(function(actor){return {name:actor.name||''};});
    out.age_rating=value.contentRating||out.age_rating||'';
    return;
   }
   Object.keys(value).forEach(function(key){if(value[key]&&typeof value[key]==='object')visit(value[key]);});
  }
  var scripts=doc.querySelectorAll('script[type="application/ld+json"]');
  for(var i=0;i<scripts.length;i++){try{visit(JSON.parse(scripts[i].textContent));}catch(e){}}
  if(!out.overview){var description=doc.querySelector('.ftext.full-text,meta[name="description"]');if(description)out.overview=description.getAttribute('content')||description.textContent||'';}
  var ageNode=doc.querySelector('[itemprop="contentRating"],meta[itemprop="contentRating"],meta[name="contentRating"],.age-rating,.age-limit,.age_restriction,.age-rating-label');
  if(ageNode)out.age_rating=ageNode.getAttribute('content')||ageNode.textContent||'';
  var imdb=doc.querySelector('.short-rate-imdb span');
  var imdbValue=imdb?Number(String(imdb.textContent).replace(',','.').trim()):0;
  if(imdbValue>0&&imdbValue<=10)out.rating=imdbValue;
  return out;
 }
 function nativeCatalog(pageUrl) {
  var direct = tortuga(pageUrl, pageUrl),metadata={};
  return (direct ? Promise.resolve(direct) : get(pageUrl).then(function (html) {
   metadata=metadataFrom(html);return locate(html, pageUrl);
  })).then(function (url) { return get(url); }).then(function(html){var data=parse(html);data.metadata=metadata;return data;});
 }
 function open(item, onBack) {
  var closed = false;
  function back() { closed = true; if (onBack) onBack(); }
  function fail(error) { if (!closed) { Lampa.Noty.show('UASerials: ' + error.message); back(); } }
  function show(title, items, action, previous) {
   Lampa.Select.show({title: title, items: items, onBack: previous || back, onSelect: function (row) {
    Lampa.Select.hide(); action(row);
   }});
  }
  function play(episode, voice) {
   Lampa.Noty.show('Оновлюю посилання серії…');
   catalog(item.url).then(function (fresh) {
    if (closed) return;
    var current = fresh.episodes.filter(function (e) {
     return e.id === episode.id && e.season === episode.season;
    })[0];
    var stream = current && current.voices.filter(function (v) { return v.name === voice.name; })[0];
    if (!stream) throw Error('Серія або озвучення більше не доступні');
    var entry = {title: (item.title || item.name || 'UASerials') + (serial(item,fresh) ? ' · Сезон ' + current.season + ' · ' + current.title : ''),
     url: stream.url, hls_type: 'hlsjs', subtitles: stream.subtitles};
    Lampa.Player.play(entry);
    Lampa.Player.playlist([entry]);
   }).catch(fail);
  }
  Lampa.Noty.show('Завантажую каталог Tortuga…');
  return catalog(item.url).then(function (data) {
   if (closed) return;
   var seasons = [];
   data.episodes.forEach(function (e) { if (seasons.indexOf(e.season) < 0) seasons.push(e.season); });
   function seasonMenu() {
    show(item.title || item.name || 'UASerials', seasons.map(function (s) {
     return {title: 'Сезон ' + s, value: s};
    }), function (row) { episodeMenu(row.value); });
   }
   function episodeMenu(season) {
    show('Сезон ' + season, data.episodes.filter(function (e) { return e.season === season; }).map(function (e) {
     return {title: e.title, value: e};
    }), function (row) {
     var e = row.value;
     if (e.voices.length === 1) return play(e, e.voices[0]);
     show('Озвучення · ' + e.title, e.voices.map(function (v) { return {title: v.name, value: v}; }),
      function (v) { play(e, v.value); }, function () { episodeMenu(season); });
    }, seasonMenu);
   }
   if (!serial(item, data)) {
    var movie = data.episodes[0];
    if (movie.voices.length === 1) return play(movie, movie.voices[0]);
    return show('Озвучення', movie.voices.map(function (v) { return {title: v.name, value: v}; }), function (v) { play(movie, v.value); });
   }
   seasonMenu();
  }).catch(fail);
 }
 function jsonAfter(html, marker) {
  var at=html.indexOf(marker);if(at<0)throw Error('Дані плеєра не знайдено');
  var start=html.indexOf('{',at+marker.length),depth=0,quoted=false,escaped=false;
  for(var i=start;i>=0&&i<html.length;i++){
   var c=html.charAt(i);
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
   else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(html.slice(start,i+1));
  }
  throw Error('Некоректні дані плеєра');
 }
 function safeEmbed(raw,base){
  try{var u=new URL(raw,base);return u.protocol==='https:'&&/^(?:[a-z0-9-]+\.)?(?:ashdi\.(?:vip|biz|club)|zetvideo\.net|uacdn\.online|tortuga\.tw)$/i.test(u.hostname)?u.href:'';}catch(e){return '';}
 }
 function embedCatalog(tabs,base){
  var episodes=[],index={};
  function add(url,season,episode,voice,serial){
   url=safeEmbed(url,base);if(!url)return;
   var key=season+'-'+episode,entry=index[key];
   if(!entry){entry={id:key,season:String(season),number:String(episode),title:serial?'Серія '+episode:'Фільм',voices:[]};index[key]=entry;episodes.push(entry);}
   entry.voices.push({name:voice,url:'',embed:url,subtitles:[]});
  }
  var isSeries=false;
  Object.keys(tabs).forEach(function(tab){
   if(/trailer|трейлер|тизер|youtube/i.test(tab))return;
   var value=tabs[tab];
   if(typeof value==='string'){add(value,1,1,'Оригінал',false);return;}
   if(!value||typeof value!=='object')return;
   Object.keys(value).forEach(function(season){
    var rows=value[season],sn=parseInt(season,10)||1;
    if(!rows||typeof rows!=='object')return;
    Object.keys(rows).forEach(function(ep){
     if(typeof rows[ep]!=='string')return;
     isSeries=true;add(rows[ep],sn,parseInt(ep,10)||1,tab==='Player1'?'Цікава ідея':tab,true);
    });
   });
  });
  if(!episodes.length)throw Error('Доступних відео не знайдено');
  episodes.sort(function(a,b){return Number(a.season)-Number(b.season)||Number(a.number)-Number(b.number);});
  return {episodes:episodes,isSeries:isSeries};
 }
 function playerLiteral(html){
  var m=/\bfile\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/.exec(html);
  if(!m)throw Error('Потік Ashdi не знайдено');
  if(m[1].charAt(0)==='"')return JSON.parse(m[1]);
  return m[1].slice(1,-1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\\/'"nrt])/g,function(all,code){
   if(code.charAt(0)==='u'||code.charAt(0)==='x')return String.fromCharCode(parseInt(code.slice(1),16));
   return code==='n'?'\n':code==='r'?'\r':code==='t'?'\t':code;
  });
 }
 function ashdiData(html){
  var file=playerLiteral(html),tree;
  try{tree=JSON.parse(file);}catch(e){tree=[{title:'Фільм',file:file}];}
  if(!Array.isArray(tree))throw Error('Невідомий каталог Ashdi');
  return parse('new TortugaCore({file:'+JSON.stringify(JSON.stringify(tree))+'})');
 }
 function uacdnCatalog(html,url){
  var payload=jsonAfter(html,'window.__PLAYER_PAYLOAD__ ='),episodes=[];
  var voices=Array.isArray(payload.translations)&&payload.translations.length?payload.translations:[{id:payload.translate,title:payload.translateTitle||'Оригінал'}];
  var seasons=payload.is_serial?payload.seasons_episodes:{'1':[1]};
  Object.keys(seasons||{}).forEach(function(season){
   (seasons[season]||[]).filter(function(ep){return Number(ep)>0;}).forEach(function(ep){
    episodes.push({id:season+'-'+ep,season:String(season),number:String(ep),title:payload.is_serial?'Серія '+ep:'Фільм',voices:voices.map(function(voice){
     var u=new URL(url);u.searchParams.set('translation',voice.id);if(payload.is_serial){u.searchParams.set('season',season);u.searchParams.set('episode',ep);}
     return {name:voice.title||'Оригінал',url:'',embed:u.href,subtitles:[],blocked:payload.captcha_required?'Цей плеєр UAFIX потребує CAPTCHA на сайті. Перегляд у Lampa поки недоступний.':''};
    })});
   });
  });
  if(!episodes.length)throw Error('UACDN не повернув каталог серій');
  return {episodes:episodes,isSeries:!!payload.is_serial};
 }
 function uafixCatalog(pageUrl,html){
  var match=/data-up-id=["'](\d+)["']/.exec(html);if(!match)throw Error('Плеєр UAFIX не знайдено');
  var api='https://uafix.cc/index.php?controller=ajax&mod=uafix_playback&id='+match[1];
  return get(api).then(function(raw){
   var config=JSON.parse(raw),sources=(config.sources||[]).filter(function(s){return s.key==='ashdi'||s.key==='uacdn';});
   sources.sort(function(a,b){return Number(b.key==='ashdi')-Number(a.key==='ashdi');});
   if(!sources.length)throw Error('Провайдери цього відео поки не підтримуються');
   var source=sources[0],url=safeEmbed(source.url,pageUrl);if(!url)throw Error('Непідтримувана адреса плеєра');
   return get(url).then(function(player){
    var data=source.key==='uacdn'?uacdnCatalog(player,url):ashdiData(player);
    data.metadata={overview:metadataFrom(html).overview,year:Number(config.card.year)||0,rating:Number(config.card.imdb)||0};return data;
   });
  });
 }
 function uaflixPlayers(html,base){
  var doc=new DOMParser().parseFromString(html,'text/html'),nodes=doc.querySelectorAll('#fplayer iframe[src],.fplayer iframe[src]'),urls=[];
  for(var i=0;i<nodes.length;i++){var url=safeEmbed(nodes[i].getAttribute('src'),base);if(url&&urls.indexOf(url)<0)urls.push(url);}
  if(!urls.length)throw Error('Плеєр UAFLIX не знайдено');
  return urls;
 }
 function uaflixCatalog(pageUrl,html){
  var doc=new DOMParser().parseFromString(html,'text/html'),links=doc.querySelectorAll('a[href]'),episodes=[],seen={};
  for(var i=0;i<links.length;i++){
   var url;try{url=new URL(links[i].getAttribute('href'),pageUrl);}catch(e){continue;}
   var match=/\/season-(\d+)-episode-(\d+)\//.exec(url.pathname);
   if(!match||url.origin!==new URL(pageUrl).origin||seen[url.href])continue;
   if(url.pathname.split('/season-')[0]!==new URL(pageUrl).pathname.replace(/\/$/,''))continue;
   seen[url.href]=true;
   var image=links[i].querySelector('img'),poster=image&&(image.getAttribute('data-src')||image.getAttribute('src'));
   episodes.push({id:match[1]+'-'+match[2],season:String(Number(match[1])),number:String(Number(match[2])),title:'Серія '+Number(match[2]),poster:poster?new URL(poster,pageUrl).href:'',voices:[{name:'UAFLIX',url:'',page:url.href,subtitles:[]}]});
  }
  if(episodes.length){episodes.sort(function(a,b){return Number(a.season)-Number(b.season)||Number(a.number)-Number(b.number);});return {episodes:episodes,isSeries:true,metadata:metadataFrom(html)};}
  var players=uaflixPlayers(html,pageUrl);
  return {episodes:[{id:'1-1',season:'1',number:'1',title:'Фільм',voices:[{name:'UAFLIX',url:'',embed:players[0],fallbacks:players.slice(1),subtitles:[]}]}],isSeries:false,metadata:metadataFrom(html)};
 }
 function resolveUaflixPage(stream){
  return get(stream.page).then(function(html){var urls=uaflixPlayers(html,stream.page);stream.embed=urls[0];stream.fallbacks=urls.slice(1);delete stream.page;return resolveEmbed(stream);});
 }
 function catalog(pageUrl){
  var host=new URL(pageUrl).hostname;
  if(/^(?:www\.)?uafix\.net$/i.test(host))return get(pageUrl).then(function(html){return uaflixCatalog(pageUrl,html);});
  if(/^(?:www\.)?cikava-ideya\.top$/i.test(host))return get(pageUrl).then(function(html){var data=embedCatalog(jsonAfter(html,'switches ='),pageUrl);data.metadata=metadataFrom(html);return data;});
  if(/^(?:www\.)?uafix\.cc$/i.test(host))return get(pageUrl).then(function(html){return uafixCatalog(pageUrl,html);});
  return nativeCatalog(pageUrl);
 }
 function resolveEmbed(stream){
  if(stream.blocked)return Promise.reject(Error(stream.blocked));
  if(stream.page)return resolveUaflixPage(stream);
  if(!stream.embed)return Promise.resolve(stream);
  return get(stream.embed).then(function(html){
   if(/uacdn\.online/.test(new URL(stream.embed).hostname)){
    var payload=jsonAfter(html,'window.__PLAYER_PAYLOAD__ =');
    if(payload.captcha_required)throw Error('Цей плеєр потребує CAPTCHA на сайті UAFIX');
    throw Error('Прямий потік UACDN поки не підтримується');
   }
   var data=ashdiData(html),episode=data.episodes[0];
   if(data.isSeries)episode=data.episodes.filter(function(e){return e.season===stream.episode.season&&e.number===stream.episode.number;})[0];
   if(!episode)throw Error('Серію не знайдено в плеєрі');
   var voice=episode.voices.filter(function(v){return v.name===stream.voice;})[0]||episode.voices[0];
   return {url:voice.url,data:{subs:voice.subtitles},voice:voice.name,episode:stream.episode};
  }).catch(function(error){
   if(!stream.fallbacks||!stream.fallbacks.length)throw error;
   stream.embed=stream.fallbacks.shift();return resolveEmbed(stream);
  });
 }
 function serial(item, data) {
  if (item.media_type === 'movie') return false;
  if (item.media_type === 'tv') return true;
  return !!data.isSeries;
 }
 function choose(data, season, episode, voice) {
  var entry = data.episodes.filter(function (e) {
   return String(e.season) === String(season) && String(e.number) === String(episode);
  })[0];
  if (!entry) throw Error('Серія більше не доступна');
  var track = voice ? entry.voices.filter(function (v) { return v.name === voice; })[0] : entry.voices[0];
  if (!track) throw Error('Озвучення більше не доступне');
  return {url: track.url || track.embed || track.page, page:track.page, embed:track.embed, fallbacks:track.fallbacks?track.fallbacks.slice():[], blocked:track.blocked, data: {subs: track.subtitles}, voice: track.name, episode: entry};
 }
 function resolve(item, season, episode, voice) {
  return catalog(item.url).then(function (data) {
   if (!serial(item, data)) {
    season = data.episodes[0].season;
    episode = data.episodes[0].number;
   }
   return resolveEmbed(choose(data, season, episode, voice));
  });
 }
 root.UASerialsTortuga = {decode: decode, parse: parse, catalog: catalog, open: open, serial: serial, choose: choose, resolve: resolve, info:function(url){return get(url).then(metadataFrom);}, embedCatalog:embedCatalog, ashdiData:ashdiData, uacdnCatalog:uacdnCatalog};
 if (typeof module !== 'undefined' && module.exports) module.exports = root.UASerialsTortuga;
})(typeof window !== 'undefined' ? window : globalThis);


(function () {
'use strict';

if (window.UA_SEARCH_1312) return;
window.UA_SEARCH_1312 = true;

var API = 'https://uakino.ax';
var COMPONENT = 'ua_search_1312';
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
  a.unshift('[UA Search 1.3.12]');
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

function ageLimitOf(it) {
 if(!it)return '';
 var values=[it.age_limit,it.age_rating,it.age_restriction,it.ageRating,it.ageLimit,it.content_rating,it.contentRating,it.certification,it.mpaa,it.adult_rating];
 for(var i=0;i<values.length;i++){
  var value=values[i];
  if(value===null||value===undefined||value==='')continue;
  var raw=String(value).trim();
  var match=raw.match(/(?:^|\\b)(0|6|7|12|13|14|16|17|18|21)\\s*\\+?\\s*$/);
  if(match)return match[1]+'+';
  if(/^(?:G|TV-G|TV-Y|TV-Y7)$/i.test(raw))return '0+';
  if(/^(?:PG|TV-PG)$/i.test(raw))return 'Батьківський нагляд';
  if(/^(?:PG-13|TV-14)$/i.test(raw))return raw.toUpperCase();
  if(/^(?:R|NC-17|TV-MA)$/i.test(raw))return raw.toUpperCase();
 }
 return '';
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

function episodeNumber(v) {
 var n=Number(v);
 return isFinite(n)&&n>0?Math.floor(n):0;
}
function seasonList(data) {
 var root=data||{},raw=root.episodes||(root.data&&root.data.episodes);
 if(Array.isArray(raw)&&raw.length){
  var groups={};
  raw.forEach(function(e){
   if(!e||typeof e!=='object')return;
   var sn=episodeNumber(e.season||e.season_number);
   var en=episodeNumber(e.episode||e.episode_number);
   if(!sn||!en)return;
   if(!groups[sn])groups[sn]={number:sn,episodes:[]};
   var entry=groups[sn].episodes.filter(function(x){return x.number===en;})[0];
   if(!entry){entry={number:en,raw:e,voices:[]};groups[sn].episodes.push(entry);}
   var voice=String(e.voice||'').trim();
   if(voice&&entry.voices.indexOf(voice)<0)entry.voices.push(voice);
  });
  return Object.keys(groups).map(function(k){
   groups[k].episodes.sort(function(a,b){return a.number-b.number;});
   return groups[k];
  }).sort(function(a,b){return a.number-b.number;});
 }
 var seasons=root.seasons||root.serial_seasons||root.tv_seasons||[];
 if(!Array.isArray(seasons))return [];
 return seasons.map(function(v,i){
  var sn=episodeNumber(v.season_number||v.season||v.number)||i+1;
  var eps=Array.isArray(v.episodes)?v.episodes:[];
  return {number:sn,episodes:eps.map(function(e,j){return {number:episodeNumber(e.episode||e.number)||j+1,raw:e,voices:e.voice?[String(e.voice)]:[]};})};
 });
}
function resolveStream(it,season,episode,voice) {
 var id=it.uakino_id||it.id;
 if(!id)return Promise.reject(Error('Відсутній UAKino ID'));
 var path='/hls/api/play?movie='+enc(id)+'&s=lp'+Date.now();
 if(season)path+='&season='+enc(season);
 if(episode)path+='&episode='+enc(episode);
 if(voice)path+='&voice='+enc(voice);
 return request(path).then(function(data){
  var url=absolute(data.manifest_abs||data.manifest||data.url||'');
  return {url:url,data:data,seasons:seasonList(data)};
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
 var r = it.reactions || it.votes || it.uakino_reactions || {};

 var likes = it.likes;
 var dislikes = it.dislikes;

 if(likes == null) likes = r.likes != null?r.likes:r.like;
 if(dislikes == null) dislikes = r.dislikes != null?r.dislikes:r.dislike;
 if(likes == null) likes=it.uakino_likes;
 if(dislikes == null) dislikes=it.uakino_dislikes;

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
 return $('.menu [data-uas133="menu"]').first();
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
 var uaCatalog=null,detailLoading=false,detailError='',externalCandidates=[],detailModalOpen=false;
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
  if(!el || !active() || detailModalOpen) return;
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

 function revealEpisode(el){
  if(!el||!el.parentElement||!el.getBoundingClientRect)return;
  var track=el.parentElement;
  if(!track.classList.contains('uas133-episode-track'))return;
  var card=el.getBoundingClientRect(),box=track.getBoundingClientRect(),pad=8;
  if(card.left<box.left+pad)track.scrollLeft-=box.left+pad-card.left;
  else if(card.right>box.right-pad)track.scrollLeft+=card.right-box.right+pad;
 }
 function focusDetail(n) {
  if(!detailControls.length) return;

  zone='detail';
  detailCursor=Math.max(
   0,Math.min(detailControls.length-1,n)
  );
  var el=detailControls[detailCursor],row=$(el).attr('data-episode-row');
  if(row!==undefined&&row!==null){episodeRowCursor=Number(row);episodeColCursor=Number($(el).attr('data-episode-col'))||0;revealEpisode(el);}
  focus(el);
 }

 function restoreFocus() {
  if(!active()||detailModalOpen) return;

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
 function move(dir) {  if(!active()||detailModalOpen) return;

  if(view==='detail') {
   var currentEl=detailControls[detailCursor],currentRow=currentEl&&$(currentEl).attr('data-episode-row');
   if(currentRow!==undefined&&currentRow!==null){
    var rowNumber=Number(currentRow),col=Number($(currentEl).attr('data-episode-col'))||0;
    if(dir==='left'||dir==='right'){
     var nextCol=col+(dir==='left'?-1:1);
     if(episodeRows[rowNumber]&&episodeRows[rowNumber][nextCol]!==undefined)focusDetail(episodeRows[rowNumber][nextCol]);
     return;
    }
    if(dir==='up'){
     if(rowNumber>0&&episodeRows[rowNumber-1])focusDetail(episodeRows[rowNumber-1][Math.min(col,episodeRows[rowNumber-1].length-1)]);
     else focusDetail(Math.max(0,episodeRows[0][0]-1));
     return;
    }
    if(dir==='down'){
     if(episodeRows[rowNumber+1])focusDetail(episodeRows[rowNumber+1][Math.min(col,episodeRows[rowNumber+1].length-1)]);
     else focusDetail(Math.min(detailControls.length-1,episodeRows[rowNumber][episodeRows[rowNumber].length-1]+1));
     return;
    }
   }
   if(dir==='up'){
    var lastRow=episodeRows[episodeRows.length-1],afterEpisodes=lastRow&&lastRow[lastRow.length-1]+1;
    if(lastRow&&detailCursor===afterEpisodes&&episodeRows[episodeRowCursor]){
     var remembered=episodeRows[episodeRowCursor];focusDetail(remembered[Math.min(episodeColCursor,remembered.length-1)]);
    }else if(detailCursor===0)Lampa.Controller.toggle('head');else focusDetail(detailCursor-1);
   }
   if(dir==='down')focusDetail(detailCursor+1);
   if(dir==='left')Lampa.Controller.toggle('menu');
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
   '<div class="uas133-card selector">'+
    '<div class="uas133-poster"></div>'+
    '<div class="uas133-name"></div>'+
    '<div class="uas133-meta"></div>'+
   '</div>'
  );

  var p=posterUrl(it);

  if(p) {
   el.find('.uas133-poster').css(
    'background-image',
    'url("'+p.replace(/"/g,'%22')+'")'
   );
  }

  el.find('.uas133-name').text(titleOf(it));
  el.find('.uas133-meta').text(metadata(it));

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
    $('<div class="uas133-empty"></div>')
     .text(
      loading ?
      'Завантаження…' :
      'Немає результатів для вибраних фільтрів'
     )
   );

   updateStatus(loading?'Завантаження…':'');
   return;
  }

  var grid=$('<div class="uas133-grid"></div>');

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

 var metadataDrawTimer;
 function hydrateTitleInfo(items){
  items.filter(function(item){return /^https:\/\/(?:www\.)?uaserials\.com\//i.test(item.url||'');}).forEach(function(item){
   if(cachedTitleInfo(item))return;
   titleInfo(item).then(function(info){
    if(destroyed)return;
    mergeTitleInfo(item,info);
    clearTimeout(metadataDrawTimer);
    metadataDrawTimer=setTimeout(function(){
     if(destroyed||view!=='catalog')return;
     if(settings.year!=='all'||settings.rating||settings.sort!=='default')draw(true);
     else tiles.forEach(function(tile,index){if(visibleItems[index])$(tile).find('.uas133-meta').text(metadata(visibleItems[index]));});
    },150);
   }).catch(function(error){log('Title metadata:',item.url,error.message);});
  });
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
   hydrateTitleInfo(items);

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
   var el=$('<div class="uas133-filter selector"></div>').text(pair[1]);
   el.on('hover:enter',function(){filterAction(pair[0]);});
   el.on('hover:focus',function(){zone='filters';filterCursor=filters.indexOf(el[0]);});
   filterBar.append(el);
   filters.push(el[0]);
  });
 }
 function addDetailControl(label,fn){
  var el=$('<div class="uas133-action selector"></div>').text(label);
  el.on('hover:enter',fn);
  el.on('hover:focus',function(){zone='detail';detailCursor=detailControls.indexOf(el[0]);});
  detail.append(el);
  detailControls.push(el[0]);
 }
 var selectedSeason=0,selectedEpisode=0,selectedVoice='';
 var episodeRows=[],episodeRowCursor=0,episodeColCursor=0;
 function isUASerials(item) {
  return !!(item && /^https:\/\/(?:www\.)?(?:uaserials\.com|cikava-ideya\.top|uafix\.(?:cc|net))\//i.test(item.url || ''));
 }
 function sourceSeries() {
  return uaCatalog && window.UASerialsTortuga.serial(selected,uaCatalog);
 }
 function uaSeasons() {
  if (!sourceSeries()) return [];
  var groups={};
  uaCatalog.episodes.forEach(function(e){
   var sn=Number(e.season)||1,en=Number(e.number)||1;
   if(!groups[sn])groups[sn]={number:sn,episodes:[]};
   groups[sn].episodes.push({number:en,raw:{title:e.title,poster:e.poster},voices:e.voices.map(function(v){return v.name;})});
  });
  return Object.keys(groups).map(function(k){groups[k].episodes.sort(function(a,b){return a.number-b.number;});return groups[k];}).sort(function(a,b){return a.number-b.number;});
 }
 function setUaStream(){
  if(!uaCatalog||!uaCatalog.episodes.length)return;
  var first=uaCatalog.episodes[0];
  if(!selectedSeason)selectedSeason=Number(first.season)||1;
  if(!selectedEpisode)selectedEpisode=Number(first.number)||1;
  stream=window.UASerialsTortuga.choose(uaCatalog,selectedSeason,selectedEpisode,selectedVoice);
  selectedVoice=stream.voice;
  stream.seasons=uaSeasons();
 }
 function readQualities(item,token){
  var current=stream;
  if(!current||!current.url||current.embed||current.page)return Promise.resolve();
  return http(current.url,false).then(function(text){
   if(destroyed||token!==detailRequest||selected!==item||stream!==current)return;
   qualities=parseMaster(text,current.url);renderDetails();
  }).catch(function(){});
 }
 function playSelected(){openEpisodeQuality(false);}
 function openEpisodeQuality(serialMode){
  if(!selected)return;
  if(stream&&stream.blocked)return note(stream.blocked);
  if(detailLoading&&!serialMode)return note('Завантаження відео…');
  var item=selected,token=++detailRequest,sn=selectedSeason,en=selectedEpisode;
  var focusRow=episodeRowCursor,focusCol=episodeColCursor;
  detailLoading=true;detailError='';qualities=[];selectedQuality=null;renderDetails();
  function current(){return !destroyed&&token===detailRequest&&selected===item&&view==='detail';}
  function restore(){
   if(!current())return;
   if(episodeRows[focusRow]&&episodeRows[focusRow][focusCol]!==undefined)detailCursor=episodeRows[focusRow][focusCol];
   if(active()){Lampa.Controller.toggle('content');restoreFocus();}
  }
  var resolver=isUASerials(item)?window.UASerialsTortuga.resolve(item,sn,en,selectedVoice):item.external_source?Promise.resolve(stream):resolveStream(item,sn,en,selectedVoice);
  resolver.then(function(fresh){
   if(!current())return;
   if(!fresh||!fresh.url)throw Error('Відеопосилання серії не отримано');
   if(serialMode&&!isUASerials(item)&&fresh.data&&fresh.data.current&&fresh.data.current.episode&&Number(fresh.data.current.episode)!==en)throw Error('Джерело повернуло іншу серію');
   return http(fresh.url,false).then(function(text){return {stream:fresh,qualities:parseMaster(text,fresh.url)};}).catch(function(){return {stream:fresh,qualities:[]};});
  }).then(function(result){
   if(!result||!current())return;
   stream=result.stream;qualities=result.qualities;detailLoading=false;detailModalOpen=true;renderDetails();
   var options=[{title:'Auto (адаптивна)',value:-1,selected:true}].concat(qualities.map(function(q,i){return {title:q.name,value:i};}));
   Lampa.Select.show({
    title:(serialMode?'Сезон '+sn+' · Серія '+en:titleOf(item))+' · Якість',items:options,
    onBack:function(){detailModalOpen=false;setTimeout(restore,70);},
    onSelect:function(option){
     detailModalOpen=false;
     try{Lampa.Select.hide();}catch(e){}
     if(!current())return;
     var quality=option.value<0?null:result.qualities[option.value];
     if(option.value>=0&&!quality)return;
     selectedQuality=quality;
     playStream({title:titleOf(item)+(serialMode?' · Сезон '+sn+' · Серія '+en:'')},result.stream,quality);
    }
   });
  }).catch(function(error){
   if(!current())return;
   detailModalOpen=false;detailLoading=false;detailError=error.message;renderDetails();restore();note(detailError);
  });
 }
 function loadEpisode(){
  if(!selected)return;
  var item=selected,token=++detailRequest,focusRow=episodeRowCursor,focusCol=episodeColCursor;
  stream=null;qualities=[];selectedQuality=null;detailLoading=false;detailError='';
  if(isUASerials(item)){
   try{setUaStream();renderDetails();readQualities(item,token);}catch(e){detailError=e.message;renderDetails();}
   return;
  }
  renderDetails();
  resolveStream(item,selectedSeason,selectedEpisode,selectedVoice).then(function(result){
   if(destroyed||token!==detailRequest||selected!==item)return;
   if(result.data&&result.data.current&&selectedEpisode&&episodeNumber(result.data.current.episode)!==selectedEpisode){note('UAKino не підтвердив вибрану серію; перевір параметри API');}
   stream=result;renderDetails();
   if(episodeRows[focusRow]&&episodeRows[focusRow][focusCol]!==undefined)detailCursor=episodeRows[focusRow][focusCol];
   if(!result.url)return;
   return http(result.url,false).then(function(text){
    if(destroyed||token!==detailRequest||selected!==item)return;
    qualities=parseMaster(text,result.url);renderDetails();
   }).catch(function(){});
  }).catch(function(e){if(token===detailRequest)detail.find('.uas133-stream-status').text('Помилка: '+e.message);});
 }
 function renderDetails(){
  if(destroyed||view!=='detail'||!selected)return;
  detail.empty();
  detailControls=[];episodeRows=[];
  var head=$('<div class="uas133-detail-head"></div>');
  var image=$('<div class="uas133-detail-poster"></div>');
  var p=posterUrl(selected);
  if(p)image.css('background-image','url("'+p.replace(/"/g,'%22')+'")');
  var info=$('<div class="uas133-detail-info"></div>');
  info.append($('<div class="uas133-detail-title"></div>').text(titleOf(selected)));
  info.append($('<div class="uas133-meta"></div>').text(metadata(selected)));
  var ageLimit=ageLimitOf(selected);
  if(ageLimit)info.append($('<div class="uas133-age"></div>').text('Вікове обмеження: '+ageLimit));
  info.append($('<div class="uas133-description"></div>').text(selected.overview||selected.description||selected.plot||selected.short_story||'Опис відсутній'));
  head.append(image,info);
  head.addClass('selector uas133-detail-summary');
  head.on('hover:focus',function(){zone='detail';detailCursor=detailControls.indexOf(head[0]);});
  head.on('hover:enter',function(){focusDetail(0);});
  detail.append(head);
  detailControls.push(head[0]);
  var reactions=reactionsOf(selected);
  if(reactions)detail.append($('<div class="uas133-reactions"></div>').text('Реакції · 👍 '+reactions.likes+'   👎 '+reactions.dislikes));
  var actors=castOf(selected);
  if(actors.length){
   detail.append($('<div class="uas133-heading"></div>').text('Актори'));
   var row=$('<div class="uas133-cast"></div>');
   actors.slice(0,20).forEach(function(actor){
    var el=$('<div class="uas133-actor"></div>');
    var photo=$('<div class="uas133-actor-photo"></div>');
    if(actor.photo)photo.css('background-image','url("'+absolute(actor.photo).replace(/"/g,'%22')+'")');
    el.append(photo,$('<div></div>').text(actor.name),$('<small></small>').text(actor.character||''));
    row.append(el);
   });
   detail.append(row);
  }
  var seasons=isUASerials(selected)?uaSeasons():(stream&&stream.seasons&&stream.seasons.length?stream.seasons:seasonList(selected));
  if(selected.media_type==='movie'||(!selected.external_source&&category==='films'))seasons=[];
  var bySeason={};
  seasons.forEach(function(se){bySeason[se.number]=se;});
  if(seasons.length){
   if(!selectedSeason||!bySeason[selectedSeason]){
    selectedSeason=episodeNumber(stream&&stream.data&&stream.data.current&&stream.data.current.season)||seasons[0].number;
    if(!bySeason[selectedSeason])selectedSeason=seasons[0].number;
   }
   var chosenSeason=bySeason[selectedSeason],eps=chosenSeason.episodes;
   if(!selectedEpisode||!eps.some(function(e){return e.number===selectedEpisode;})){
    selectedEpisode=episodeNumber(stream&&stream.data&&stream.data.current&&stream.data.current.episode)||(eps[0]&&eps[0].number)||0;
    if(!eps.some(function(e){return e.number===selectedEpisode;}))selectedEpisode=(eps[0]&&eps[0].number)||0;
   }
   var fallbackImage=selected.backdrop_path||selected.background_image||selected.img||posterUrl(selected);
   seasons.forEach(function(se,rowIndex){
    detail.append($('<div class="uas133-heading"></div>').text('Сезон '+se.number));
    var track=$('<div class="uas133-episode-track"></div>');
    episodeRows[rowIndex]=[];
    se.episodes.forEach(function(ep,colIndex){
     var raw=ep.raw||{};
     var thumbnail=raw.still_path||raw.still||raw.thumbnail||raw.thumb||raw.image||raw.poster||raw.img||raw.backdrop||fallbackImage;
     var url=thumbnail?posterUrl({poster:thumbnail}):'';
     if(!url&&thumbnail)url=absolute(thumbnail);
     var card=$('<div class="uas133-episode selector"></div>');
     if(se.number===selectedSeason&&ep.number===selectedEpisode)card.addClass('uas133-episode-active');
     var pic=$('<div class="uas133-episode-image"></div>');
     if(url)pic.css('background-image','url("'+url.replace(/"/g,'%22')+'")');
     else pic.append($('<div class="uas133-episode-placeholder"></div>').text('▶'));
     card.append(pic,$('<div class="uas133-episode-name"></div>').text(raw.title||('Серія '+ep.number)));
     card.attr('data-episode-row',rowIndex).attr('data-episode-col',colIndex);
     card.on('hover:enter',function(){
      selectedSeason=se.number;selectedEpisode=ep.number;selectedVoice='';
      episodeRowCursor=rowIndex;episodeColCursor=colIndex;openEpisodeQuality(true);
     });
     card.on('hover:focus',function(){
      zone='detail';detailCursor=detailControls.indexOf(card[0]);
      episodeRowCursor=rowIndex;episodeColCursor=colIndex;revealEpisode(card[0]);
     });
     track.append(card);episodeRows[rowIndex].push(detailControls.length);
     detailControls.push(card[0]);
    });
    detail.append(track);
   });
  }
  if(isUASerials(selected)&&uaCatalog){
   var entry=uaCatalog.episodes.filter(function(e){return Number(e.season)===selectedSeason&&Number(e.number)===selectedEpisode;})[0];
   if(entry&&entry.voices.length>1)addDetailControl('Озвучення: '+selectedVoice,function(){
    selectOptions('Озвучення',entry.voices.map(function(v){return {title:v.name,value:v.name};}),function(voice){selectedVoice=voice;loadEpisode();});
   });
  }
  if(externalCandidates.length>1)addDetailControl('Джерело відео',function(){
   selectOptions('Джерело відео',externalCandidates.map(function(candidate,index){return {title:'Варіант '+(index+1),value:index};}),function(index){
    stream={url:externalCandidates[index].url,data:{},seasons:[]};qualities=[];selectedQuality=null;renderDetails();readQualities(selected,++detailRequest);
   });
  });
  if(!seasons.length){
  addDetailControl(detailLoading&&stream?'Оновлення відео…':'▶ Дивитися',playSelected);
  }
  addDetailControl('← До каталогу',closeDetails);
  detail.append($('<div class="uas133-stream-status"></div>').text(detailError?'Помилка: '+detailError:stream&&stream.blocked?stream.blocked:detailLoading?'Завантаження відео…':stream?'Доступних варіантів: '+qualities.length:'Завантаження потоку…'));
  try{scroll.minus(false);Lampa.Layer.update();}catch(e){}
  if(started&&active())setTimeout(function(){if(!detailModalOpen&&controllerName()==='content')restoreFocus();},70);
 }
 function openDetails(it){
  detailModalOpen=false;uaCatalog=null;detailLoading=false;detailError='';externalCandidates=[];
  selected=it;stream=null;qualities=[];selectedQuality=null;selectedSeason=0;selectedEpisode=0;selectedVoice='';episodeRowCursor=0;episodeColCursor=0;detailCursor=0;
  view='detail';zone='detail';filterBar.hide();statusBar.hide();body.hide();detail.show();
  try{scroll.reset();}catch(e){}
  renderDetails();
  try{
   scroll.minus(false);Lampa.Layer.update();
   if(detailControls[0]&&scroll.immediate)scroll.immediate($(detailControls[0]),false);
  }catch(e){}
  var token=++detailRequest;
  if(isUASerials(it)){
   detailLoading=true;renderDetails();
   window.UASerialsTortuga.catalog(it.url).then(function(data){
    if(destroyed||token!==detailRequest||view!=='detail'||selected!==it)return;
    uaCatalog=data;var metadata=data.metadata||{};['overview','year','rating','cast','age_rating'].forEach(function(key){if(metadata[key]&&(key!=='cast'||metadata[key].length))it[key]=metadata[key];});detailLoading=false;setUaStream();renderDetails();return readQualities(it,token);
   }).catch(function(error){
    if(destroyed||token!==detailRequest||view!=='detail'||selected!==it)return;
    detailLoading=false;detailError=error.message;renderDetails();
   });
   return;
  }
  if(it.external_source){
   detailLoading=true;renderDetails();
   externalStreams(it.url).then(function(data){
    if(destroyed||token!==detailRequest||view!=='detail'||selected!==it)return;
    detailLoading=false;
    if(!data.streams.length){detailError='Відео цього джерела поки недоступне';renderDetails();return;}
    externalCandidates=data.streams;stream={url:data.streams[0].url,data:{},seasons:[]};renderDetails();return readQualities(it,token);
   }).catch(function(error){
    if(destroyed||token!==detailRequest||view!=='detail'||selected!==it)return;
    detailLoading=false;detailError=error.message;renderDetails();
   });
   return;
  }
  resolveStream(it).then(function(s){
   if(destroyed||token!==detailRequest||view!=='detail')return;
   stream=s;renderDetails();
   if(!s.url)return;
   return http(s.url,false).then(function(text){
    if(destroyed||token!==detailRequest||view!=='detail')return;
    qualities=parseMaster(text,s.url);
    renderDetails();
   }).catch(function(){});
  }).catch(function(e){
   if(token===detailRequest&&view==='detail')detail.find('.uas133-stream-status').text('Помилка: '+e.message);
  });
 }
 function closeDetails(){
  detailModalOpen=false;detailRequest++;
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
  root=$('<div class="uas133-page"></div>');
  scroll=new Lampa.Scroll({mask:true,over:true,step:250});
  filterBar=$('<div class="uas133-filters"></div>');
  statusBar=$('<div class="uas133-status"></div>');
  body=$('<div class="uas133-body"></div>');
  detail=$('<div class="uas133-detail"></div>').hide();
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
 this.destroy=function(){clearTimeout(metadataDrawTimer);destroyed=true;started=false;requestId++;detailRequest++;try{scroll.destroy();}catch(e){}if(root)root.remove();};
}
function show(query,cat,title){
 Lampa.Activity.push({url:'',title:title||'UA Search',component:COMPONENT,query:query||'',cat:cat||'new',page:1});
}


var EXTERNAL_SOURCES={
 uaserials:{name:'UASerials · Фільми',url:'https://uaserials.com/films/'},
 uaserials_series:{name:'UASerials · Серіали',url:'https://uaserials.com/series/'},
 cikava:{name:'Цікава Ідея',url:'https://cikava-ideya.top/'},
 uafix:{name:'UAFLIX',url:'https://uafix.net/'}
};
var titleInfoCache={},titleInfoPending={},titleInfoQueue=[],titleInfoActive=0;
function mergeTitleInfo(item,info){
 if(info.year>0)item.year=info.year;
 if(info.rating>0&&info.rating<=10)item.rating=info.rating;
}
function cachedTitleInfo(item){
 var cached=titleInfoCache[item.url];
 if(cached&&Date.now()-cached.time<3600000){mergeTitleInfo(item,cached.info);return true;}
 return false;
}
function titleInfo(item){
 if(cachedTitleInfo(item))return Promise.resolve(titleInfoCache[item.url].info);
 if(titleInfoPending[item.url])return titleInfoPending[item.url];
 titleInfoPending[item.url]=new Promise(function(resolve,reject){titleInfoQueue.push({url:item.url,resolve:resolve,reject:reject});});
 pumpTitleInfo();return titleInfoPending[item.url];
}
function pumpTitleInfo(){
 while(titleInfoActive<3&&titleInfoQueue.length){
  (function(job){
   titleInfoActive++;
   window.UASerialsTortuga.info(job.url).then(function(info){
    titleInfoCache[job.url]={time:Date.now(),info:info};job.resolve(info);
   },job.reject).then(function(){titleInfoActive--;delete titleInfoPending[job.url];pumpTitleInfo();});
  })(titleInfoQueue.shift());
 }
}
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
      if(url.indexOf(new URL(src.url).origin+'/')!==0||seen[url]||/\/season-\d+-episode-\d+\//.test(url))continue;
      if(/\/(?:page|category|genre|year|search|login|register|contact|about|privacy|tag)(?:\/|$)/i.test(url))continue;
      var title=(a.getAttribute('title')||img.getAttribute('alt')||a.textContent||'').replace(/\s+/g,' ').trim();
      if(cat==='ext_uafix')title=title.replace(/^(?:смотреть|дивитися|смотреть онлайн)\s*[:\-–—]?\s*/i,'').trim();
      if(title.length<3||title.length>130)continue;
      var poster=img.getAttribute('data-src')||img.getAttribute('data-original')||img.getAttribute('data-lazy-src')||img.getAttribute('src')||'';
      if(!poster||poster.indexOf('data:')===0)continue;
      poster=absolute(poster,pageUrl);
      if(!/^https?:\/\//i.test(poster))continue;
      seen[url]=true;
      items.push({title:title,poster:poster,url:url,id:url,external_source:src.name,media_type:cat==='ext_uaserials'?'movie':cat==='ext_uaserials_series'?'tv':''});
      if(items.length>=80)break;
     }
     items.forEach(cachedTitleInfo);
     finish(null,items);
    }catch(e){finish(e);}
   },function(e){finish(Error('HTTP: '+String(e&&e.message||e&&e.status||'помилка')));},false,{dataType:'text'});
  }catch(e){finish(e);}
 });
}


function probePlayerMessages(pageUrl) {
 return new Promise(function(resolve) {
  var iframe, timer, done=false, urls=[];
  function finish(status) {
   if(done)return;
   done=true;clearTimeout(timer);
   window.removeEventListener('message',receive,false);
   if(iframe&&iframe.parentNode)iframe.parentNode.removeChild(iframe);
   resolve({status:status,urls:urls});
  }
  function receive(event) {
   if(event.origin!==origin)return;
   var data='';
   try{data=typeof event.data==='string'?event.data:JSON.stringify(event.data);}catch(e){}
   var matches=data.match(/https?:[^\\s"'<>]+/g)||[];
   matches.forEach(function(url) {
    if(/\\.(m3u8|mp4|mpd)(\\?|$)/i.test(url)&&urls.indexOf(url)<0&&urls.length<8)urls.push(url);
   });
  }
  var origin;
  try{origin=new URL(pageUrl,location.href).origin;}catch(e){return finish('Некоректна адреса');}
  window.addEventListener('message',receive,false);
  try{
   iframe=document.createElement('iframe');
   iframe.style.cssText='position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0';
   iframe.setAttribute('sandbox','allow-scripts allow-same-origin');
   iframe.onload=function(){
    try{iframe.contentWindow.postMessage({type:'tortuga:getInfo'},origin);}catch(e){}
   };
   document.body.appendChild(iframe);
   timer=setTimeout(function(){finish(urls.length?'URL отримано':'Відео URL не отримано: iframe, CSP або протокол');},6500);
   iframe.src=pageUrl;
  }catch(e){finish('iframe: '+e.message);}
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
        if(!/crypto-js|polyfills|jquery|waypoints|notification|qrcode/i.test(filename)){
         var checks=[['getInfo запит','tortuga:getInfo'],['формування запиту','_getValueToSend'],['встановлення URL','_setUrl'],['передача повідомлень','postMessage'],['отримання відповіді','addEventListener']];
         checks.forEach(function(entry){var pos=code.indexOf(entry[1]);if(pos>=0)jsFindings.push(filename+' · '+entry[0]+' @'+pos);});
         var at=code.indexOf('tortuga:getInfo');
         if(at>=0){
          var context=code.slice(Math.max(0,at-120),at+900);
          ['source','url','data','payload','result','response'].forEach(function(field){
           if(context.indexOf(field)>=0)jsFindings.push('getInfo: можливе поле '+field);
          });
         }
         var urls=code.match(/https?:[^"' <>]{8,250}/g)||[];
         urls.filter(function(u){return u.indexOf('.m3u8')>=0||u.indexOf('.mp4')>=0||u.indexOf('.mpd')>=0;}).slice(0,3).forEach(function(u){jsFindings.push('Відео URL у JS: '+u.slice(0,160));});
         if(!jsFindings.length&&/index\.js/i.test(filename))jsFindings.push(filename+': цільових викликів немає');
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
 openMenuGroup('UA Search 1.3.12',[
  {title:'UA Kino',value:'group_uakino'},
  {title:'UA Serials',value:'group_uaserials'},
  {title:'Цікава ідея',value:'ext_cikava'},
  {title:'UAFLIX',value:'ext_uafix'}
 ],false);
}
function openMenuGroup(title,choices,sub){
 Lampa.Select.show({title:title,items:choices,onBack:function(){setTimeout(sub?menu:focusMenu,80);},onSelect:function(item){
  try{Lampa.Select.hide();}catch(e){}
  var value=item.value;
  if(value==='group_uakino')return setTimeout(function(){openMenuGroup('UA Kino',[{title:'⌕ Пошук',value:'search'}].concat(CATS.map(function(c){return {title:c[1],value:c[0]};})),true);},100);
  if(value==='group_uaserials')return setTimeout(function(){openMenuGroup('UA Serials',[{title:'Фільми',value:'ext_uaserials'},{title:'Серіали',value:'ext_uaserials_series'}],true);},100);
  if(value==='search')return setTimeout(search,180);
  if(value.indexOf('ext_')===0){var source=EXTERNAL_SOURCES[value.slice(4)];if(source)show('',value,source.name);return;}
  var cat=CATS.filter(function(c){return c[0]===value;})[0];if(cat)show('',value,cat[1]);
 }});
}
function addMenu(){
 if($('.menu [data-uas133="menu"]').length)return;
 var list=$('.menu .menu__list').first();
 if(!list.length)return;
 var el=$('<li class="menu__item selector" data-uas133="menu"><div class="menu__ico">UA</div><div class="menu__text">UA Search</div></li>');
 el.on('hover:enter',menu);
 var anchor=$('.menu [data-action="settings"]').first();
 if(anchor.length)anchor.before(el);else list.prepend(el);
}
function addSearch(){
 var area=$('.activity--active').find('.search,.search-box,.search__body').first();
 if(!area.length||area.find('[data-uas133="search"]').length)return;
 var el=$('<div class="uas133-search selector" data-uas133="search">UA Search · українські фільми</div>');
 el.on('hover:enter click',search);
 area.prepend(el);
}
function init(){
 if(!window.Lampa||!Lampa.Component||!Lampa.Activity||!Lampa.Select||!Lampa.Input||!window.$)return setTimeout(init,500);
 Lampa.Component.add(COMPONENT,Page);
 var css='.uas133-page{height:100%}.uas133-filters{display:flex;flex-wrap:wrap;gap:.7em;padding:1.2em 3em .4em}.uas133-filter{padding:.65em 1em;border-radius:.5em;background:#303642;color:#fff}.uas133-filter.focus{background:#fff;color:#111}.uas133-status{padding:.4em 3em;font-size:.9em;opacity:.7}.uas133-body{padding:1em 3em 4em}.uas133-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.2em}.uas133-card{min-width:0;padding:.4em;border-radius:.6em}.uas133-card.focus{background:#fff;color:#111}.uas133-poster{aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.35em}.uas133-name{font-size:1.1em;font-weight:600;margin-top:.5em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.uas133-meta{font-size:.9em;opacity:.7;margin-top:.3em}.uas133-empty{padding:2em;opacity:.7}.uas133-search{padding:.7em 1em;margin:.5em;border-radius:.5em;background:#1f6feb;color:#fff}.uas133-detail{padding:1.5em 3em 5em}.uas133-detail-head{display:flex;gap:2em;margin-bottom:1.5em}.uas133-detail-poster{width:13em;min-width:13em;aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.5em}.uas133-detail-info{flex:1;min-width:0}.uas133-detail-title{font-size:2em;font-weight:700;margin-bottom:.4em}.uas133-age{display:inline-block;margin:.65em 0;padding:.35em .7em;border:1px solid rgba(255,255,255,.45);border-radius:.35em;font-weight:600}.uas133-description{font-size:1.05em;line-height:1.5;max-width:55em;margin-top:1em}.uas133-reactions{font-size:1.2em;margin:1em 0}.uas133-heading{font-size:1.4em;font-weight:700;margin:1em 0 .6em}.uas133-cast{display:flex;gap:1em;overflow-x:auto;margin-bottom:1.5em}.uas133-actor{width:8em;min-width:8em}.uas133-actor-photo{width:100%;aspect-ratio:2/3;background:#252a35 center/cover no-repeat;border-radius:.4em}.uas133-action{display:block;padding:.9em 1.2em;margin:.5em 0;background:#303642;border-radius:.5em;max-width:32em}.uas133-action.focus{background:#fff;color:#111}.uas133-stream-status{opacity:.7;font-size:.9em;margin-top:1em}.uas133-detail-summary{border-radius:.6em;padding:.6em;margin:-.6em -.6em 1.5em}.uas133-detail-summary.focus{outline:2px solid rgba(255,255,255,.8);background:rgba(255,255,255,.06)}.uas133-episode-track{display:flex;gap:1em;overflow-x:auto;padding:.4em .2em 1em;margin-bottom:1.3em}.uas133-episode{width:13em;min-width:13em;padding:.4em;border-radius:.6em;background:#252b36}.uas133-episode.focus{background:#fff;color:#111}.uas133-episode-active{outline:2px solid #24b8df}.uas133-episode-image{width:100%;aspect-ratio:16/9;background:#202733 center/cover no-repeat;border-radius:.35em;display:flex;align-items:center;justify-content:center}.uas133-episode-placeholder{font-size:2em;opacity:.5}.uas133-episode-name{font-size:1em;font-weight:600;margin-top:.6em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}body.true--mobile .uas133-grid{grid-template-columns:repeat(3,minmax(0,1fr))}';
 $('<style id="uas133-style"></style>').text(css).appendTo('head');
 var ready=false;
 function start(){if(ready)return;ready=true;addMenu();setInterval(function(){try{addMenu();addSearch();}catch(e){log(e.message);}},2000);note('UA Search 1.3.12 активовано');}
 if(window.appready)start();
 else Lampa.Listener.follow('app',function(e){if(e.type==='ready')start();});
}
init();
})();