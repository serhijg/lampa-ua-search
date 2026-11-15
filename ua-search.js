
(function () {
  'use strict';

  var VERSION = '0.8.0';
  var BASE = 'https://uakino.ax';
  var STORE = 'ua_search_filters_080';
  var TIMEOUT = 20000;

  var attempts = 0;
  var initialized = false;
  var busy = false;

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
    pages: 2
  };

  var state = {};

  var options = {
    genre: [
      ['', 'Усі'],
      [28, 'Бойовик'],
      [12, 'Пригоди'],
      [16, 'Анімація'],
      [35, 'Комедія'],
      [80, 'Кримінал'],
      [99, 'Документальний'],
      [18, 'Драма'],
      [10751, 'Сімейний'],
      [14, 'Фентезі'],
      [27, 'Жахи'],
      [9648, 'Детектив'],
      [10749, 'Мелодрама'],
      [878, 'Фантастика'],
      [53, 'Трилер']
    ],

    type: [
      ['', 'Усі'],
      ['films', 'Фільми'],
      ['series', 'Серіали'],
      ['cartoons', 'Мультфільми'],
      ['multserialy', 'Мультсеріали'],
      ['anime', 'Аніме'],
      ['dorama', 'Дорами']
    ],

    quality: [
      ['', 'Будь-яка'],
      ['2160', '4K'],
      ['1080', '1080p'],
      ['720', '720p']
    ],

    sort: [
      ['default', 'Порядок UAKino'],
      ['rating_desc', 'Рейтинг ↓'],
      ['rating_asc', 'Рейтинг ↑'],
      ['year_desc', 'Нові спочатку'],
      ['year_asc', 'Старі спочатку'],
      ['title_asc', 'Назва А–Я']
    ],

    country: [
      ['', 'Усі'],
      ['UA', 'Україна'],
      ['US', 'США'],
      ['GB', 'Велика Британія'],
      ['FR', 'Франція'],
      ['DE', 'Німеччина'],
      ['PL', 'Польща'],
      ['JP', 'Японія'],
      ['KR', 'Південна Корея'],
      ['CA', 'Канада']
    ],

    rating: [
      [0, 'Будь-який'],
      [5, '5+'],
      [6, '6+'],
      [7, '7+'],
      [7.5, '7.5+'],
      [8, '8+'],
      [8.5, '8.5+'],
      [9, '9+']
    ],

    category: [
      ['new', 'Новинки'],
      ['films', 'Фільми'],
      ['series', 'Серіали'],
      ['cartoons', 'Мультфільми'],
      ['multserialy', 'Мультсеріали'],
      ['anime', 'Аніме'],
      ['dorama', 'Дорами'],
      ['4k', '4K'],
      ['top', 'Найкраще']
    ],

    pages: [
      [1, '30'],
      [2, '60'],
      [3, '90'],
      [5, '150']
    ]
  };

  function log(stage, e) {
    try {
      console.error(
        '[UA Search ' + VERSION + '] ' + stage,
        e || ''
      );

      window.__UA_SEARCH_STAGE__ =
        stage + (e ? ': ' + (e.message || e) : '');
    } catch (_) {}
  }

  function note(s) {
    try {
      Lampa.Noty.show('UA Search: ' + s);
    } catch (e) {
      log('notice', e);
    }
  }

  function safe(stage, fn) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        log(stage, e);
        note(stage + ': ' + (e.message || e));
      }
    };
  }

  function restore() {
    state = Object.assign({}, defaults);

    try {
      var v = Lampa.Storage.get(STORE, {});

      if (v && typeof v === 'object') {
        Object.keys(defaults).forEach(function (k) {
          if (v[k] !== undefined) state[k] = v[k];
        });
      }
    } catch (e) {
      log('storage', e);
    }
  }

  function save() {
    try {
      Lampa.Storage.set(STORE, state);
    } catch (e) {
      log('save', e);
    }
  }

  function years() {
    var a = [[0, 'Будь-який']];

    for (
      var y = new Date().getFullYear() + 1;
      y >= 1950;
      y--
    ) {
      a.push([y, String(y)]);
    }

    return a;
  }

  function label(a, v) {
    for (var i = 0; i < a.length; i++) {
      if (String(a[i][0]) === String(v)) {
        return a[i][1];
      }
    }

    return String(v);
  }

  function menu(title, items, cb) {
    Lampa.Select.show({
      title: title,
      items: items,
      onSelect: safe('menu-select', cb),
      onBack: function () {}
    });
  }

  function choose(key, title) {
    var a = (
      key === 'yearFrom' ||
      key === 'yearTo'
    ) ? years() : options[key];

    menu(
      title,
      a.map(function (p) {
        return {
          title: p[1],
          value: p[0]
        };
      }),
      function (x) {
        state[key] = x.value;
        save();

        setTimeout(
          safe('filters-return', filters),
          150
        );
      }
    );
  }

  function filters() {
    var fields = [
      ['genre', 'Жанр'],
      ['yearFrom', 'Рік від'],
      ['yearTo', 'Рік до'],
      ['type', 'Тип'],
      ['quality', 'Якість'],
      ['sort', 'Сортування'],
      ['country', 'Країна'],
      ['rating', 'Рейтинг від'],
      ['category', 'Категорія'],
      ['pages', 'Сторінок']
    ];

    var items = fields.map(function (f) {
      return {
        title: f[1] + ' · ' + label(
          (
            f[0] === 'yearFrom' ||
            f[0] === 'yearTo'
          ) ? years() : options[f[0]],
          state[f[0]]
        ),
        key: f[0],
        fieldTitle: f[1]
      };
    });

    items.push(
      {
        title: 'Застосувати — показати каталог',
        action: 'catalog'
      },
      {
        title: 'Скинути фільтри',
        action: 'reset'
      }
    );

    menu(
      'UA Search ' + VERSION + ' · Фільтри',
      items,
      function (x) {
        if (x.action === 'catalog') {
          return catalog();
        }

        if (x.action === 'reset') {
          state = Object.assign({}, defaults);
          save();

          return setTimeout(
            safe('reset', filters),
            150
          );
        }

        if (x.key) {
          choose(x.key, x.fieldTitle);
        }
      }
    );
  }

  function request(path) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var done = false;
      var timer;

      function finish(err, data) {
        if (done) return;

        done = true;
        clearTimeout(timer);

        if (err) reject(err);
        else resolve(data);
      }

      try {
        xhr.open('GET', BASE + path, true);
        xhr.timeout = TIMEOUT;

        timer = setTimeout(function () {
          try {
            xhr.abort();
          } catch (_) {}

          finish(new Error('Таймаут 20 секунд'));
        }, TIMEOUT);

        xhr.onload = function () {
          if (xhr.status < 200 || xhr.status >= 300) {
            return finish(
              new Error('HTTP ' + xhr.status)
            );
          }

          try {
            finish(
              null,
              JSON.parse(xhr.responseText)
            );
          } catch (e) {
            finish(new Error('Некоректний JSON'));
          }
        };

        xhr.onerror = function () {
          finish(
            new Error('Мережева помилка / CORS')
          );
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

  function page(cat, n) {
    return request(
      '/hls/api/lampa/list?cat=' +
      encodeURIComponent(cat) +
      '&page=' + n +
      '&limit=30'
    ).then(function (d) {
      if (!d || !Array.isArray(d.results)) {
        throw new Error('Невідомий формат API');
      }

      return d;
    });
  }

  function number(x) {
    var n = Number(x);
    return isFinite(n) ? n : null;
  }

  function normalize(x) {
    var z = Object.assign({}, x);

    z._title = String(
      x.title || x.name || 'Без назви'
    );

    z._year = parseInt(
      x.year ||
      x.release_date ||
      x.first_air_date,
      10
    ) || 0;

    z._rating = number(
      x.rating != null
        ? x.rating
        : x.vote_average
    );

    z._genres = x.genre_ids || x.genres || [];

    z._countries =
      x.production_countries ||
      x.origin_country ||
      x.countries ||
      [];

    z._quality = String(
      x.quality ||
      x.video_quality ||
      ''
    ).toLowerCase();

    return z;
  }

  function has(a, v, field) {
    if (!v) return true;
    if (!Array.isArray(a)) return false;

    return a.some(function (x) {
      var t = x && typeof x === 'object'
        ? (x[field] || x.id || x.name || '')
        : x;

      return (
        String(t).toUpperCase() ===
        String(v).toUpperCase()
      );
    });
  }

  function matches(x) {
    if (
      state.yearFrom &&
      (!x._year || x._year < Number(state.yearFrom))
    ) return false;

    if (
      state.yearTo &&
      (!x._year || x._year > Number(state.yearTo))
    ) return false;

    if (
      state.rating &&
      (
        x._rating === null ||
        x._rating < Number(state.rating)
      )
    ) return false;

    if (!has(x._genres, state.genre, 'id')) {
      return false;
    }

    if (!has(
      x._countries,
      state.country,
      'iso_3166_1'
    )) return false;

    if (state.quality) {
      var q = String(state.quality);

      if (
        q === '2160' &&
        !/2160|4k|uhd/.test(x._quality)
      ) return false;

      if (
        q === '1080' &&
        !/1080|fhd/.test(x._quality)
      ) return false;

      if (
        q === '720' &&
        !/720|\bhd\b/.test(x._quality)
      ) return false;
    }

    if (state.type) {
      var t = String(
        x.type ||
        x.category ||
        x.content_type ||
        ''
      ).toLowerCase();

      var types = {
        films: ['films', 'film', 'movie'],
        series: ['series', 'serial', 'tv'],
        cartoons: [
          'cartoons',
          'cartoon',
          'animation'
        ],
        multserialy: [
          'multserialy',
          'animated_series'
        ],
        anime: ['anime'],
        dorama: ['dorama']
      };

      if (
        t &&
        types[state.type] &&
        types[state.type].indexOf(t) < 0
      ) return false;
    }

    return true;
  }

  function sorted(a) {
    switch (state.sort) {
      case 'rating_desc':
        return a.sort(function (x, y) {
          return (
            y._rating === null ? -1 : y._rating
          ) - (
            x._rating === null ? -1 : x._rating
          );
        });

      case 'rating_asc':
        return a.sort(function (x, y) {
          return (
            x._rating === null ? 99 : x._rating
          ) - (
            y._rating === null ? 99 : y._rating
          );
        });

      case 'year_desc':
        return a.sort(function (x, y) {
          return y._year - x._year;
        });

      case 'year_asc':
        return a.sort(function (x, y) {
          return x._year - y._year;
        });

      case 'title_asc':
        return a.sort(function (x, y) {
          return x._title.localeCompare(
            y._title,
            'uk'
          );
        });

      default:
        return a;
    }
  }

  function idOf(x) {
    var id = x.tmdb_id || x.tmdb || x.tmdbId;

    if (id && typeof id === 'object') {
      id = id.id;
    }

    return (
      /^\d+$/.test(String(id || '')) &&
      Number(id) > 0
    ) ? Number(id) : null;
  }

  function typeOf(x) {
    var t = String(
      x.media_type ||
      x.type ||
      x.content_type ||
      ''
    ).toLowerCase();

    return (
      x.is_series === true ||
      ['tv', 'series', 'serial'].indexOf(t) >= 0
    ) ? 'tv' : 'movie';
  }

  function imageOf(x) {
    var p =
      x.poster_url ||
      x.poster ||
      x.poster_path ||
      x.img ||
      x.image ||
      '';

    if (typeof p !== 'string') return '';

    if (/^https?:\/\//i.test(p)) return p;

    if (/^\/\//.test(p)) {
      return 'https:' + p;
    }

    if (/^\/hls\//.test(p)) {
      return BASE + p;
    }

    if (/^\//.test(p)) {
      return 'https://image.tmdb.org/t/p/w500' + p;
    }

    return '';
  }

  function openCard(x) {
    var id = idOf(x);

    if (!id) {
      note('Для цього запису немає TMDB ID');
      return;
    }

    var t = typeOf(x);

    var card = {
      id: id,
      title: x._title,
      name: x._title,
      media_type: t,
      poster_path: x.poster_path || '',
      release_date: x.release_date || '',
      first_air_date: x.first_air_date || ''
    };

    try {
      Lampa.Activity.push({
        component: 'full',
        source: 'tmdb',
        method: t,
        id: id,
        card: card,
        movie: card,
        title: x._title,
        page: 1
      });
    } catch (e) {
      log('open-card', e);
      note('Помилка картки: ' + e.message);
    }
  }

  function results(items) {
    var rows = items.map(function (x) {
      var details = [
        x._year || '',
        x._rating === null ? '' : '★ ' + x._rating,
        x._quality
      ].filter(Boolean).join(' · ');

      return {
        title: x._title,
        subtitle: details,
        poster: imageOf(x),
        image: imageOf(x),
        data: x
      };
    });

    menu(
      'UAKino · ' + items.length + ' результатів',
      rows,
      function (row) {
        openCard(row.data);
      }
    );
  }

  function catalog() {
    if (busy) return;

    busy = true;

    var cat = state.type || state.category;
    var limit = Math.max(
      1,
      Math.min(5, Number(state.pages) || 2)
    );

    var all = [];

    try {
      if (Lampa.Loading) Lampa.Loading.start();
    } catch (e) {}

    function next(n) {
      if (n > limit) {
        return Promise.resolve(all);
      }

      return page(cat, n).then(function (d) {
        all = all.concat(d.results);

        if (d.total_pages) {
          limit = Math.min(
            limit,
            Number(d.total_pages) || limit
          );
        }

        return next(n + 1);
      });
    }

    next(1).then(function (raw) {
      busy = false;

      try {
        if (Lampa.Loading) Lampa.Loading.stop();
      } catch (e) {}

      var seen = {};

      var unique = raw.filter(function (x) {
        var k = String(
          x.uakino_id ||
          x.id ||
          ((x.title || x.name) + ':' + x.year)
        );

        if (seen[k]) return false;

        seen[k] = true;
        return true;
      });

      var found = sorted(
        unique.map(normalize).filter(matches)
      );

      if (!found.length) {
        return note(
          'За фільтрами нічого не знайдено'
        );
      }

      results(found);
    }).catch(function (e) {
      busy = false;

      try {
        if (Lampa.Loading) Lampa.Loading.stop();
      } catch (_) {}

      log('catalog', e);
      note('Каталог: ' + e.message);
    });
  }

  function test() {
    page('new', 1).then(function (d) {
      note(
        'API OK: ' +
        d.results.length +
        ' результатів'
      );
    }).catch(function (e) {
      log('api', e);
      note('API: ' + e.message);
    });
  }

  function main() {
    menu(
      'UA Search ' + VERSION,
      [
        {
          title: 'Каталог UAKino',
          action: 'catalog'
        },
        {
          title: 'Фільтри',
          action: 'filters'
        },
        {
          title: 'Перевірити API',
          action: 'test'
        },
        {
          title: 'Діагностика',
          action: 'diag'
        }
      ],
      function (x) {
        if (x.action === 'catalog') catalog();
        if (x.action === 'filters') filters();
        if (x.action === 'test') test();

        if (x.action === 'diag') {
          note(
            window.__UA_SEARCH_STAGE__ ||
            'Помилок не зафіксовано'
          );
        }
      }
    );
  }

  function init() {
    if (initialized) return;

    if (
      !window.Lampa ||
      !Lampa.Select ||
      !Lampa.Storage ||
      !Lampa.SettingsApi ||
      typeof Lampa.SettingsApi.addParam !== 'function'
    ) {
      if (++attempts < 60) {
        setTimeout(init, 500);
      }

      return;
    }

    initialized = true;
    restore();

    try {
      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
          name: 'ua_search_080_open',
          type: 'trigger',
          default: false
        },
        field: {
          name: 'UA Search 0.8.0',
          description: 'Каталог UAKino та фільтри'
        },
        onChange: safe('settings', main)
      });

      window.LampaUASearch = {
        version: VERSION,
        open: main,
        filters: filters,
        catalog: catalog,
        test: test
      };

      log('ready');
      note('0.8.0 завантажено');
    } catch (e) {
      log('init', e);
      note('Init: ' + e.message);
    }
  }

  try {
    init();
  } catch (e) {
    log('bootstrap', e);
  }
})();
