(function () {
  'use strict';

  var VERSION = '0.2.0';

  if (window.lampa_ua_search_v02) return;
  window.lampa_ua_search_v02 = true;

  var SOURCES = {
    toloka: {
      name: 'Toloka',
      url: 'https://toloka.to/tracker.php?nm=Avatar'
    },
    uakino: {
      name: 'UAKino',
      url: 'https://uakino.me/'
    }
  };

  function notify(message) {
    console.log('[UA Search] ' + message);

    if (window.Lampa &&
        Lampa.Noty &&
        typeof Lampa.Noty.show === 'function') {
      Lampa.Noty.show(message);
    }
  }

  function diagnose(source, html, status) {
    var content = String(html || '').toLowerCase();

    if (status < 200 || status >= 300) {
      notify(source.name + ': HTTP ' + status);
      return;
    }

    if (!content || content.length < 100) {
      notify(source.name + ': порожня відповідь');
      return;
    }

    if (
      content.indexOf('cloudflare') !== -1 &&
      (content.indexOf('challenge') !== -1 ||
       content.indexOf('just a moment') !== -1)
    ) {
      notify(source.name + ': захист Cloudflare');
      return;
    }

    if (source.name === 'Toloka') {
      var hasTorrentRows =
        content.indexOf('torrow') !== -1 ||
        content.indexOf('tracker.php') !== -1 &&
        content.indexOf('download') !== -1;

      var hasLogin =
        content.indexOf('login.php') !== -1 ||
        content.indexOf('вхід') !== -1;

      if (hasTorrentRows) {
        notify('Toloka: HTML отримано, є ознаки релізів');
      } else if (hasLogin) {
        notify('Toloka: можливо, потрібна авторизація');
      } else {
        notify('Toloka: HTML отримано, релізи не визначено');
      }
    } else {
      notify(
        'UAKino: HTML отримано (' +
        content.length + ' символів)'
      );
    }
  }

  function testSource(key) {
    var source = SOURCES[key];

    if (!source) return;

    notify('Перевіряємо ' + source.name + '...');

    var xhr = new XMLHttpRequest();

    xhr.open('GET', source.url, true);
    xhr.timeout = 15000;
    xhr.withCredentials = false;

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;

      diagnose(
        source,
        xhr.responseText,
        xhr.status
      );
    };

    xhr.onerror = function () {
      notify(
        source.name +
        ': помилка мережі або CORS'
      );
    };

    xhr.ontimeout = function () {
      notify(
        source.name +
        ': час очікування вичерпано'
      );
    };

    try {
      xhr.send();
    } catch (error) {
      notify(
        source.name + ': ' + error.message
      );
    }
  }

  function start() {
    if (!window.Lampa ||
        !Lampa.SettingsApi ||
        typeof Lampa.SettingsApi.addComponent !== 'function' ||
        typeof Lampa.SettingsApi.addParam !== 'function') {
      console.error('[UA Search] SettingsApi unavailable');
      return;
    }

    Lampa.SettingsApi.addComponent({
      component: 'ua_search',
      name: 'UA Search',
      icon:
        '<svg viewBox="0 0 24 24" ' +
        'width="24" height="24" fill="none" ' +
        'stroke="currentColor" stroke-width="2">' +
        '<circle cx="10" cy="10" r="7"/>' +
        '<path d="m15 15 6 6"/></svg>'
    });

    Object.keys(SOURCES).forEach(function (key) {
      var source = SOURCES[key];

      Lampa.SettingsApi.addParam({
        component: 'ua_search',
        param: {
          name: 'ua_search_test_' + key,
          type: 'trigger',
          default: false
        },
        field: {
          name: 'Перевірити ' + source.name,
          description: 'Тест прямого HTTP-доступу'
        },
        onChange: function () {
          testSource(key);
        }
      });
    });

    Lampa.SettingsApi.addParam({
      component: 'ua_search',
      param: {
        name: 'ua_search_version',
        type: 'trigger',
        default: false
      },
      field: {
        name: 'Версія ' + VERSION,
        description: 'Діагностика українських джерел'
      },
      onChange: function () {
        notify('Lampa UA Search ' + VERSION);
      }
    });

    notify('UA Search ' + VERSION + ' завантажено');
  }

  var started = false;

  function initialize() {
    if (started) return;
    if (!window.Lampa || !Lampa.SettingsApi) return;

    started = true;
    start();
  }

  if (window.appready) {
    initialize();
  } else if (window.Lampa && Lampa.Listener) {
    Lampa.Listener.follow('app', function (event) {
      if (event.type === 'ready') {
        initialize();
      }
    });
  }
})();
