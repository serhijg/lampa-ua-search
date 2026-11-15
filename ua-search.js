
(function () {
  'use strict';

  var VERSION = '0.3.0';

  if (window.lampa_ua_search_v03) return;
  window.lampa_ua_search_v03 = true;

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

  function diagnose(source, response) {
    var html = '';

    if (typeof response === 'string') {
      html = response;
    } else if (response && response.responseText) {
      html = response.responseText;
    } else if (response && response.body) {
      html = response.body;
    }

    html = String(html || '');
    var content = html.toLowerCase();

    if (!content || content.length < 100) {
      notify(source.name + ': порожня відповідь');
      return;
    }

    if (
      content.indexOf('cloudflare') !== -1 &&
      (
        content.indexOf('challenge') !== -1 ||
        content.indexOf('just a moment') !== -1
      )
    ) {
      notify(source.name + ': Cloudflare / CAPTCHA');
      return;
    }

    if (source.name === 'Toloka') {
      var hasRows =
        content.indexOf('torrow') !== -1 ||
        (
          content.indexOf('tracker.php') !== -1 &&
          content.indexOf('download') !== -1
        );

      var hasLogin =
        content.indexOf('login.php') !== -1 ||
        content.indexOf('вхід') !== -1;

      if (hasRows) {
        notify('Toloka: HTML отримано, є ознаки релізів');
      } else if (hasLogin) {
        notify('Toloka: можливо, потрібна авторизація');
      } else {
        notify(
          'Toloka: HTML отримано (' +
          html.length + ' символів)'
        );
      }
    } else {
      notify(
        'UAKino: HTML отримано (' +
        html.length + ' символів)'
      );
    }
  }

  function testSource(key) {
    var source = SOURCES[key];

    if (!source) return;

    notify('Native тест: ' + source.name);

    if (
      !window.Lampa ||
      typeof Lampa.Reguest !== 'function'
    ) {
      notify('Lampa.Reguest недоступний');
      return;
    }

    var request;

    try {
      request = new Lampa.Reguest();

      if (typeof request.native !== 'function') {
        notify('Native HTTP недоступний');
        return;
      }

      request.native(
        source.url,
        function (response) {
          diagnose(source, response);
        },
        function (error) {
          var message = '';

          if (typeof error === 'string') {
            message = error;
          } else if (error) {
            message =
              error.statusText ||
              error.message ||
              String(error.status || 'невідома');
          }

          notify(
            source.name +
            ': помилка Native HTTP: ' +
            message
          );
        },
        false,
        {
          timeout: 25000
        }
      );
    } catch (error) {
      notify(
        source.name +
        ': ' + error.message
      );
    }
  }

  function start() {
    if (
      !window.Lampa ||
      !Lampa.SettingsApi ||
      typeof Lampa.SettingsApi.addComponent !== 'function' ||
      typeof Lampa.SettingsApi.addParam !== 'function'
    ) {
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
          name: 'Native тест: ' + source.name,
          description: 'Перевірка прямого доступу без Jackett'
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
        description: 'Діагностика Native HTTP'
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

    if (!window.Lampa || !Lampa.SettingsApi) {
      return;
    }

    started = true;
    start();
  }

  if (window.appready) {
    initialize();
  } else if (
    window.Lampa &&
    Lampa.Listener &&
    typeof Lampa.Listener.follow === 'function'
  ) {
    Lampa.Listener.follow('app', function (event) {
      if (event.type === 'ready') {
        initialize();
      }
    });
  }
})();
