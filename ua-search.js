
(function () {
  'use strict';

  var VERSION = '0.5.0';
  if (window.ua_search_v05) return;
  window.ua_search_v05 = true;

  var SOURCES = {
    uakino: {
      name: 'UAKino',
      base: 'https://uakino.me/',
      search: function (q) {
        return 'https://uakino.me/index.php?do=search&subaction=search&story=' +
          encodeURIComponent(q);
      }
    },
    toloka: {
      name: 'Toloka',
      base: 'https://toloka.to/',
      search: function (q) {
        return 'https://toloka.to/tracker.php?nm=' +
          encodeURIComponent(q);
      }
    }
  };

  var lastQuery = 'Avatar';
  var lastResults = [];
  var lastError = '';

  function note(s) {
    console.log('[UA Search 0.5] ' + s);

    if (window.Lampa &&
        Lampa.Noty &&
        Lampa.Noty.show) {
      Lampa.Noty.show(s);
    }
  }

  function input(callback) {
    if (!Lampa.Input || !Lampa.Input.edit) {
      return note('Lampa.Input недоступний');
    }

    Lampa.Input.edit({
      title: 'Назва фільму або серіалу',
      value: lastQuery,
      free: true
    }, function (value) {
      var q = String(value || '').trim();

      if (q) {
        lastQuery = q;
        callback(q);
      }
    });
  }

  function normalize(data) {
    if (typeof data === 'string') return data;

    if (data &&
        typeof data.responseText === 'string') {
      return data.responseText;
    }

    if (data && typeof data.body === 'string') {
      return data.body;
    }

    if (data && typeof data.data === 'string') {
      return data.data;
    }

    return '';
  }

  function parse(key, html) {
    var doc = new DOMParser().parseFromString(
      html,
      'text/html'
    );

    var selectors = key === 'uakino'
      ? '.movie-item a[href], ' +
        '.shortstory a[href], ' +
        '.shortstory-title a[href], ' +
        '.movie-title a[href], ' +
        'a[href*="/filmy/"], ' +
        'a[href*="/serialy/"]'
      : 'a[href*="viewtopic.php"]';

    var anchors = doc.querySelectorAll(selectors);
    var seen = {};
    var result = [];

    Array.prototype.forEach.call(
      anchors,
      function (a) {
        var title = (
          a.getAttribute('title') ||
          a.textContent ||
          ''
        ).replace(/\s+/g, ' ').trim();

        var href = a.getAttribute('href');

        if (!href || title.length < 3) return;

        try {
          var url = new URL(
            href,
            SOURCES[key].base
          );

          if (
            url.protocol !== 'https:' ||
            url.hostname !==
              new URL(SOURCES[key].base).hostname
          ) return;

          if (seen[url.href]) return;

          seen[url.href] = true;

          result.push({
            title: title,
            url: url.href
          });
        } catch (e) {}
      }
    );

    return result.slice(0, 40);
  }

  function inspect(key, html) {
    var lower = html.toLowerCase();

    if (!html || html.length < 100) {
      return 'Порожня HTTP-відповідь';
    }

    if (
      /just a moment|cf-challenge|cf-turnstile|captcha/
        .test(lower)
    ) {
      return 'Захист CAPTCHA / Cloudflare';
    }

    if (
      key === 'toloka' &&
      /login\.php|name="username"|name="password"/
        .test(lower) &&
      !/viewtopic\.php/.test(lower)
    ) {
      return 'Потрібна авторизація Toloka';
    }

    return '';
  }

  function show(key, results) {
    lastResults = results;

    if (!results.length) {
      return note('Результатів не знайдено');
    }

    if (!Lampa.Select || !Lampa.Select.show) {
      return note(
        'Lampa.Select недоступний; результатів: ' +
        results.length
      );
    }

    var items = results.map(function (r, i) {
      return {
        title: r.title,
        subtitle: SOURCES[key].name,
        index: i
      };
    });

    Lampa.Select.show({
      title: SOURCES[key].name + ': ' +
        results.length,
      items: items,
      onSelect: function (item) {
        var r = results[item.index];

        if (r) {
          note(
            'Знайдено: ' + r.title +
            '. Відтворення ще не реалізовано.'
          );
        }
      },
      onBack: function () {
        if (
          Lampa.Controller &&
          Lampa.Controller.toggle
        ) {
          Lampa.Controller.toggle('settings');
        }
      }
    });
  }

  function fetchSource(key, query) {
    var url = SOURCES[key].search(query);

    note('Пошук ' + SOURCES[key].name + '...');

    var done = false;

    var timer = setTimeout(function () {
      finishError('Таймаут 20 секунд');
    }, 20000);

    function finishError(message) {
      if (done) return;

      done = true;
      clearTimeout(timer);

      lastError = SOURCES[key].name +
        ': ' + message;

      note(lastError);
    }

    function success(data) {
      if (done) return;

      var html = normalize(data);
      var issue = inspect(key, html);

      if (issue) {
        return finishError(issue);
      }

      var results;

      try {
        results = parse(key, html);
      } catch (e) {
        return finishError(
          'Помилка HTML-парсера: ' + e.message
        );
      }

      if (!results.length) {
        return finishError(
          'HTML отримано (' +
          html.length +
          ' символів), але релізи не визначено'
        );
      }

      done = true;
      clearTimeout(timer);

      lastError = '';
      show(key, results);
    }

    function fail(error) {
      var message = error && (
        error.statusText ||
        error.message ||
        error.status
      );

      finishError(
        'HTTP-помилка ' +
        (message || 'без деталей')
      );
    }

    try {
      if (
        Lampa.Network &&
        typeof Lampa.Network.silent === 'function'
      ) {
        Lampa.Network.silent(
          url,
          success,
          fail
        );
      } else if (
        typeof Lampa.Reguest === 'function'
      ) {
        var req = new Lampa.Reguest();

        if (typeof req.native !== 'function') {
          return finishError(
            'Немає HTTP-методу'
          );
        }

        req.native(
          url,
          success,
          fail,
          false,
          { timeout: 20000 }
        );
      } else {
        finishError(
          'Мережевий API Lampa недоступний'
        );
      }
    } catch (e) {
      finishError(
        'Виняток: ' + e.message
      );
    }
  }

  function param(id, title, desc, action) {
    Lampa.SettingsApi.addParam({
      component: 'ua_search',
      param: {
        name: 'ua05_' + id,
        type: 'trigger',
        default: false
      },
      field: {
        name: title,
        description: desc
      },
      onChange: action
    });
  }

  function start() {
    if (
      !Lampa.SettingsApi ||
      !Lampa.SettingsApi.addComponent ||
      !Lampa.SettingsApi.addParam
    ) return;

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

    param(
      'uakino',
      'Пошук UAKino',
      'Спроба пошуку в Lampa без браузера',
      function () {
        input(function (q) {
          fetchSource('uakino', q);
        });
      }
    );

    param(
      'toloka',
      'Діагностика Toloka',
      'Перевірка доступу без Jackett',
      function () {
        input(function (q) {
          fetchSource('toloka', q);
        });
      }
    );

    param(
      'error',
      'Остання помилка',
      'Показати результат діагностики',
      function () {
        note(
          lastError ||
          'Помилок ще немає; останніх результатів: ' +
          lastResults.length
        );
      }
    );

    param(
      'version',
      'Версія ' + VERSION,
      'Без автоматичного відкриття браузера',
      function () {
        note('UA Search ' + VERSION);
      }
    );

    note('UA Search ' + VERSION + ' завантажено');
  }

  var started = false;

  function init() {
    if (
      started ||
      !window.Lampa ||
      !Lampa.SettingsApi
    ) return;

    try {
      start();
      started = true;
    } catch (e) {
      console.error('[UA Search]', e);
    }
  }

  if (window.appready) {
    init();
  } else if (
    window.Lampa &&
    Lampa.Listener &&
    Lampa.Listener.follow
  ) {
    Lampa.Listener.follow(
      'app',
      function (e) {
        if (e.type === 'ready') init();
      }
    );
  }
})();
