
/*
 * Lampa UA Search 0.7
 * UAKino catalog + 7 filters + direct playback
 * Timeout: 20000 ms
 * Jackett: not required
 */
(function () {
  'use strict';

  var VERSION = '0.7';
  var API = 'https://uakino.ax';
  var TIMEOUT = 20000;
  var PAGE_SIZE = 30;
  var MAX_PAGES = 5;

  if (window.LampaUASearch07) return;
  window.LampaUASearch07 = true;

  var CATEGORIES = [
    ['new', 'Новинки'],
    ['films', 'Фільми'],
    ['series', 'Серіали'],
    ['multserialy', 'Мультсеріали'],
    ['cartoons', 'Мультфільми'],
    ['dorama', 'Дорами'],
    ['anime', 'Аніме'],
    ['4k', 'У 4K'],
    ['top', 'Найкраще']
  ];

  var GENRES = [
    ['', 'Усі жанри'],
    [28, 'Бойовик'],
    [12, 'Пригоди'],
    [16, 'Анімація'],
    [35, 'Комедія'],
    [80, 'Кримінал'],
    [99, 'Документальний'],
    [18, 'Драма'],
    [10751, 'Сімейний'],
    [14, 'Фентезі'],
    [36, 'Історичний'],
    [27, 'Жахи'],
    [10402, 'Музика'],
    [9648, 'Детектив'],
    [10749, 'Мелодрама'],
    [878, 'Фантастика'],
    [53, 'Трилер'],
    [10752, 'Військовий'],
    [37, 'Вестерн']
  ];

  var COUNTRIES = [
    ['', 'Усі країни'],
    ['UA', 'Україна'],
    ['US', 'США'],
    ['GB', 'Велика Британія'],
    ['FR', 'Франція'],
    ['DE', 'Німеччина'],
    ['PL', 'Польща'],
    ['JP', 'Японія'],
    ['KR', 'Південна Корея'],
    ['CA', 'Канада'],
    ['ES', 'Іспанія'],
    ['IT', 'Італія'],
    ['IN', 'Індія'],
    ['TR', 'Туреччина']
  ];

  var TYPES = [
    ['', 'Усі типи'],
    ['films', 'Фільми'],
    ['series', 'Серіали'],
    ['cartoons', 'Мультфільми'],
    ['multserialy', 'Мультсеріали'],
    ['anime', 'Аніме'],
    ['dorama', 'Дорами']
  ];

  var QUALITIES = [
    ['', 'Будь-яка'],
    ['2160', '4K / 2160p'],
    ['1080', 'Full HD / 1080p'],
    ['720', 'HD / 720p']
  ];

  var SORTS = [
    ['default', 'За порядком UAKino'],
    ['rating_desc', 'Рейтинг: високий спочатку'],
    ['rating_asc', 'Рейтинг: низький спочатку'],
    ['year_desc', 'Спочатку нові'],
    ['year_asc', 'Спочатку старі'],
    ['title_asc', 'Назва: А–Я'],
    ['title_desc', 'Назва: Я–А']
  ];

  var defaults = {
    genre: '',
    yearFrom: 0,
    yearTo: 0,
    type: '',
    quality: '',
    sort: 'default',
    country: '',
    rating: 0,
    category: 'new',
    pages: 3
  };

  var filters = {};
  var catalogCache = {};
  var currentMovie = null;
  var catalogRequest = 0;

  function copy(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function log() {
    var a = ['[UA Search ' + VERSION + ']'];
    for (var i = 0; i < arguments.length; i++) {
      a.push(arguments[i]);
    }
    try {
      console.log.apply(console, a);
    } catch (e) {}
  }

  function notify(s) {
    try {
      Lampa.Noty.show('UA Search: ' + s);
    } catch (e) {
      log(s);
    }
  }

  function storageGet(k, def) {
    try {
      return Lampa.Storage.get(k, def);
    } catch (e) {
      return def;
    }
  }

  function storageSet(k, v) {
    try {
      Lampa.Storage.set(k, v);
    } catch (e) {}
  }

  function saveFilters() {
    storageSet('ua_search_filters_07', copy(filters));
  }

  function loadFilters() {
    var stored = storageGet('ua_search_filters_07', {});
    if (!stored || typeof stored !== 'object') stored = {};

    filters = copy(defaults);

    Object.keys(defaults).forEach(function (k) {
      if (stored[k] !== undefined) filters[k] = stored[k];
    });
  }

  loadFilters();

  function query(obj) {
    return Object.keys(obj).filter(function (k) {
      return obj[k] !== undefined &&
        obj[k] !== null &&
        obj[k] !== '';
    }).map(function (k) {
      return encodeURIComponent(k) + '=' +
        encodeURIComponent(obj[k]);
    }).join('&');
  }

  function request(url, asText) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var done = false;
      var watchdog;

      function finish(error, data) {
        if (done) return;
        done = true;
        clearTimeout(watchdog);

        if (error) reject(error);
        else resolve(data);
      }

      try {
        xhr.open('GET', url, true);
        xhr.timeout = TIMEOUT;

        watchdog = setTimeout(function () {
          try { xhr.abort(); } catch (e) {}
          finish(new Error('Таймаут 20 секунд'));
        }, TIMEOUT);

        xhr.onload = function () {
          if (xhr.status < 200 || xhr.status >= 300) {
            finish(new Error('HTTP ' + xhr.status));
            return;
          }

          if (asText) {
            finish(null, xhr.responseText);
            return;
          }

          try {
            finish(null, JSON.parse(xhr.responseText));
          } catch (e) {
            finish(new Error('Некоректна JSON-відповідь'));
          }
        };

        xhr.onerror = function () {
          finish(new Error('Помилка мережі / CORS'));
        };

        xhr.ontimeout = function () {
          finish(new Error('Таймаут 20 секунд'));
        };

        xhr.send();
      } catch (e) {
        finish(e);
      }
    });
  }

  function getJSON(path) {
    return request(API + path);
  }

  function loading(on) {
    try {
      if (on) {
        Lampa.Loading.start(function () {
          Lampa.Loading.stop();
        });
      } else {
        Lampa.Loading.stop();
      }
    } catch (e) {}
  }

  function back() {
    try {
      Lampa.Controller.toggle('full_start');
    } catch (e) {}
  }

  function select(title, items, callback, onBack) {
    Lampa.Select.show({
      title: title,
      items: items,
      onSelect: callback,
      onBack: onBack || back
    });
  }

  function labelOf(arr, value) {
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i][0]) === String(value)) {
        return arr[i][1];
      }
    }
    return String(value);
  }

  function choose(title, options, value, callback, returnTo) {
    select(title, options.map(function (o) {
      return {
        title: o[1],
        value: o[0],
        selected: String(o[0]) === String(value)
      };
    }), function (item) {
      callback(item.value);
      saveFilters();
      showFilters();
    }, returnTo || showFilters);
  }

  function yearOptions() {
    var out = [[0, 'Без обмеження']];
    var maxYear = new Date().getFullYear() + 1;

    for (var y = maxYear; y >= 1950; y--) {
      out.push([y, String(y)]);
    }
    return out;
  }

  function showFilters() {
    var f = filters;

    var items = [
      {
        title: 'Жанр',
        subtitle: labelOf(GENRES, f.genre),
        key: 'genre'
      },
      {
        title: 'Рік від',
        subtitle: f.yearFrom || 'Будь-який',
        key: 'yearFrom'
      },
      {
        title: 'Рік до',
        subtitle: f.yearTo || 'Будь-який',
        key: 'yearTo'
      },
      {
        title: 'Тип контенту',
        subtitle: labelOf(TYPES, f.type),
        key: 'type'
      },
      {
        title: 'Якість відео',
        subtitle: labelOf(QUALITIES, f.quality),
        key: 'quality'
      },
      {
        title: 'Сортування',
        subtitle: labelOf(SORTS, f.sort),
        key: 'sort'
      },
      {
        title: 'Країна виробництва',
        subtitle: labelOf(COUNTRIES, f.country),
        key: 'country'
      },
      {
        title: 'Мінімальний рейтинг TMDB',
        subtitle: f.rating ? f.rating + '+' : 'Будь-який',
        key: 'rating'
      },
      {
        title: 'Категорія UAKino',
        subtitle: labelOf(CATEGORIES, f.category),
        key: 'category'
      },
      {
        title: 'Сторінок для перевірки',
        subtitle: String(f.pages) + ' × 30',
        key: 'pages'
      },
      {
        title: 'Застосувати фільтри',
        subtitle: 'Показати каталог',
        action: 'apply'
      },
      {
        title: 'Скинути всі фільтри',
        action: 'reset'
      }
    ];

    select('UA Search 0.7 · Фільтри', items, function (it) {
      if (it.action === 'apply') {
        return showCatalog();
      }

      if (it.action === 'reset') {
        filters = copy(defaults);
        saveFilters();
        notify('Фільтри скинуто');
        return showFilters();
      }

      var key = it.key;
      var opts;

      if (key === 'genre') opts = GENRES;
      else if (key === 'type') opts = TYPES;
      else if (key === 'quality') opts = QUALITIES;
      else if (key === 'sort') opts = SORTS;
      else if (key === 'country') opts = COUNTRIES;
      else if (key === 'category') opts = CATEGORIES;
      else if (key === 'yearFrom' || key === 'yearTo') {
        opts = yearOptions();
      } else if (key === 'rating') {
        opts = [
          [0, 'Будь-який'],
          [5, '5+'],
          [6, '6+'],
          [7, '7+'],
          [7.5, '7.5+'],
          [8, '8+'],
          [8.5, '8.5+'],
          [9, '9+']
        ];
      } else if (key === 'pages') {
        opts = [
          [1, '30 фільмів'],
          [2, '60 фільмів'],
          [3, '90 фільмів'],
          [5, '150 фільмів']
        ];
      }

      if (!opts) return;

      choose(it.title, opts, f[key], function (v) {
        filters[key] = v;
      });
    }, function () {
      showMainMenu();
    });
  }

  function normalize(item) {
    var x = copy(item);

    x.title = x.title || x.name || '';
    x.year = parseInt(
      x.year || x.release_date || x.first_air_date,
      10
    ) || 0;

    var r = x.rating;
    if (r === undefined || r === null) {
      r = x.vote_average;
    }

    x._rating = (r === undefined || r === null || r === '')
      ? null : Number(r);

    if (!isFinite(x._rating)) x._rating = null;

    x._genres = x.genre_ids || x.genres || [];
    x._countries = x.production_countries ||
      x.origin_country || x.countries || [];

    x._quality = x.quality || x.video_quality || '';

    return x;
  }

  function genreMatch(item, genre) {
    if (!genre) return true;

    var list = item._genres;

    if (!Array.isArray(list) || !list.length) return false;

    return list.some(function (g) {
      var id = typeof g === 'object' ? g.id : g;
      var name = typeof g === 'object' ? g.name : g;
      return String(id) === String(genre) ||
        String(name).toLowerCase() ===
        labelOf(GENRES, genre).toLowerCase();
    });
  }

  function countryMatch(item, country) {
    if (!country) return true;

    var list = item._countries;
    if (!Array.isArray(list) || !list.length) return false;

    return list.some(function (c) {
      var code = typeof c === 'object'
        ? (c.iso_3166_1 || c.code || c.name)
        : c;

      return String(code).toUpperCase() === country ||
        String(code).toLowerCase() ===
        labelOf(COUNTRIES, country).toLowerCase();
    });
  }

  function qualityMatch(item, quality) {
    if (!quality) return true;

    var q = String(item._quality).toLowerCase();

    if (!q) return false;

    if (quality === '2160') {
      return /2160|4k|uhd/.test(q);
    }
    if (quality === '1080') {
      return /1080|fhd|full.?hd/.test(q);
    }
    if (quality === '720') {
      return /720|(^|[^a-z])hd([^a-z]|$)/.test(q);
    }

    return false;
  }

  function typeMatch(item, type, category) {
    if (!type) return true;

    if (category === type) return true;

    var raw = String(
      item.type || item.category || item.content_type || ''
    ).toLowerCase();

    var aliases = {
      films: ['film', 'films', 'movie'],
      series: ['series', 'serial', 'tv'],
      cartoons: ['cartoon', 'cartoons', 'animation'],
      multserialy: ['multserialy', 'animated_series'],
      anime: ['anime'],
      dorama: ['dorama']
    };

    if (aliases[type] && aliases[type].indexOf(raw) >= 0) {
      return true;
    }

    if (type === 'series' && item.is_series === true) {
      return true;
    }

    if (type === 'films' && item.is_series === false) {
      return true;
    }

    return false;
  }

  function applyFilters(items, category) {
    var f = filters;

    var out = items.map(normalize).filter(function (x) {
      if (f.yearFrom && (!x.year || x.year < f.yearFrom)) {
        return false;
      }

      if (f.yearTo && (!x.year || x.year > f.yearTo)) {
        return false;
      }

      if (!typeMatch(x, f.type, category)) return false;
      if (!genreMatch(x, f.genre)) return false;
      if (!countryMatch(x, f.country)) return false;
      if (!qualityMatch(x, f.quality)) return false;

      if (f.rating &&
          (x._rating === null || x._rating < f.rating)) {
        return false;
      }

      return true;
    });

    var sort = f.sort;

    if (sort !== 'default') {
      out.sort(function (a, b) {
        if (sort === 'rating_desc') {
          return (b._rating === null ? -1 : b._rating) -
                 (a._rating === null ? -1 : a._rating);
        }
        if (sort === 'rating_asc') {
          return (a._rating === null ? 99 : a._rating) -
                 (b._rating === null ? 99 : b._rating);
        }
        if (sort === 'year_desc') return b.year - a.year;
        if (sort === 'year_asc') return a.year - b.year;
        if (sort === 'title_asc') {
          return a.title.localeCompare(b.title, 'uk');
        }
        if (sort === 'title_desc') {
          return b.title.localeCompare(a.title, 'uk');
        }
        return 0;
      });
    }

    return out;
  }

  function list(cat, page) {
    var key = cat + ':' + page;
    var cached = catalogCache[key];

    if (cached && Date.now() - cached.time < 120000) {
      return Promise.resolve(cached.data);
    }

    return getJSON('/hls/api/lampa/list?' + query({
      cat: cat,
      page: page,
      limit: PAGE_SIZE
    })).then(function (data) {
      if (!data || !Array.isArray(data.results)) {
        throw new Error('Невідомий формат каталогу');
      }

      catalogCache[key] = {
        time: Date.now(),
        data: data
      };

      return data;
    });
  }

  function loadCatalog(cat, pages) {
    var all = [];
    var totalPages = pages;

    function next(page) {
      if (page > totalPages) {
        return Promise.resolve(all);
      }

      return list(cat, page).then(function (data) {
        all = all.concat(data.results);

        if (data.total_pages) {
          totalPages = Math.min(
            totalPages,
            Number(data.total_pages) || totalPages
          );
        }

        return next(page + 1);
      });
    }

    return next(1);
  }

  function deduplicate(items) {
    var seen = {};

    return items.filter(function (x) {
      var key = String(
        x.uakino_id || x.id ||
        (x.title + ':' + x.year)
      );

      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function showCatalog() {
    var req = ++catalogRequest;
    var category = filters.type || filters.category;
    var pages = Math.max(
      1,
      Math.min(MAX_PAGES, Number(filters.pages) || 3)
    );

    loading(true);

    loadCatalog(category, pages).then(function (items) {
      if (req !== catalogRequest) return;

      loading(false);

      var unique = deduplicate(items);
      var results = applyFilters(unique, category);

      log('Catalog:', {
        category: category,
        loaded: unique.length,
        matched: results.length
      });

      showCatalogResults(results, unique.length, category);
    }).catch(function (e) {
      if (req !== catalogRequest) return;
      loading(false);
      notify('Каталог: ' + e.message);
    });
  }

  function showCatalogResults(results, total, category) {
    var items = [
      {
        title: '⚙ Змінити фільтри',
        subtitle: 'Знайдено ' + results.length +
          ' із ' + total + ' завантажених',
        action: 'filters'
      }
    ];

    results.forEach(function (x) {
      var meta = [];

      if (x.year) meta.push(String(x.year));
      if (x._rating !== null) {
        meta.push('★ ' + x._rating.toFixed(1));
      }
      if (x._quality) meta.push(String(x._quality));

      items.push({
        title: x.title,
        subtitle: meta.join(' · '),
        movie: x
      });
    });

    if (!results.length) {
      items.push({
        title: 'Нічого не знайдено',
        subtitle: 'Спробуй змінити фільтри',
        action: 'filters'
      });
    }

    select(
      'UAKino · ' + results.length + ' результатів',
      items,
      function (it) {
        if (it.action === 'filters') {
          return showFilters();
        }

        if (it.movie) {
          openCatalogMovie(it.movie);
        }
      },
      showFilters
    );
  }

  function openCatalogMovie(x) {
    var movie = {
      id: x.id,
      title: x.title,
      name: x.is_series ? x.title : undefined,
      original_title: x.original || x.original_title,
      original_name: x.original || x.original_name,
      release_date: x.year ? String(x.year) + '-01-01' : '',
      first_air_date: x.is_series && x.year
        ? String(x.year) + '-01-01'
        : '',
      uakino_id: x.uakino_id
    };

    currentMovie = movie;
    searchMovie(movie);
  }

  function findMovie(movie) {
    var isTV = !!(
      movie.name ||
      movie.first_air_date ||
      movie.number_of_seasons
    );

    var title = movie.title || movie.name || '';
    var original = movie.original_title ||
      movie.original_name || '';

    var date = movie.release_date ||
      movie.first_air_date || '';

    return getJSON('/hls/api/lampa/find?' + query({
      tmdb: movie.id,
      imdb: movie.imdb_id,
      type: isTV ? 'tv' : 'movie',
      year: date.slice(0, 4),
      title: title,
      orig: original
    })).then(function (data) {
      return {
        found: !!(data && data.found && data.movie_id),
        title: data.title || title,
        movie_id: data.movie_id,
        data: data
      };
    });
  }

  function playInfo(movieId, opts) {
    opts = opts || {};

    return getJSON('/hls/api/play?' + query({
      movie: movieId,
      s: sessionId(),
      hevc: hevc(),
      voice: opts.voice,
      season: opts.season,
      episode: opts.episode,
      q: opts.q
    }));
  }

  function sessionId() {
    var s = storageGet('ua_search_sid_07', '');

    if (!s) {
      s = 'ua' + Math.random().toString(36).slice(2) +
        Date.now().toString(36);
      storageSet('ua_search_sid_07', s);
    }

    return s;
  }

  function hevc() {
    try {
      if (Lampa.Platform.is('android')) return 1;

      var codec = 'video/mp4; codecs="hvc1.1.6.L153.90"';

      if (window.MediaSource &&
          MediaSource.isTypeSupported &&
          MediaSource.isTypeSupported(codec)) return 1;

      if (document.createElement('video').canPlayType(codec)) {
        return 1;
      }
    } catch (e) {}

    return 0;
  }

  function absolute(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) {
      return 'https:' + url;
    }
    return API + (url.charAt(0) === '/' ? '' : '/') + url;
  }

  function manifestOf(p) {
    return absolute(p.manifest || p.manifest_abs || '');
  }

  function m3u8(url) {
    if (!url) return '';

    return /\.m3u8($|\?)/i.test(url)
      ? url : url + '.m3u8';
  }

  function variants(master) {
    if (!master) return Promise.resolve([]);

    return request(master, true).then(function (text) {
      var lines = text.split(/\r?\n/);
      var out = [];
      var seen = {};

      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) {
          continue;
        }

        var m = /RESOLUTION=(\d+)x(\d+)/.exec(lines[i]);
        var u = (lines[i + 1] || '').trim();

        if (!m || !u || u.charAt(0) === '#') continue;

        var h = Number(m[2]);
        var tier = h >= 1500 ? 2160 :
          h >= 1000 ? 1080 :
          h >= 680 ? 720 : 480;

        if (seen[tier]) continue;
        seen[tier] = true;

        var resolved;

        try {
          resolved = new URL(u, master).href;
        } catch (e) {
          resolved = absolute(u);
        }

        out.push({
          tier: tier,
          url: resolved
        });
      }

      return out;
    }).catch(function () {
      return [];
    });
  }

  function launchPlayer(p, title, selected, vars, meta) {
    var master = m3u8(manifestOf(p));

    if (!master) {
      notify('Сервер не повернув адресу відео');
      return;
    }

    var url = master;
    var qualityMap = { 'Авто': master };

    vars.forEach(function (v) {
      qualityMap[String(v.tier) + 'p'] = v.url;
      if (Number(selected) === v.tier) url = v.url;
    });

    var item = {
      title: title,
      url: url,
      hls_type: 'hlsjs',
      uakino: meta
    };

    if (vars.length > 1) {
      item.quality = qualityMap;
    }

    if (p.subs && p.subs.length) {
      item.subtitles = p.subs.map(function (s) {
        return {
          label: s.label,
          url: absolute(s.url)
        };
      });
    }

    try {
      Lampa.Player.play(item);
      Lampa.Player.playlist([item]);
    } catch (e) {
      notify('Плеєр: ' + e.message);
    }
  }

  function showQuality(ctx) {
    var items = [{
      title: 'Авто',
      subtitle: 'Автоматична якість',
      tier: 0
    }];

    ctx.vars.forEach(function (v) {
      items.push({
        title: v.tier + 'p',
        subtitle: 'Відтворити у вибраній якості',
        tier: v.tier
      });
    });

    if (ctx.p.alt4k && hevc()) {
      items.push({
        title: '4K · окремий потік',
        tier: 2160,
        special4k: true
      });
    }

    if (ctx.p.voices && ctx.p.voices.length > 1) {
      items.push({
        title: 'Змінити озвучку',
        subtitle: ctx.voice || 'Українська',
        action: 'voices'
      });
    }

    items.push({
      title: 'Відкрити через офіційний UAKino',
      action: 'official'
    });

    select('Якість і озвучка', items, function (it) {
      if (it.action === 'official') {
        return openOfficial();
      }

      if (it.action === 'voices') {
        return showVoices(ctx);
      }

      if (it.special4k) {
        loading(true);
        return playInfo(ctx.id, {
          voice: ctx.voice,
          q: '2160'
        }).then(function (p) {
          loading(false);
          launchPlayer(p, ctx.title + ' · 4K', 0, [], {
            movie: ctx.id,
            voice: ctx.voice
          });
        }).catch(function (e) {
          loading(false);
          notify(e.message);
        });
      }

      launchPlayer(ctx.p, ctx.title, it.tier, ctx.vars, {
        movie: ctx.id,
        voice: ctx.voice
      });
    });
  }

  function showVoices(ctx) {
    select('Озвучка', ctx.p.voices.map(function (v) {
      return {
        title: v,
        voice: v,
        selected: v === ctx.voice
      };
    }), function (it) {
      loading(true);

      playInfo(ctx.id, {
        voice: it.voice
      }).then(function (p) {
        return variants(m3u8(manifestOf(p))).then(function (v) {
          loading(false);
          ctx.p = p;
          ctx.vars = v;
          ctx.voice = it.voice;
          showQuality(ctx);
        });
      }).catch(function (e) {
        loading(false);
        notify(e.message);
      });
    }, function () {
      showQuality(ctx);
    });
  }

  function showEpisodes(ctx) {
    var episodes = ctx.p.episodes || [];

    if (!episodes.length) {
      notify('Список серій недоступний');
      return;
    }

    var items = episodes.map(function (e) {
      return {
        title: 'Сезон ' + e.season +
          ' · Серія ' + e.episode,
        subtitle: e.voice || '',
        episode: e
      };
    });

    select('Серії · ' + ctx.title, items, function (it) {
      var e = it.episode;
      loading(true);

      playInfo(ctx.id, {
        voice: e.voice,
        season: e.season,
        episode: e.episode
      }).then(function (p) {
        loading(false);
        launchPlayer(
          p,
          ctx.title + ' · S' + e.season + 'E' + e.episode,
          0,
          [],
          {
            movie: ctx.id,
            voice: e.voice,
            season: e.season,
            episode: e.episode
          }
        );
      }).catch(function (err) {
        loading(false);
        notify(err.message);
      });
    });
  }

  function openOfficial() {
    var button = document.querySelector(
      '.view--uakino:not(.view--ua-search)'
    );

    if (button) {
      try {
        $(button).trigger('hover:enter');
        return;
      } catch (e) {}
    }

    notify('Офіційна кнопка UAKino недоступна');
  }

  function openFound(movie, result) {
    loading(true);

    playInfo(result.movie_id, {}).then(function (p) {
      loading(false);

      var title = movie.title || movie.name ||
        result.title || 'UAKino';

      var ctx = {
        id: result.movie_id,
        title: title,
        p: p,
        voice: (p.current && p.current.voice) ||
          (p.voices && p.voices[0]) || null,
        vars: []
      };

      var isTV = !!(
        movie.name ||
        movie.first_air_date ||
        movie.number_of_seasons
      );

      if (isTV && p.episodes && p.episodes.length) {
        return showEpisodes(ctx);
      }

      return variants(m3u8(manifestOf(p))).then(function (v) {
        ctx.vars = v;
        showQuality(ctx);
      });
    }).catch(function (e) {
      loading(false);
      notify('Відтворення: ' + e.message);
    });
  }

  function searchMovie(movie) {
    currentMovie = movie;
    loading(true);

    findMovie(movie).then(function (result) {
      loading(false);

      var items = [{
        title: 'UAKino',
        subtitle: result.found
          ? 'Знайдено: ' + result.title
          : 'Фільм не знайдено',
        result: result
      }, {
        title: 'Toloka',
        subtitle: 'Пошук поки недоступний без авторизації',
        action: 'toloka'
      }, {
        title: '⚙ Каталог і фільтри',
        action: 'filters'
      }];

      select('UA Search 0.7', items, function (it) {
        if (it.action === 'filters') {
          return showFilters();
        }

        if (it.action === 'toloka') {
          notify('Toloka: потрібен авторизований доступ');
          return;
        }

        if (it.result && it.result.found) {
          openFound(movie, it.result);
        } else {
          notify('Фільм не знайдено на UAKino');
        }
      });
    }).catch(function (e) {
      loading(false);
      notify('UAKino: ' + e.message);
    });
  }

  function showMainMenu() {
    select('UA Search 0.7', [
      {
        title: 'Каталог UAKino',
        subtitle: 'Переглянути фільми',
        action: 'catalog'
      },
      {
        title: 'Фільтри',
        subtitle: '7 параметрів фільтрації',
        action: 'filters'
      },
      {
        title: 'Тест UAKino API',
        action: 'test'
      },
      {
        title: 'Очистити кеш',
        action: 'clear'
      }
    ], function (it) {
      if (it.action === 'catalog') showCatalog();
      if (it.action === 'filters') showFilters();
      if (it.action === 'test') testAPI();

      if (it.action === 'clear') {
        catalogCache = {};
        notify('Кеш очищено');
      }
    });
  }

  function testAPI() {
    loading(true);

    list('new', 1).then(function (d) {
      loading(false);
      notify('API працює · ' + d.results.length +
        ' записів на сторінці');
    }).catch(function (e) {
      loading(false);
      notify('API: ' + e.message);
    });
  }

  function addButton(e) {
    if (!e || !e.object || !e.data || !e.data.movie) {
      return;
    }

    var render = e.object.activity.render();

    if (render.find('.view--ua-search').length) {
      return;
    }

    var btn = $(
      '<div class="full-start__button selector view--ua-search">' +
      '<span>UA Search 0.7</span>' +
      '</div>'
    );

    btn.on('hover:enter', function () {
      searchMovie(e.data.movie);
    });

    var anchor = render.find('.view--torrent');

    if (anchor.length) {
      anchor.after(btn);
    } else {
      render.find(
        '.full-start-new__buttons, .full-start__buttons'
      ).first().append(btn);
    }
  }

  function registerSettings() {
    try {
      if (!Lampa.SettingsApi ||
          !Lampa.SettingsApi.addParam) return;

      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
          name: 'ua_search_filters_07_open',
          type: 'trigger',
          default: false
        },
        field: {
          name: 'UA Search 0.7 · Фільтри',
          description: 'Жанр, рік, тип, якість, країна, рейтинг'
        },
        onChange: showFilters
      });

      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
          name: 'ua_search_catalog_07_open',
          type: 'trigger',
          default: false
        },
        field: {
          name: 'UA Search 0.7 · Каталог',
          description: 'Відкрити каталог UAKino'
        },
        onChange: showCatalog
      });

      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
          name: 'ua_search_test_07_open',
          type: 'trigger',
          default: false
        },
        field: {
          name: 'UA Search 0.7 · Тест API',
          description: 'Перевірка з’єднання з UAKino'
        },
        onChange: testAPI
      });
    } catch (e) {
      log('Settings:', e.message);
    }
  }

  function init() {
    if (!window.Lampa ||
        !Lampa.Listener ||
        !Lampa.Select ||
        !Lampa.Storage) {
      setTimeout(init, 500);
      return;
    }

    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') {
        try {
          addButton(e);
        } catch (err) {
          log('Button:', err);
        }
      }
    });

    registerSettings();

    window.LampaUASearch = {
      version: VERSION,
      filters: filters,
      openFilters: showFilters,
      catalog: showCatalog,
      search: searchMovie,
      test: testAPI,
      reset: function () {
        filters = copy(defaults);
        saveFilters();
      }
    };

    log('Initialized');
    notify('Версія 0.7 завантажена');
  }

  init();
})();
