
(function () {
  'use strict';

  var VERSION = '0.7.8';
  var BASE = 'https://uakino.ax';
  var STORE = 'ua_search_filters_07';
  var LIMIT = 20000;

  var started = false;
  var tries = 0;
  var registered = false;
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
    pages: 3
  };

  var state = {};
  var cache = {};

  var genres = [
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
  ];

  var lists = {
    genre: genres,

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
      ['GB', 'Британія'],
      ['FR', 'Франція'],
      ['DE', 'Німеччина'],
      ['PL', 'Польща'],
      ['JP', 'Японія'],
      ['KR', 'Корея'],
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

  function trace(stage, error) {
    try {
      console.error(
        '[UA Search ' + VERSION + '] ' + stage,
        error || ''
      );
    } catch (e) {}

    try {
      window.__UA_SEARCH_078_STAGE__ =
        stage +
        (error
          ? ': ' + (error.message || error)
          : '');
    } catch (e2) {}
  }

  function note(message) {
    try {
      Lampa.Noty.show('UA Search: ' + message);
    } catch (e) {
      trace('notice', e);
    }
  }

  function guard(stage, fn) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        trace(stage, e);
        note(stage + ': ' + (e.message || e));
      }
    };
  }

  function restore() {
    state = Object.assign({}, defaults);

    try {
      var saved = Lampa.Storage.get(STORE, {});

      if (saved && typeof saved === 'object') {
        Object.keys(defaults).forEach(function (k) {
          if (saved[k] !== undefined) {
            state[k] = saved[k];
          }
        });
      }
    } catch (e) {
      trace('storage-read', e);
    }
  }

  function save() {
    try {
      Lampa.Storage.set(STORE, state);
    } catch (e) {
      trace('storage-save', e);
    }
  }

  function label(arr, v) {
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i][0]) === String(v)) {
        return arr[i][1];
      }
    }

    return String(v);
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

  function select(title, items, fn) {
    Lampa.Select.show({
      title: title,
      items: items,
      onSelect: guard('select', fn),
      onBack: function () {}
    });
  }

  function choose(key, title) {
    var opts = (
      key === 'yearFrom' ||
      key === 'yearTo'
    ) ? years() : lists[key];

    select(
      title,

      opts.map(function (x) {
        return {
          title: x[1],
          value: x[0],
          selected:
            String(x[0]) === String(state[key])
        };
      }),

      function (x) {
        state[key] = x.value;
        save();

        setTimeout(
          guard('filters-return', filtersMenu),
          100
        );
      }
    );
  }

  function filtersMenu() {
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

    var rows = fields.map(function (f) {
      return {
        title: f[1],

        subtitle: label(
          (
            f[0] === 'yearFrom' ||
            f[0] === 'yearTo'
          ) ? years() : lists[f[0]],

          state[f[0]]
        ),

        key: f[0]
      };
    });

    rows.push({
      title: 'Показати плитки UAKino',
      action: 'show'
    });

    rows.push({
      title: 'Скинути фільтри',
      action: 'reset'
    });

    select(
      'UA Search ' + VERSION + ' · Фільтри',
      rows,

      function (x) {
        if (x.action === 'show') {
          return catalog();
        }

        if (x.action === 'reset') {
          state = Object.assign({}, defaults);
          save();

          return setTimeout(
            guard('reset', filtersMenu),
            100
          );
        }

        if (x.key) {
          choose(x.key, x.title);
        }
      }
    );
  }

  function request(path) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var finished = false;
      var timer;

      function end(err, data) {
        if (finished) return;

        finished = true;
        clearTimeout(timer);

        if (err) reject(err);
        else resolve(data);
      }

      try {
        xhr.open('GET', BASE + path, true);
        xhr.timeout = LIMIT;

        timer = setTimeout(function () {
          try {
            xhr.abort();
          } catch (e) {}

          end(new Error('Таймаут 20 секунд'));
        }, LIMIT);

        xhr.onload = function () {
          if (
            xhr.status < 200 ||
            xhr.status >= 300
          ) {
            return end(
              new Error('HTTP ' + xhr.status)
            );
          }

          try {
            end(
              null,
              JSON.parse(xhr.responseText)
            );
          } catch (e) {
            end(
              new Error('Некоректний JSON')
            );
          }
        };

        xhr.onerror = function () {
          end(
            new Error('Мережева помилка / CORS')
          );
        };

        xhr.ontimeout = function () {
          end(
            new Error('Таймаут 20 секунд')
          );
        };

        xhr.send();
      } catch (e) {
        end(e);
      }
    });
  }

  function loading(on) {
    try {
      if (Lampa.Loading) {
        if (on) Lampa.Loading.start();
        else Lampa.Loading.stop();
      }
    } catch (e) {
      trace('loading', e);
    }
  }

  function page(cat, n) {
    var k = cat + ':' + n;
    var c = cache[k];

    if (
      c &&
      Date.now() - c.time < 120000
    ) {
      return Promise.resolve(c.data);
    }

    return request(
      '/hls/api/lampa/list?cat=' +
      encodeURIComponent(cat) +
      '&page=' + n +
      '&limit=30'
    ).then(function (d) {
      if (
        !d ||
        !Array.isArray(d.results)
      ) {
        throw new Error(
          'Невідомий формат каталогу'
        );
      }

      cache[k] = {
        time: Date.now(),
        data: d
      };

      return d;
    });
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

    var r = x.rating != null
      ? x.rating
      : x.vote_average;

    z._rating = (
      r == null || r === ''
    ) ? null : Number(r);

    if (!isFinite(z._rating)) {
      z._rating = null;
    }

    z._genres =
      x.genre_ids || x.genres || [];

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

  function contains(a, v, field) {
    if (!v) return true;
    if (!Array.isArray(a)) return false;

    return a.some(function (x) {
      var q = (
        x &&
        typeof x === 'object'
      ) ? (
        x[field] ||
        x.id ||
        x.name ||
        ''
      ) : x;

      return (
        String(q).toUpperCase() ===
        String(v).toUpperCase()
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

      var aliases = {
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
        aliases[state.type] &&
        aliases[state.type].indexOf(t) < 0
      ) return false;
    }

    return true;
  }

  function sortItems(a) {
    var s = state.sort;

    if (s === 'default') return a;

    return a.sort(function (x, y) {
      if (s === 'rating_desc') {
        return (
          y._rating == null ? -1 : y._rating
        ) - (
          x._rating == null ? -1 : x._rating
        );
      }

      if (s === 'rating_asc') {
        return (
          x._rating == null ? 99 : x._rating
        ) - (
          y._rating == null ? 99 : y._rating
        );
      }

      if (s === 'year_desc') {
        return y._year - x._year;
      }

      if (s === 'year_asc') {
        return x._year - y._year;
      }

      if (s === 'title_asc') {
        return x._title.localeCompare(
          y._title,
          'uk'
        );
      }

      return 0;
    });
  }

  function tmdbId(x) {
    var v =
      x.tmdb_id ||
      x.tmdb ||
      x.tmdbId;

    if (
      v &&
      typeof v === 'object'
    ) {
      v = v.id;
    }

    return (
      /^\d+$/.test(String(v || '')) &&
      Number(v) > 0
    ) ? Number(v) : null;
  }

  function mediaType(x) {
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

  function poster(x) {
    var v =
      x.poster_url ||
      x.poster ||
      x.poster_path ||
      x.img ||
      x.image ||
      '';

    if (typeof v !== 'string') {
      return '';
    }

    if (/^https?:\/\//i.test(v)) {
      return v;
    }

    if (/^\/\//.test(v)) {
      return 'https:' + v;
    }

    if (/^\/hls\//.test(v)) {
      return BASE + v;
    }

    if (/^\//.test(v)) {
      return 'https://image.tmdb.org/t/p/w500' + v;
    }

    return '';
  }

  function openCard(x) {
    var id = tmdbId(x);

    if (!id) {
      note(
        'У запису немає TMDB ID; ' +
        'картку не відкити'
      );
      return;
    }

    var type = mediaType(x);

    var card = {
      id: id,
      title: x._title,
      name: x._title,
      media_type: type,
      poster_path: x.poster_path || '',
      release_date: x.release_date || '',
      first_air_date: x.first_air_date || ''
    };

    try {
      Lampa.Activity.push({
        component: 'full',
        source: 'tmdb',
        method: type,
        id: id,
        card: card,
        movie: card,
        title: x._title,
        page: 1
      });
    } catch (e) {
      trace('open-card', e);
      note('Картка: ' + e.message);
    }
  }

  function registerGrid() {
    if (registered) return true;

    if (
      !Lampa.Component ||
      typeof Lampa.Component.add !== 'function' ||
      !Lampa.Activity ||
      !Lampa.Controller ||
      !Lampa.Card ||
      !window.$
    ) {
      note('Компоненти плиток недоступні');
      return false;
    }

    try {
      Lampa.Component.add(
        'ua_search_grid_078',

        function () {
          var root = $(
            '<div class="ua-search-grid-078"></div>'
          );

          var list = $(
            '<div class="ua-search-grid-078__list"></div>'
          );

          var buttons = [];
          var current = 0;
          var items = [];

          if (
            !document.getElementById(
              'ua-search-grid-078-css'
            )
          ) {
            $(
              '<style id="ua-search-grid-078-css">' +
              '.ua-search-grid-078{' +
              'padding:2em 3em}' +
              '.ua-search-grid-078__title{' +
              'font-size:1.7em;margin-bottom:1em}' +
              '.ua-search-grid-078__list{' +
              'display:grid;' +
              'grid-template-columns:' +
              'repeat(auto-fill,minmax(160px,1fr));' +
              'gap:1.3em}' +
              '.ua-search-grid-078__list .card{' +
              'width:100%;margin:0}' +
              '.ua-search-grid-078 .ua-search-focus{' +
              'outline:3px solid white;' +
              'outline-offset:2px}' +
              '</style>'
            ).appendTo('head');
          }

          function focus(i) {
            if (!buttons.length) return;

            current = Math.max(
              0,
              Math.min(i, buttons.length - 1)
            );

            buttons.forEach(function (b, n) {
              b.el.toggleClass(
                'ua-search-focus',
                n === current
              );
            });

            var el = buttons[current].el[0];

            if (
              el &&
              el.scrollIntoView
            ) {
              el.scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
              });
            }
          }

          function columns() {
            return Math.max(
              1,
              Math.floor(
                (list.width() || 800) / 180
              )
            );
          }

          function move(d) {
            if (d === 'left') {
              focus(current - 1);
            }

            if (d === 'right') {
              focus(current + 1);
            }

            if (d === 'up') {
              focus(current - columns());
            }

            if (d === 'down') {
              focus(current + columns());
            }
          }

          function enter() {
            if (buttons[current]) {
              openCard(buttons[current].data);
            }
          }

          this.create = function () {
            items = (
              this.activity &&
              this.activity.items
            ) || [];

            root.empty();
            list.empty();
            buttons = [];

            root.append(
              $(
                '<div class="ua-search-grid-078__title"></div>'
              ).text(
                'UAKino · ' +
                items.length +
                ' результатів'
              )
            ).append(list);

            items.forEach(function (x) {
              try {
                var id = tmdbId(x);
                var p = poster(x);

                var data = {
                  id: id || 0,
                  title: x._title,
                  name: x._title,
                  media_type: mediaType(x),
                  poster_path: p,
                  release_date:
                    x.release_date ||
                    String(x._year || ''),
                  vote_average:
                    x._rating || 0
                };

                var card = new Lampa.Card(
                  data,
                  {
                    card_category: true
                  }
                );

                card.create();

                var el = card.render();

                if (
                  !el ||
                  !el.length
                ) {
                  throw new Error(
                    'Card.render порожній'
                  );
                }

                el.addClass('selector');

                el.on(
                  'hover:enter',
                  function () {
                    openCard(x);
                  }
                );

                el.on(
                  'click',
                  function () {
                    openCard(x);
                  }
                );

                list.append(el);

                buttons.push({
                  el: el,
                  data: x,
                  card: card
                });
              } catch (e) {
                trace('card-render', e);
              }
            });

            if (!buttons.length) {
              list.append(
                $('<div></div>').text(
                  'Немає доступних плиток'
                )
              );
            }

            return root;
          };

          this.start = function () {
            try {
              Lampa.Controller.add(
                'ua_search_grid_078',
                {
                  toggle: function () {
                    focus(current);
                  },

                  left: function () {
                    move('left');
                  },

                  right: function () {
                    move('right');
                  },

                  up: function () {
                    move('up');
                  },

                  down: function () {
                    move('down');
                  },

                  enter: enter,

                  back: function () {
                    Lampa.Activity.backward();
                  }
                }
              );

              Lampa.Controller.toggle(
                'ua_search_grid_078'
              );
            } catch (e) {
              trace('grid-start', e);

              note(
                'Навігація: ' +
                e.message
              );
            }
          };

          this.pause = function () {};
          this.stop = function () {};

          this.render = function () {
            return root;
          };

          this.destroy = function () {
            buttons.forEach(function (b) {
              try {
                if (
                  b.card &&
                  b.card.destroy
                ) {
                  b.card.destroy();
                }
              } catch (e) {}
            });

       
