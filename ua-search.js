(function () {
  'use strict';
  var VERSION = '1.0.1';
  try {
    if (window.UA_SEARCH_DIAG_101) return;
    window.UA_SEARCH_DIAG_101 = true;
    console.log('[UA Search diagnostic ' + VERSION + '] JavaScript loaded');
    function start() {
      try {
        if (!window.Lampa) {
          console.log('[UA Search diagnostic] Lampa is not ready');
          return;
        }
        console.log('[UA Search diagnostic] Lampa detected');
        if (Lampa.Noty && typeof Lampa.Noty.show === 'function') {
          Lampa.Noty.show('UA Search 1.0.1: запуск успішний');
        }
      } catch (error) {
        console.error('[UA Search diagnostic] init:', error);
      }
    }
    if (window.Lampa) start();
    else {
      var attempts = 0;
      var interval = setInterval(function () {
        attempts++;
        if (window.Lampa || attempts >= 30) {
          clearInterval(interval);
          start();
        }
      }, 1000);
    }
  } catch (error) {
    console.error('[UA Search diagnostic] startup:', error);
  }
})();
