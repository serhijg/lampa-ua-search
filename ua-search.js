
(function () {
  'use strict';

  var VERSION = '0.7.5';
  var API = 'https://uakino.ax';
  var TIMEOUT = 20000;
  var STORAGE = 'ua_search_filters_07';

  if (window.__UA_SEARCH_075__) return;
  window.__UA_SEARCH_075__ = true;

  var choices = {
    genre: [
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
      [9648, 'Детектив'],
      [10749, 'Мелодрама'],
      [878, 'Фантастика'],
      [53, 'Трилер']
    ],

    type: [
      ['', 'Усі типи'],
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
      ['', 'Усі країни'],
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

    pages: [
      [1, '30 записів'],
      [2, '60 записів'],
      [3, '90 записів'],
      [5, '150 записів']
    ]
  };

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

  var state = Object.assign({}, defaults);
  var installed = false;
  var attempts = 0;
  var cache = {};

  function log() {
    try {
      console.log.apply(
        console,
        ['[UA Search ' + VERSION + ']'].concat(
          [].slice.call(arguments)
        )
      );
    } catch (_) {}
  }

  function notify(msg) {
    try {
      if (
        window.Lampa &&
        Lampa.Noty &&
        Lampa.Noty.show
      ) {
        Lampa.Noty.show('UA Search: ' + msg);
      } else {
        log(msg);
      }
    } catch (e) {
      log(e);
    }
  }

  function load() {
    try {
      var v = Lampa.Storage.get(STORAGE, {});

      if (v && typeof v === 'object') {
        Object.keys(defaults).forEach(function (k) {
          if (v[k] !== undefined) {
            state[k] = v[k];
          }
        });
      }
    } catch (e) {
      log('Storage read:', e);
    }
  }

  function save() {
    try {
      Lampa.Storage.set(STORAGE, state);
    } catch (e) {
      log('Storage write:', e);
    }
  }

  function nameOf(items, value) {
    for (var i = 0; i < items.length; i++) {
      if (String(items[i][0]) === String(value)) {
        return items[i][1];
      }
    }

    return String(value);
  }

  function request(path) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var finished = false;
      var timer;

      function done(err, data) {
        if (finished) return;

        finished = true;
        clearTimeout(timer);

        if (err) reject(err);
        else resolve(data);
      }

      try {
        xhr.open('GET', API + path, true);
        xhr.timeout = TIMEOUT;

        timer = setTimeout(function () {
          try {
            xhr.abort();
          } catch (_) {}

          done(new Error('Таймаут 20 секунд'));
        }, TIMEOUT);

        xhr.onload = function () {
          if (xhr.status < 200 || xhr.status >= 300) {
            return done(
              new Error('HTTP ' + xhr.status)
            );
          }

          try {
            done(
              null,
              JSON.parse(xhr.responseText)
            );
          } catch (e) {
            done(
              new Error('Некоректна відповідь JSON')
            );
          }
        };

        xhr.onerror = function () {
          done(
            new Error('Помилка мережі / CORS')
          );
        };

        xhr.ontimeout = function () {
          done(
            new Error('Таймаут 20 секунд')
          );
        };

        xhr.send();
      } catch (e) {
        done(e);
      }
    });
  }

  function loading(active) {
    try {
      if (!Lampa.Loading) return;

      if (active) {
        Lampa.Loading.start();
      } else {
        Lampa.Loading.stop();
      }
    } catch (e) {
      log(e);
    }
  }

  function menu(title, items, callback) {
    if (
      !Lampa.Select ||
      typeof Lampa.Select.show !== 'function'
    ) {
      return notify('Меню Select недоступне');
    }

    try {
      Lampa.Select.show({
        title: title,
        items: items,

        onSelect: function (item) {
          try {
            callback(item);
          } catch (e) {
            log('Menu:', e);
            notify(
              'Помилка меню: ' + e.message
            );
          }
        },

        onBack: function () {}
      });
    } catch (e) {
      log('Select:', e);
      notify('Не вдалося відкрити меню');
    }
  }

  function years() {
    var a = [[0, 'Без обмеження']];

    for (
      var y = new Date().getFullYear() + 1;
      y >= 1950;
      y--
    ) {
      a.push([y, String(y)]);
    }

    return a;
  }

  function choose(key, title) {
    var opts = (
      key === 'yearFrom' ||
      key === 'yearTo'
    ) ? years() : choices[key];

    menu(
      title,

      opts.map(function (o) {
        return {
          title: o[1],
          value: o[0],
          selected:
            String(o[0]) === String(state[key])
        };
      }),

      function (item) {
        state[key] = item.value;
        save();

        setTimeout(filtersMenu, 80);
      }
    );
  }

  function filtersMenu() {
    var fields = [
      ['genre', 'Жанр'],
      ['yearFrom', 'Рік від'],
      ['yearTo', 'Рік до'],
      ['type', 'Тип контенту'],
      ['quality', 'Якість'],
      ['sort', 'Сортування'],
      ['country', 'Країна'],
      ['rating', 'Мінімальний рейтинг'],
      ['category', 'Категорія'],
      ['pages', 'Сторінок каталогу']
    ];

    var rows = fields.map(function (f) {
      var opts = (
        f[0] === 'yearFrom' ||
        f[0] === 'yearTo'
      ) ? years() : choices[f[0]];

      return {
        title: f[1],
        subtitle: nameOf(opts, state[f[0]]),
        key: f[0]
      };
    });

    rows.push({
      title: 'Показати результати',
      action: 'catalog'
    });

    rows.push({
      title: 'Скинути фільтри',
      action: 'reset'
    });

    menu(
      'UA Search ' + VERSION + ' · Фільтри',
      rows,

      function (item) {
        if (item.action === 'catalog') {
          return catalog();
        }

        if (item.action === 'reset') {
          state = Object.assign({}, defaults);
          save();

          return setTimeout(filtersMenu, 80);
        }

        if (item.key) {
          choose(item.key, item.title);
        }
      }
    );
  }

  function normalize(x) {
    var y = Object.assign({}, x);

    y._title = String(
      x.title || x.name || 'Без назви'
    );

    y._year = parseInt(
      x.year ||
      x.release_date ||
      x.first_air_date,
      10
    ) || 0;

    var r = x.rating != null
      ? x.rating
      : x.vote_average;

    y._rating = (
      r == null || r === ''
    ) ? null : Number(r);

    if (!isFinite(y._rating)) {
      y._rating = null;
    }

    y._genres =
      x.genre_ids || x.genres || [];

    y._countries =
      x.production_countries ||
      x.origin_country ||
      x.countries ||
      [];

    y._quality = String(
      x.quality ||
      x.video_quality ||
      ''
    ).toLowerCase();

    return y;
  }

  function contains(list, want, field) {
    if (!want) return true;
    if (!Array.isArray(list)) return false;

    return list.some(function (x) {
      var v = typeof x === 'object'
        ? (
            x[field] ||
            x.id ||
            x.name ||
            ''
          )
        : x;

      return (
        String(v).toUpperCase() ===
        String(want).toUpperCase()
      );
    });
  }

  function matches(x) {
    if (
      state.yearFrom &&
      (
        !x._year ||
        x._year < Number(state.yearFrom)
      )
    ) return false;

    if (
      state.yearTo &&
      (
        !x._year ||
        x._year > Number(state.yearTo)
      )
    ) return false;

    if (
      state.rating &&
      (
        x._rating === null ||
        x._rating < Number(state.rating)
      )
    ) return false;

    if (!contains(
      x._genres,
      state.genre,
      'id'
    )) return false;

    if (!contains(
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

      var valid = {
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
        valid[state.type] &&
        valid[state.type].indexOf(t) < 0
      ) return false;
    }

    return true;
  }

  function sorted(items) {
    var s = state.sort;

    if (s === 'default') return items;

    return items.sort(function (a, b) {
      if (s === 'rating_desc') {
        return (
          b._rating == null ? -1 : b._rating
        ) - (
          a._rating == null ? -1 : a._rating
        );
      }

      if (s === 'rating_asc') {
        return (
          a._rating == null ? 99 : a._rating
        ) - (
          b._rating == null ? 99 : b._rating
        );
      }

      if (s === 'year_desc') {
        return b._year - a._year;
      }

      if (s === 'year_asc') {
        return a._year - b._year;
      }

      if (s === 'title_asc') {
        return a._title.localeCompare(
          b._title,
          'uk'
        );
      }

      return 0;
    });
  }

  function page(cat, n) {
    var key = cat + ':' + n;
    var hit = cache[key];

    if (
      hit &&
      Date.now() - hit.at < 120000
    ) {
      return Promise.resolve(hit.data);
    }

    return request(
      '/hls/api/lampa/list?cat=' +
      encodeURIComponent(cat) +
      '&page=' + n +
      '&limit=30'
    ).then(function (data) {
      if (
        !data ||
        !Array.isArray(data.results)
      ) {
        throw new Error(
          'Невідомий формат каталогу'
        );
      }

      cache[key] = {
        at: Date.now(),
        data: data
      };

      return data;
    });
  }

  function catalog() {
    var cat = state.type || state.category;

    var count = Math.min(
      5,
      Math.max(
        1,
        Number(state.pages) || 3
      )
    );

    var all = [];

    loading(true);

    function next(n) {
      if (n > count) {
        return Promise.resolve(all);
      }

      return page(cat, n).then(function (d) {
        all = all.concat(d.results);

        if (d.total_pages) {
          count = Math.min(
            count,
            Number(d.total_pages) || count
          );
        }

        return next(n + 1);
      });
    }

    next(1).then(function (raw) {
      loading(false);

      var seen = {};

      var unique = raw.filter(function (x) {
        var id = String(
          x.uakino_id ||
          x.id ||
          (
            (x.title || x.name) +
            ':' +
            x.year
          )
        );

        if (seen[id]) return false;

        seen[id] = true;
        return true;
      });

      var found = sorted(
        unique.map(normalize).filter(matches)
      );

      var rows = [{
        title: '⚙ Змінити фільтри',
        subtitle:
          found.length +
          ' із ' +
          unique.length,
        action: 'filters'
      }];

      found.forEach(function (x) {
        var details = [];

        if (x._year) {
          details.push(x._year);
        }

        if (x._rating != null) {
          details.push(
            '★ ' + x._rating.toFixed(1)
          );
        }

        if (x._quality) {
          details.push(x._quality);
        }

        rows.push({
          title: x._title,
          subtitle: details.join(' · '),
          movie: x
        });
      });

      if (!found.length) {
        rows.push({
          title: 'Немає результатів',
          action: 'filters'
        });
      }

      menu(
        'UAKino · ' +
        found.length +
        ' результатів',

        rows,

        function (item) {
          if (item.action === 'filters') {
            return filtersMenu();
          }

          if (item.movie) {
            return details(item.movie);
          }
        }
      );
    }).catch(function (e) {
      loading(false);
      log('Catalog:', e);

      notify(
        'Каталог: ' + e.message
      );
    });
  }

  function details(x) {
    // Діагностичний режим:
    // Не відкриваємо Activity.
    // Не запускаємо Player.

    menu(
      x._title,

      [
        {
          title: 'Назва',
          subtitle: x._title
        },
        {
          title: 'Рік',
          subtitle: String(
            x._year || 'Невідомий'
          )
        },
        {
          title: 'Рейтинг',
          subtitle: x._rating == null
            ? 'Невідомий'
            : String(x._rating)
        },
        {
          title: 'TMDB ID',
          subtitle: String(
            x.tmdb_id ||
            x.tmdb ||
            'Не вказаний'
          )
        },
        {
          title: 'Повернутися до каталогу',
          action: 'back'
        }
      ],

      function (item) {
        if (item.action === 'back') {
          setTimeout(catalog, 80);
        }
      }
    );
  }

  function test() {
    loading(true);

    page('new', 1)
      .then(function (d) {
        loading(false);

        notify(
          'API працює, записів: ' +
          d.results.length
        );
      })
      .catch(function (e) {
        loading(false);
        notify('API: ' + e.message);
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
          title: 'Тест API',
          action: 'test'
        },
        {
          title: 'Очистити кеш',
          action: 'clear'
        }
      ],

      function (x) {
        if (x.action === 'catalog') {
          catalog();
        } else if (x.action === 'filters') {
          filtersMenu();
        } else if (x.action === 'test') {
          test();
        } else if (x.action === 'clear') {
          cache = {};
          notify('Кеш очищено');
        }
      }
    );
  }

  function install() {
    if (installed) return;

    if (
      !window.Lampa ||
      !Lampa.SettingsApi ||
      typeof Lampa.SettingsApi.addParam !==
        'function' ||
      !Lampa.Select ||
      !Lampa.Storage
    ) {
      if (++attempts < 60) {
        setTimeout(install, 500);
      }

      return;
    }

    installed = true;
    load();

    try {
      Lampa.SettingsApi.addParam({
        component: 'interface',

        param: {
          name: 'ua_search_075_open',
          type: 'trigger',
          default: false
        },

        field: {
          name: 'UA Search 0.7.5',
          description:
            'Каталог, фільтри та діагностика'
        },

        onChange: main
      });

      Lampa.SettingsApi.addParam({
        component: 'interface',

        param: {
          name: 'ua_search_075_test',
          type: 'trigger',
          default: false
        },

        field: {
          name: 'UA Search · Перевірка API',
          description: 'Таймаут 20 секунд'
        },

        onChange: test
      });

      window.LampaUASearch = {
        version: VERSION,
        open: main,
        catalog: catalog,
        filters: filtersMenu,
        test: test
      };

      log('Initialized');
      notify(VERSION + ' завантажена');
    } catch (e) {
      installed = false;
      log('Install error:', e);

      notify(
        'Ініціалізація: ' + e.message
      );
    }
  }

  try {
    install();
  } catch (e) {
    log('Fatal:', e);
  }
})();
