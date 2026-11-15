
(function () {
  'use strict';

  var VERSION = '0.7.4';
  var API = 'https://uakino.ax';
  var TIMEOUT = 20000;
  var KEY = 'ua_search_filters_07';

  if (window.__UA_SEARCH_074__) return;

  var genres = [
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

  var countries = [
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

  var types = [
    ['', 'Усі типи'],
    ['films', 'Фільми'],
    ['series', 'Серіали'],
    ['cartoons', 'Мультфільми'],
    ['multserialy', 'Мультсеріали'],
    ['anime', 'Аніме'],
    ['dorama', 'Дорами']
  ];

  var qualities = [
    ['', 'Будь-яка'],
    ['2160', '4K / 2160p'],
    ['1080', 'Full HD / 1080p'],
    ['720', 'HD / 720p']
  ];

  var sorts = [
    ['default', 'Порядок UAKino'],
    ['rating_desc', 'Рейтинг: спадання'],
    ['rating_asc', 'Рейтинг: зростання'],
    ['year_desc', 'Спочатку нові'],
    ['year_asc', 'Спочатку старі'],
    ['title_asc', 'Назва А–Я'],
    ['title_desc', 'Назва Я–А']
  ];

  var categories = [
    ['new', 'Новинки'],
    ['films', 'Фільми'],
    ['series', 'Серіали'],
    ['cartoons', 'Мультфільми'],
    ['multserialy', 'Мультсеріали'],
    ['anime', 'Аніме'],
    ['dorama', 'Дорами'],
    ['4k', '4K'],
    ['top', 'Найкраще']
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
  var cache = {};
  var ready = false;
  var initAttempts = 0;

  function log(e) {
    try {
      console.log('[UA Search 0.7.4]', e);
    } catch (_) {}
  }

  function notice(s) {
    try {
      Lampa.Noty.show('UA Search: ' + s);
    } catch (e) {
      log(s);
    }
  }

  function storageGet(k, fallback) {
    try {
      return Lampa.Storage.get(k, fallback);
    } catch (e) {
      return fallback;
    }
  }

  function storageSet(k, value) {
    try {
      Lampa.Storage.set(k, value);
    } catch (e) {
      log(e);
    }
  }

  function read() {
    filters = Object.assign({}, defaults);

    var saved = storageGet(KEY, {});

    if (saved && typeof saved === 'object') {
      Object.keys(defaults).forEach(function (k) {
        if (saved[k] !== undefined) {
          filters[k] = saved[k];
        }
      });
    }
  }

  function save() {
    storageSet(KEY, Object.assign({}, filters));
  }

  function label(list, value) {
    for (var i = 0; i < list.length; i++) {
      if (String(list[i][0]) === String(value)) {
        return list[i][1];
      }
    }

    return String(value);
  }

  function params(o) {
    return Object.keys(o)
      .filter(function (k) {
        return o[k] !== undefined &&
          o[k] !== null &&
          o[k] !== '';
      })
      .map(function (k) {
        return encodeURIComponent(k) + '=' +
          encodeURIComponent(o[k]);
      })
      .join('&');
  }

  function request(path) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var finished = false;
      var timer;

      function finish(error, result) {
        if (finished) return;

        finished = true;
        clearTimeout(timer);

        if (error) reject(error);
        else resolve(result);
      }

      try {
        xhr.open('GET', API + path, true);
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
            finish(new Error('Помилка JSON'));
          }
        };

        xhr.onerror = function () {
          finish(
            new Error('Помилка мережі / CORS')
          );
        };

        xhr.ontimeout = function () {
          finish(
            new Error('Таймаут 20 секунд')
          );
        };

        xhr.send();
      } catch (e) {
        finish(e);
      }
    });
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
    } catch (_) {}
  }

  function select(title, items, action, back) {
    try {
      Lampa.Select.show({
        title: title,
        items: items,

        onSelect: function (item) {
          try {
            action(item);
          } catch (e) {
            log(e);
            notice(
              'Помилка меню: ' + e.message
            );
          }
        },

        onBack: function () {
          if (typeof back === 'function') {
            back();
          }
        }
      });
    } catch (e) {
      log(e);
      notice('Помилка відкриття меню');
    }
  }

  function yearOptions() {
    var result = [
      [0, 'Без обмеження']
    ];

    for (
      var y = new Date().getFullYear() + 1;
      y >= 1950;
      y--
    ) {
      result.push([y, String(y)]);
    }

    return result;
  }

  function choose(title, options, current, callback) {
    select(
      title,

      options.map(function (entry) {
        return {
          title: entry[1],
          value: entry[0],
          selected:
            String(entry[0]) === String(current)
        };
      }),

      function (item) {
        callback(item.value);
        save();

        setTimeout(showFilters, 0);
      }
    );
  }

  function showFilters() {
    var f = filters;

    var rows = [
      {
        title: 'Жанр',
        subtitle: label(genres, f.genre),
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
        subtitle: label(types, f.type),
        key: 'type'
      },
      {
        title: 'Якість відео',
        subtitle: label(qualities, f.quality),
        key: 'quality'
      },
      {
        title: 'Сортування',
        subtitle: label(sorts, f.sort),
        key: 'sort'
      },
      {
        title: 'Країна',
        subtitle: label(countries, f.country),
        key: 'country'
      },
      {
        title: 'Мінімальний рейтинг TMDB',
        subtitle: f.rating
          ? String(f.rating) + '+'
          : 'Будь-який',
        key: 'rating'
      },
      {
        title: 'Категорія UAKino',
        subtitle: label(categories, f.category),
        key: 'category'
      },
      {
        title: 'Кількість сторінок',
        subtitle: String(f.pages) + ' × 30',
        key: 'pages'
      },
      {
        title: 'Застосувати фільтри',
        action: 'apply'
      },
      {
        title: 'Скинути фільтри',
        action: 'reset'
      }
    ];

    select(
      'UA Search 0.7.4 · Фільтри',
      rows,

      function (item) {
        if (item.action === 'apply') {
          return showCatalog();
        }

        if (item.action === 'reset') {
          filters = Object.assign({}, defaults);
          save();
          return showFilters();
        }

        var options = {
          genre: genres,
          type: types,
          quality: qualities,
          sort: sorts,
          country: countries,
          category: categories,
          yearFrom: yearOptions(),
          yearTo: yearOptions(),

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

        if (options[item.key]) {
          choose(
            item.title,
            options[item.key],
            filters[item.key],

            function (v) {
              filters[item.key] = v;
            }
          );
        }
      }
    );
  }

  function normalize(x) {
    var item = Object.assign({}, x);

    item.title = String(
      x.title || x.name || ''
    );

    item._year = parseInt(
      x.year ||
      x.release_date ||
      x.first_air_date,
      10
    ) || 0;

    var rating = x.rating;

    if (
      rating === undefined ||
      rating === null
    ) {
      rating = x.vote_average;
    }

    item._rating =
      rating === undefined ||
      rating === null ||
      rating === ''
        ? null
        : Number(rating);

    if (!isFinite(item._rating)) {
      item._rating = null;
    }

    item._genres =
      x.genre_ids || x.genres || [];

    item._countries =
      x.production_countries ||
      x.origin_country ||
      x.countries ||
      [];

    item._quality = String(
      x.quality || x.video_quality || ''
    ).toLowerCase();

    return item;
  }

  function includesGenre(x, id) {
    if (!id) return true;

    return Array.isArray(x._genres) &&
      x._genres.some(function (g) {
        return (
          String(
            typeof g === 'object' ? g.id : g
          ) === String(id)
        ) || (
          String(
            typeof g === 'object' ? g.name : g
          ).toLowerCase() ===
          label(genres, id).toLowerCase()
        );
      });
  }

  function includesCountry(x, country) {
    if (!country) return true;

    return Array.isArray(x._countries) &&
      x._countries.some(function (c) {
        var v = typeof c === 'object'
          ? (
              c.iso_3166_1 ||
              c.code ||
              c.name
            )
          : c;

        return (
          String(v).toUpperCase() === country
        ) || (
          String(v).toLowerCase() ===
          label(countries, country).toLowerCase()
        );
      });
  }

  function includesQuality(x, q) {
    if (!q) return true;

    if (q === '2160') {
      return /2160|4k|uhd/.test(x._quality);
    }

    if (q === '1080') {
      return /1080|fhd|full.?hd/.test(
        x._quality
      );
    }

    if (q === '720') {
      return /720|(^|[^a-z])hd([^a-z]|$)/.test(
        x._quality
      );
    }

    return false;
  }

  function includesType(x, t, cat) {
    if (!t || t === cat) return true;

    var v = String(
      x.type ||
      x.category ||
      x.content_type ||
      ''
    ).toLowerCase();

    var names = {
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

    return (
      (names[t] || []).indexOf(v) >= 0
    ) || (
      t === 'series' &&
      x.is_series === true
    ) || (
      t === 'films' &&
      x.is_series === false
    );
  }

  function applyFilters(data, cat) {
    var f = filters;

    var result = data
      .map(normalize)
      .filter(function (x) {
        return (
          !f.yearFrom ||
          (
            x._year &&
            x._year >= Number(f.yearFrom)
          )
        ) && (
          !f.yearTo ||
          (
            x._year &&
            x._year <= Number(f.yearTo)
          )
        ) && (
          !f.rating ||
          (
            x._rating !== null &&
            x._rating >= Number(f.rating)
          )
        ) &&
        includesGenre(x, f.genre) &&
        includesCountry(x, f.country) &&
        includesQuality(x, f.quality) &&
        includesType(x, f.type, cat);
      });

    if (f.sort !== 'default') {
      result.sort(function (a, b) {
        switch (f.sort) {
          case 'rating_desc':
            return (
              b._rating === null ? -1 : b._rating
            ) - (
              a._rating === null ? -1 : a._rating
            );

          case 'rating_asc':
            return (
              a._rating === null ? 99 : a._rating
            ) - (
              b._rating === null ? 99 : b._rating
            );

          case 'year_desc':
            return b._year - a._year;

          case 'year_asc':
            return a._year - b._year;

          case 'title_asc':
            return a.title.localeCompare(
              b.title, 'uk'
            );

          case 'title_desc':
            return b.title.localeCompare(
              a.title, 'uk'
            );

          default:
            return 0;
        }
      });
    }

    return result;
  }

  function fetchPage(cat, page) {
    var key = cat + ':' + page;
    var old = cache[key];

    if (
      old &&
      Date.now() - old.time < 120000
    ) {
      return Promise.resolve(old.data);
    }

    return request(
      '/hls/api/lampa/list?' +
      params({
        cat: cat,
        page: page,
        limit: 30
      })
    ).then(function (data) {
      if (
        !data ||
        !Array.isArray(data.results)
      ) {
        throw new Error(
          'Каталог повернув невідомий формат'
        );
      }

      cache[key] = {
        time: Date.now(),
        data: data
      };

      return data;
    });
  }

  function showCatalog() {
    var cat = filters.type ||
      filters.category;

    var pages = Math.max(
      1,
      Math.min(
        5,
        Number(filters.pages) || 3
      )
    );

    var all = [];

    loading(true);

    function next(page) {
      if (page > pages) {
        return Promise.resolve(all);
      }

      return fetchPage(cat, page)
        .then(function (data) {
          all = all.concat(data.results);

          if (data.total_pages) {
            pages = Math.min(
              pages,
              Number(data.total_pages) || pages
            );
          }

          return next(page + 1);
        });
    }

    next(1).then(function (data) {
      loading(false);

      var seen = {};

      data = data.filter(function (x) {
        var id = String(
          x.uakino_id ||
          x.id ||
          (x.title + ':' + x.year)
        );

        if (seen[id]) return false;

        seen[id] = true;
        return true;
      });

      var result = applyFilters(data, cat);

      var rows = [{
        title: '⚙ Змінити фільтри',
        subtitle:
          result.length + ' із ' + data.length,
        action: 'filters'
      }];

      result.forEach(function (x) {
        var info = [];

        if (x._year) {
          info.push(String(x._year));
        }

        if (x._rating !== null) {
          info.push(
            '★ ' + x._rating.toFixed(1)
          );
        }

        if (x._quality) {
          info.push(x._quality);
        }

        rows.push({
          title: x.title,
          subtitle: info.join(' · '),
          movie: x
        });
      });

      if (!result.length) {
        rows.push({
          title: 'Немає результатів',
          action: 'filters'
        });
      }

      select(
        'UAKino · ' +
          result.length +
          ' результатів',

        rows,

        function (item) {
          if (item.action === 'filters') {
            return showFilters();
          }

          if (item.movie) {
            openNativeCard(item.movie);
          }
        }
      );
    }).catch(function (e) {
      loading(false);
      log(e);
      notice('Каталог: ' + e.message);
    });
  }

  function mediaType(x) {
    var type = String(
      x.media_type ||
      x.type ||
      x.content_type ||
      ''
    ).toLowerCase();

    return (
      x.is_series === true ||
      type === 'tv' ||
      type === 'series' ||
      type === 'serial'
    ) ? 'tv' : 'movie';
  }

  function tmdbId(x) {
    // Не вважаємо ID UAKino ідентифікатором TMDB.
    var v =
      x.tmdb_id ||
      x.tmdb ||
      x.tmdbId;

    if (
      typeof v === 'object' &&
      v !== null
    ) {
      v = v.id;
    }

    var s = String(v || '');

    return (
      /^\d+$/.test(s) &&
      Number(s) > 0
    ) ? Number(s) : null;
  }

  /*
   * ГОЛОВНЕ ВИПРАВЛЕННЯ 0.7.4
   *
   * Відкриваємо картку фільму.
   * НЕ запускаємо Lampa.Player.play().
   * НЕ натискаємо кнопку UAKino програмно.
   */

  function openNativeCard(x) {
    var id = tmdbId(x);

    if (!id) {
      notice(
        'Немає TMDB ID. ' +
        'Відкрий фільм через пошук Lampa'
      );
      return;
    }

    if (
      !Lampa.Activity ||
      typeof Lampa.Activity.push !== 'function'
    ) {
      notice(
        'Штатна навігація Lampa недоступна'
      );
      return;
    }

    var type = mediaType(x);

    var movie = {
      id: id,
      title: x.title,
      name: x.title,
      media_type: type
    };

    var activity = {
      url: '',
      title: x.title,
      component: 'full',
      source: 'tmdb',
      method: type,
      id: id,
      card: movie,
      movie: movie,
      page: 1
    };

    try {
      if (
        Lampa.Select &&
        typeof Lampa.Select.hide === 'function'
      ) {
        Lampa.Select.hide();
      }
    } catch (e) {
      log(e);
    }

    setTimeout(function () {
      try {
        Lampa.Activity.push(activity);
      } catch (e) {
        log(e);

        notice(
          'Не вдалося відкрити картку: ' +
          e.message
        );
      }
    }, 180);
  }

  function findMovie(movie) {
    var type = mediaType(movie);

    return request(
      '/hls/api/lampa/find?' +
      params({
        tmdb: movie.id,
        imdb: movie.imdb_id,
        type: type,

        year: String(
          movie.release_date ||
          movie.first_air_date ||
          ''
        ).slice(0, 4),

        title:
          movie.title ||
          movie.name ||
          '',

        orig:
          movie.original_title ||
          movie.original_name ||
          ''
      })
    );
  }

  function checkCurrentMovie(movie) {
    loading(true);

    findMovie(movie)
      .then(function (data) {
        loading(false);

        select(
          'UA Search 0.7.4',

          [
            {
              title: 'UAKino',
              subtitle:
                data && data.found
                  ? 'Знайдено: ' +
                    (
                      data.title ||
                      movie.title ||
                      movie.name
                    )
                  : 'Не знайдено',
              action: 'found'
            },
            {
              title: 'Фільтри',
              action: 'filters'
            },
            {
              title: 'Каталог UAKino',
              action: 'catalog'
            }
          ],

          function (item) {
            if (item.action === 'filters') {
              return showFilters();
            }

            if (item.action === 'catalog') {
              return showCatalog();
            }

            if (item.action === 'found') {
              notice(
                data && data.found
                  ? 'Закрий меню та натисни ' +
                    'штатну кнопку UAKino на картці'
                  : 'Фільм відсутній у UAKino'
              );
            }
          }
        );
      })
      
