
(function () {
  'use strict';

  if (window.lampa_ua_search_v01) return;
  window.lampa_ua_search_v01 = true;

  var SOURCES = {
    uakino: {
      name: 'UAKino',
      url: 'https://uakino.me/'
    },
    toloka: {
      name: 'Toloka',
      url: 'https://toloka.to/'
    }
  };

  function notify(message) {
    if (window.Lampa && Lampa.Noty && Lampa.Noty.show) {
      Lampa.Noty.show(message);
    } else {
      console.log('[UA Search] ' + message);
    }
  }

  function openUrl(url) {
    try {
      if (
        window.Lampa &&
        Lampa.Utils &&
        typeof Lampa.Utils.openLink === 'function'
      ) {
        Lampa.Utils.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      notify('Не вдалося відкрити сайт: ' + url);
    }
  }

  function askAndSearch(source) {
    if (!Lampa.Input ||
        typeof Lampa.Input.edit !== 'function') {
      notify('Поле введення недоступне');
      return;
    }

    Lampa.Input.edit({
      title: 'Пошук: ' + source.name,
      value: '',
      free: true
    }, function (query) {
      query = String(query || '').trim();

      if (!query) return;

      notify(
        'Запит: ' + query +
        '. Відкриваємо ' + source.name
      );

      openUrl(source.url);
    });
  }

  function start() {
    if (!window.Lampa || !Lampa.SettingsApi) return;

    Lampa.SettingsApi.addComponent({
      component: 'ua_search',
      name: 'UA Search',
      icon: '<svg viewBox="0 0 24 24" ' +
        'width="24" height="24" fill="none" ' +
        'stroke="currentColor" stroke-width="2">' +
        '<circle cx="10" cy="10" r="7"/>' +
        '<path d="m15 15 6 6"/></svg>'
    });

    ['uakino', 'toloka'].forEach(function (key) {
      var source = SOURCES[key];

      Lampa.SettingsApi.addParam({
        component: 'ua_search',
        param: {
          name: 'ua_search_' + key,
          type: 'trigger',
          default: false
        },
        field: {
          name: 'Відкрити ' + source.name,
          description: 'Українське джерело'
        },
        onChange: function () {
          askAndSearch(source);
        }
      });
    });

    notify('UA Search 0.1 завантажено');
  }

  if (window.appready) {
    start();
  } else if (window.Lampa && Lampa.Listener) {
    Lampa.Listener.follow('app', function (event) {
      if (event.type === 'ready') {
        start();
      }
    });
  }
})();
