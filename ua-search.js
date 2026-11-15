
(function () {
  'use strict';

  var VERSION = '0.6';
  var API = 'https://uakino.ax';
  var TOLOKA = 'https://toloka.to';
  var TIMEOUT = 20000;

  if (window.LampaUASearch06) return;
  window.LampaUASearch06 = true;

  var cache = {};
  var categories = [
    ['new', 'Новинки'],
    ['films', 'Фільми'],
    ['series', 'Серіали'],
    ['cartoons', 'Мультфільми'],
    ['anime', 'Аніме'],
    ['4k', '4K']
  ];

  function notify(message) {
    try {
      Lampa.Noty.show('UA Search: ' + message);
    } catch (e) {
      console.log('[UA Search]', message);
    }
  }

  function log() {
    try {
      console.log.apply(console, ['[UA Search 0.6]'].concat(
        Array.prototype.slice.call(arguments)
      ));
    } catch (e) {}
  }

  function request(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var finished = false;

      function fail(message) {
        if (finished) return;
        finished = true;
        reject(new Error(message));
      }

      xhr.open('GET', url, true);
      xhr.timeout = TIMEOUT;

      xhr.onload = function () {
        if (finished) return;
        finished = true;

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }

        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new Error('Некоректна JSON-відповідь'));
        }
      };

      xhr.onerror = function () {
        fail('Мережева помилка або CORS');
      };

      xhr.ontimeout = function () {
        fail('Таймаут 20 секунд');
      };

      xhr.onabort = function () {
        fail('Запит скасовано');
      };

      try {
        xhr.send();
      } catch (e) {
        fail(e.message || 'Помилка запиту');
      }
    });
  }

  function params(obj) {
    return Object.keys(obj).filter(function (key) {
      return obj[key] !== undefined &&
             obj[key] !== null &&
             obj[key] !== '';
    }).map(function (key) {
      return encodeURIComponent(key) + '=' +
             encodeURIComponent(obj[key]);
    }).join('&');
  }

  function searchUAKino(movie) {
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

    var url = API + '/hls/api/lampa/find?' + params({
      tmdb: movie.id,
      imdb: movie.imdb_id,
      type: isTV ? 'tv' : 'movie',
      year: date.slice(0, 4),
      title: title,
      orig: original
    });

    log('UAKino find:', url);

    return request(url).then(function (data) {
      log('UAKino response:', data);

      if (!data || !data.found || !data.movie_id) {
        return {
          found: false,
          source: 'UAKino',
          message: 'Не знайдено'
        };
      }

      return {
        found: true,
        source: 'UAKino',
        title: data.title || title,
        movie_id: data.movie_id,
        data: data
      };
    });
  }

  function catalogUAKino(category, page) {
    var url = API + '/hls/api/lampa/list?' + params({
      cat: category || 'new',
      page: page || 1,
      limit: 30
    });

    return request(url).then(function (data) {
      return data && data.results ? data.results : [];
    });
  }

  function searchToloka(movie) {
    // Toloka вимагає сесію користувача.
    // Звичайний XHR не обходить CAPTCHA або CORS.
    // Не повертаємо фальшивих результатів.
    return Promise.resolve({
      found: false,
      source: 'Toloka',
      restricted: true,
      message: 'Потрібен авторизований API або проксі'
    });
  }

  function loading(start) {
    try {
      if (start) {
        Lampa.Loading.start(function () {
          Lampa.Loading.stop();
        });
      } else {
        Lampa.Loading.stop();
      }
    } catch (e) {}
  }

  function select(title, items, callback) {
    Lampa.Select.show({
      title: title,
      items: items,
      onSelect: callback,
      onBack: function () {
        try {
          Lampa.Controller.toggle('full_start');
        } catch (e) {}
      }
    });
  }

  function openOfficial(movie) {
    // Використовуємо встановлений офіційний
    // плагін UAKino для відкриття відео.
    var button = document.querySelector(
      '.view--uakino:not(.view--ua-search)'
    );

    if (button) {
      try {
        $(button).trigger('hover:enter');
        return;
      } catch (e) {}
    }

    notify('Для перегляду встановіть офіційний плагін UAKino');
  }

  function showMovieResults(movie) {
    loading(true);

    Promise.all([
      searchUAKino(movie).catch(function (e) {
        return {
          found: false,
          source: 'UAKino',
          error: e.message
        };
      }),
      searchToloka(movie)
    ]).then(function (results) {
      loading(false);

      var items = results.map(function (r) {
        return {
          title: r.source,
          subtitle: r.found
            ? 'Знайдено: ' + r.title
            : (r.error || r.message || 'Не знайдено'),
          result: r
        };
      });

      select('UA Search 0.6', items, function (item) {
        var r = item.result;

        if (r.found && r.source === 'UAKino') {
          openOfficial(movie);
        } else {
          notify(r.error || r.message || 'Результатів немає');
        }
      });
    });
  }

  function openCatalogItem(item) {
    try {
      var movie = {
        id: item.id,
        title: item.title || item.name,
        name: item.is_series
          ? (item.title || item.name)
          : undefined,
        original_title: item.original_title ||
                        item.original,
        original_name: item.original_name ||
                       item.original,
        release_date: item.year
          ? String(item.year) + '-01-01'
          : '',
        first_air_date: item.is_series && item.year
          ? String(item.year) + '-01-01'
          : ''
      };

      showMovieResults(movie);
    } catch (e) {
      notify(e.message);
    }
  }

  function showCatalog(category, page) {
    loading(true);

    catalogUAKino(category, page).then(function (results) {
      loading(false);

      if (!results.length) {
        notify('Каталог порожній');
        return;
      }

      var items = results.map(function (item) {
        return {
          title: item.title || item.name || 'Без назви',
          subtitle: [
            item.year || '',
            item.quality || ''
          ].filter(Boolean).join(' · '),
          movie: item
        };
      });

      items.push({
        title: 'Наступна сторінка',
        next: true
      });

      select('UAKino · сторінка ' + page, items, function (item) {
        if (item.next) {
          showCatalog(category, page + 1);
        } else {
          openCatalogItem(item.movie);
        }
      });
    }).catch(function (e) {
      loading(false);
      notify('UAKino: ' + e.message);
    });
  }

  function showCategories() {
    select('Каталог UAKino', categories.map(function (c) {
      return {
        title: c[1],
        category: c[0]
      };
    }), function (item) {
      showCatalog(item.category, 1);
    });
  }

  function testConnection() {
    loading(true);

    request(API + '/hls/api/lampa/list?cat=new&page=1&limit=1')
      .then(function (data) {
        loading(false);
        notify(
          data && data.results
            ? 'UAKino API працює'
            : 'API відповідає, але немає результатів'
        );
      })
      .catch(function (e) {
        loading(false);
        notify('Тест API: ' + e.message);
      });
  }

  function addButton(e) {
    if (!e || !e.object || !e.data || !e.data.movie) {
      return;
    }

    var render = e.object.activity.render();

    if (render.find('.view--ua-search').length) return;

    var button = $(
      '<div class="full-start__button selector view--ua-search">' +
        '<span>UA Search</span>' +
      '</div>'
    );

    button.on('hover:enter', function () {
      showMovieResults(e.data.movie);
    });

    var anchor = render.find('.view--torrent');

    if (anchor.length) {
      anchor.after(button);
    } else {
      render.find(
        '.full-start-new__buttons, .full-start__buttons'
      ).first().append(button);
    }
  }

  function registerSettings() {
    if (!Lampa.SettingsApi ||
        !Lampa.SettingsApi.addParam) return;

    try {
      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
          name: 'ua_search_catalog_06',
          type: 'trigger',
          default: false
        },
        field: {
          name: 'UA Search 0.6 · Каталог UAKino',
          description: 'Переглянути каталог без Jackett'
        },
        onChange: showCategories
      });

      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
          name: 'ua_search_test_06',
          type: 'trigger',
          default: false
        },
        field: {
          name: 'UA Search 0.6 · Тест API',
          description: 'Перевірити доступність UAKino'
        },
        onChange: testConnection
      });
    } catch (e) {
      log('Settings error:', e.message);
    }
  }

  function init() {
    if (!window.Lampa ||
        !Lampa.Listener ||
        !Lampa.Select) {
      setTimeout(init, 500);
      return;
    }

    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') {
        try {
          addButton(e);
        } catch (err) {
          log('Button error:', err);
        }
      }
    });

    registerSettings();

    // Доступ для діагностики в консолі.
    window.LampaUASearch = {
      version: VERSION,
      search: searchUAKino,
      catalog: showCategories,
      test: testConnection,
      toloka: searchToloka
    };

    log('Plugin initialized');
    notify('Версія 0.6 завантажена');
  }

  init();
})();
