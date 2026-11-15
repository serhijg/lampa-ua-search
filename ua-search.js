
(function () {
  'use strict';

  var VERSION = '0.7.9';
  var BASE = 'https://uakino.ax';
  var TIMEOUT = 20000;
  var attempts = 0;
  var initialized = false;

  function log(message, error) {
    try {
      console.log('[UA Search ' + VERSION + '] ' + message, error || '');
    } catch (e) {}
  }

  function notify(message) {
    try {
      if (window.Lampa && Lampa.Noty) {
        Lampa.Noty.show('UA Search: ' + message);
      }
    } catch (e) {
      log('Notification error', e);
    }
  }

  function request(path, callback) {
    var xhr = new XMLHttpRequest();

    xhr.open('GET', BASE + path, true);
    xhr.timeout = TIMEOUT;

    xhr.onload = function () {
      if (xhr.status !== 200) {
        callback('HTTP ' + xhr.status);
        return;
      }

      try {
        callback(null, JSON.parse(xhr.responseText));
      } catch (e) {
        callback('Invalid JSON');
      }
    };

    xhr.onerror = function () {
      callback('Network / CORS error');
    };

    xhr.ontimeout = function () {
      callback('Timeout 20 seconds');
    };

    xhr.send();
  }

  function testAPI() {
    notify('Перевірка API UAKino...');

    try {
      request(
        '/hls/api/lampa/list?cat=new&page=1&limit=30',
        function (error, data) {
          if (error) {
            notify(error);
            return;
          }

          var count = data && data.results
            ? data.results.length
            : 0;

          notify('API OK: ' + count + ' результатів');
        }
      );
    } catch (e) {
      notify('API error: ' + e.message);
    }
  }

  function openMenu() {
    try {
      Lampa.Select.show({
        title: 'UA Search ' + VERSION,
        items: [
          {
            title: 'Перевірити API UAKino',
            action: 'test'
          },
          {
            title: 'Версія плагіна',
            action: 'version'
          }
        ],
        onSelect: function (item) {
          if (item.action === 'test') {
            testAPI();
          }

          if (item.action === 'version') {
            notify(VERSION + ' Safe Mode');
          }
        },
        onBack: function () {}
      });
    } catch (e) {
      log('Menu error', e);
      notify('Menu error: ' + e.message);
    }
  }

  function init() {
    if (initialized) return;

    if (
      !window.Lampa ||
      !Lampa.SettingsApi ||
      !Lampa.Select ||
      typeof Lampa.SettingsApi.addParam !== 'function'
    ) {
      attempts++;

      if (attempts < 60) {
        setTimeout(init, 500);
      }

      return;
    }

    initialized = true;

    try {
      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
          name: 'ua_search_079_open',
          type: 'trigger',
          default: false
        },
        field: {
          name: 'UA Search 0.7.9',
          description: 'Safe Mode / API Test'
        },
        onChange: openMenu
      });

      window.LampaUASearch = {
        version: VERSION,
        open: openMenu,
        test: testAPI
      };

      log('Plugin initialized');
      notify('0.7.9 завантажено');
    } catch (e) {
      log('Initialization error', e);
      notify('Init error: ' + e.message);
    }
  }

  try {
    init();
  } catch (e) {
    log('Fatal error', e);
  }
})();
