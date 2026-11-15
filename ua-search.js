
(function () {
  'use strict';

  var VERSION = '0.4.0';

  if (window.ua_search_v04) return;
  window.ua_search_v04 = true;

  var SOURCES = {
    toloka: {
      name: 'Toloka',
      base: 'https://toloka.to/',
      search: function (q) {
        return 'https://toloka.to/tracker.php?nm=' +
          encodeURIComponent(q);
      }
    },
    uakino: {
      name: 'UAKino',
      base: 'https://uakino.me/',
      search: function (q) {
        return 'https://uakino.me/index.php?do=search' +
          '&subaction=search&story=' +
          encodeURIComponent(q);
      }
    }
  };

  var lastQuery = 'Avatar';

  function notify(message) {
    console.log('[UA Search] ' + message);

    if (window.Lampa &&
        Lampa.Noty &&
        typeof Lampa.Noty.show === 'function') {
      Lampa.Noty.show(message);
    }
  }

  function openUrl(url) {
    try {
      if (Lampa.Platform &&
          typeof Lampa.Platform.openURL === 'function') {
        Lampa.Platform.openURL(url);
      } else if (Lampa.Utils &&
                 typeof Lampa.Utils.openLink === 'function') {
        Lampa.Utils.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      notify('Не вдалося відкрити браузер');
    }
  }

  function askQuery(callback) {
    if (!Lampa.Input ||
        typeof Lampa.Input.edit !== 'function') {
      notify('Введення недоступне');
      return;
    }

    Lampa.Input.edit({
      title: 'Пошук українською',
      value: lastQuery,
      free: true,
      nosave: true
    }, function (value) {
      var q = String(value || '').trim();

      if (!q) return;

      lastQuery = q;
      callback(q);
    });
  }

  function extractHtml(response) {
    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response.body === 'string') {
      return response.body;
    }

    if (response &&
        typeof response.responseText === 'string') {
      return response.responseText;
    }

    return '';
  }

  function parseResults(key, html) {
    var doc = new DOMParser().parseFromString(
      html, 'text/html'
    );

    var selectors = key === 'toloka'
      ? [
          'a[href*="viewtopic.php"]',
          'a.topictitle'
        ]
      : [
          '.shortstory a[href]',
          '.movie-item a[href]',
          '.movie a[href]',
          'a[href*="/filmy/"]',
          'a[href*="/serialy/"]'
        ];

    var results = [];
    var seen = {};

    selectors.forEach(function (selector) {
      var links = doc.querySelectorAll(selector);

      Array.prototype.forEach.call(links, function (a) {
        var title = String(
          a.getAttribute('title') ||
          a.textContent ||
          ''
        ).trim().replace(/\s+/g, ' ');

        var href = a.getAttribute('href');

        if (!href || title.length < 3) return;

        var url;

        try {
          url = new URL(
            href,
            SOURCES[key].base
          ).href;
        } catch (e) {
          return;
        }

        if (seen[url]) return;
        seen[url] = true;

        results.push({
          title: title,
          url: url
        });
      });
    });

    return results.slice(0, 30);
  }

  function showResults(key, results) {
    window.ua_search_results = results;

    notify(
      SOURCES[key].name +
      ': знайдено ' + results.length
    );

    if (!results.length) return;

    var items = results.map(function (r, i) {
      return {
        title: r.title,
        subtitle: r.url,
        index: i
      };
    });

    if (Lampa.Select &&
        typeof Lampa.Select.show === 'function') {
      Lampa.Select.show({
        title: SOURCES[key].name,
        items: items,
        onSelect: function (item) {
          var r = results[item.index];

          if (r) openUrl(r.url);
        },
        onBack: function () {
          if (Lampa.Controller) {
            Lampa.Controller.toggle('settings');
          }
        }
      });
    } else {
      notify('Список доступний лише через браузер');
      openUrl(results[0].url);
    }
  }

  function searchNative(key, query) {
    var source = SOURCES[key];
    var url = source.search(query);

    notify('Шукаємо: ' + source.name);

    if (!Lampa.Reguest) {
      notify('Native HTTP недоступний');
      openUrl(url);
      return;
    }

    var request = new Lampa.Reguest();

    if (typeof request.native !== 'function') {
      notify('Native HTTP недоступний');
      openUrl(url);
      return;
    }

    var finished = false;

    function fallback(message) {
      if (finished) return;
      finished = true;

      notify(source.name + ': ' + message);
      openUrl(url);
    }

    var timer = setTimeout(function () {
      fallback('таймаут, відкриваємо браузер');
    }, 20000);

    try {
      request.native(
        url,
        function (response) {
          if (finished) return;

          clearTimeout(timer);

          var html = extractHtml(response);
          var lower = html.toLowerCase();

          if (!html || html.length < 100) {
            fallback('порожня відповідь');
            return;
          }

          if (
            lower.indexOf('just a moment') !== -1 ||
            lower.indexOf('cf-challenge') !== -1 ||
            lower.indexOf('captcha') !== -1
          ) {
            fallback('CAPTCHA або захист сайту');
            return;
          }

          var results = parseResults(key, html);

          if (results.length) {
            finished = true;
            showResults(key, results);
          } else {
            fallback('результати не визначено');
          }
        },
        function (error) {
          clearTimeout(timer);

          console.error(
            '[UA Search] Native error',
            error
          );

          fallback('помилка HTTP');
        },
        false,
        {
          timeout: 20000
        }
      );
    } catch (e) {
      clearTimeout(timer);
      fallback('помилка: ' + e.message);
    }
  }

  function addParam(key, title, description, action) {
    Lampa.SettingsApi.addParam({
      component: 'ua_search',
      param: {
        name: 'ua04_' + key,
        type: 'trigger',
        default: false
      },
      field: {
        name: title,
        description: description
      },
      onChange: action
    });
  }

  function start() {
    if (!Lampa.SettingsApi ||
        !Lampa.SettingsApi.addComponent) return;

    Lampa.SettingsApi.addComponent({
      component: 'ua_search',
      name: 'UA Search',
      icon:
        '<svg viewBox="0 0 24 24" ' +
        'width="24" height="24" ' +
        'fill="none" stroke="currentColor" ' +
        'stroke-width="2">' +
        '<circle cx="10" cy="10" r="7"/>' +
        '<path d="m15 15 6 6"/></svg>'
    });

    ['toloka', 'uakino'].forEach(function (key) {
      var source = SOURCES[key];

      addParam(
        'search_' + key,
        'Пошук: ' + source.name,
        'Пошук без Jackett',
        function () {
          askQuery(function (q) {
            searchNative(key, q);
          });
        }
      );

      addParam(
        'browser_' + key,
        'Браузер: ' + source.name,
        'Відкрити пошук на сайті',
        function () {
          askQuery(function (q) {
            openUrl(source.search(q));
          });
        }
      );
    });

    addParam(
      'version',
      'Версія ' + VERSION,
      'UA Search без Jackett',
      function () {
        notify('UA Search ' + VERSION);
      }
    );

    notify('UA Search ' + VERSION + ' завантажено');
  }

  var started = false;

  function initialize() {
    if (started || !window.Lampa) return;

    started = true;

    try {
      start();
    } catch (e) {
      started = false;
      console.error('[UA Search]', e);
    }
  }

  if (window.appready) {
    initialize();
  } else if (window.Lampa &&
             Lampa.Listener &&
             Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') initialize();
    });
  }
})();
