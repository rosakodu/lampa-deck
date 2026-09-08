(function () {
  'use strict';

  // ── Intercept localStorage.setItem ─────────────────────────────────────────
  try {
    var _origSetItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = function (key, val) {
      if ((key === 'player_nw_path' || key === 'player_path') && typeof val === 'string' && (val.indexOf('C:') !== -1 || val.indexOf('vlc.exe') !== -1 || val.indexOf('Program Files') !== -1)) {
        val = '/usr/bin/vlc';
      }
      return _origSetItem(key, val);
    };
  } catch (e) {}

  // ── DOM Observer to immediately fix any rendered Windows path on screen ────
  setInterval(function () {
    try {
      var elems = document.querySelectorAll('[data-name="player_nw_path"] .settings-param__value, [data-name="player_path"] .settings-param__value');
      for (var i = 0; i < elems.length; i++) {
        if (elems[i].textContent !== '/usr/bin/vlc') {
          elems[i].textContent = '/usr/bin/vlc';
        }
      }
    } catch (e) {}
  }, 100);

  // ── Pre-clean localStorage immediately ────────────────────────────────────
  try {
    var curNwPath = window.localStorage.getItem('player_nw_path') || '';
    if (!curNwPath || curNwPath.indexOf('C:') !== -1 || curNwPath.indexOf('vlc.exe') !== -1) {
      window.localStorage.setItem('player_nw_path', '/usr/bin/vlc');
      window.localStorage.setItem('player_path', '/usr/bin/vlc');
    }
  } catch (e) {}

  // ── Tiny JS logger → HTTP backend ─────────────────────────────────────────
  var _log = function (msg) {
    try { fetch('http://127.0.0.1:8300/log_js?msg=' + encodeURIComponent(msg)); } catch (e) {}
  };

  // ── Save current Lampa page URL every 3 s ─────────────────────────────────
  setInterval(function () {
    try {
      var u = window.location.href;
      if (u && u.indexOf('127.0.0.1:8300') !== -1) {
        fetch('http://127.0.0.1:8300/save_url?url=' + encodeURIComponent(u)).catch(function(){});
      }
    } catch (e) {}
  }, 3000);

  // ── 5. Enforce Russian locale and TorrServer defaults in localStorage ─────
  window.localStorage.setItem('platform', 'electron');
  window.localStorage.setItem('language', 'ru');
  window.localStorage.setItem('tmdb_lang', 'ru');
  window.localStorage.setItem('keyboard_default_lang', 'ru');

  window.localStorage.setItem('torrserver_url', 'http://127.0.0.1:8090');
  window.localStorage.setItem('torrserver_url_two', 'http://127.0.0.1:8090');
  window.localStorage.setItem('torrserver_use_link', 'one');
  window.localStorage.setItem('torrserver_gts', 'false');

  window.localStorage.setItem('parser_use', 'true');
  window.localStorage.setItem('parser_torrent_type', 'jackett');
  window.localStorage.setItem('parser_jackett_url', 'https://jac.red/');
  window.localStorage.setItem('jackett_url', 'https://jac.red');

  window.localStorage.setItem('player', 'inner');
  window.localStorage.setItem('player_torrent', 'inner');
  window.localStorage.setItem('player_iptv', 'inner');

  try {
    var curPlugs = window.localStorage.getItem('plugins');
    if (!curPlugs || curPlugs === '[]' || curPlugs === 'null') {
      window.localStorage.setItem('plugins', JSON.stringify([
        { url: 'https://plugin.rootu.top/tmdb.js', status: 1 },
        { url: 'http://cub.red/plugin/etor', status: 1 },
        { url: 'https://nb557.github.io/plugins/online_mod.js', status: 1 },
        { url: 'https://bylampa.github.io/jackett.js', status: 1 }
      ]));
    }
  } catch (e) {}

  // ── 6. Poll and update Lampa.Storage RAM cache as soon as Lampa is ready ──
  function fixStorage() {
    if (window.Lampa && window.Lampa.Storage && window.Lampa.Storage.set) {
      try {
        window.Lampa.Storage.set('language', 'ru');
        window.Lampa.Storage.set('tmdb_lang', 'ru');
        window.Lampa.Storage.set('keyboard_default_lang', 'ru');

        window.Lampa.Storage.set('torrserver_url', 'http://127.0.0.1:8090');
        window.Lampa.Storage.set('torrserver_url_two', 'http://127.0.0.1:8090');
        window.Lampa.Storage.set('torrserver_use_link', 'one');
        window.Lampa.Storage.set('torrserver_gts', 'false');

        window.Lampa.Storage.set('parser_use', 'true');
        window.Lampa.Storage.set('parser_torrent_type', 'jackett');
        window.Lampa.Storage.set('parser_jackett_url', 'https://jac.red/');
        window.Lampa.Storage.set('jackett_url', 'https://jac.red');

        window.Lampa.Storage.set('player', 'inner');
        window.Lampa.Storage.set('player_torrent', 'inner');
        window.Lampa.Storage.set('player_iptv', 'inner');

        var curPlugs = window.Lampa.Storage.get('plugins');
        if (!curPlugs || !curPlugs.length) {
          window.Lampa.Storage.set('plugins', [
            { url: 'https://plugin.rootu.top/tmdb.js', status: 1 },
            { url: 'http://cub.red/plugin/etor', status: 1 },
            { url: 'https://nb557.github.io/plugins/online_mod.js', status: 1 },
            { url: 'https://bylampa.github.io/jackett.js', status: 1 }
          ]);
        }

        var nwPath = window.Lampa.Storage.get('player_nw_path');
        if (!nwPath || nwPath.indexOf('C:') !== -1 || nwPath.indexOf('vlc.exe') !== -1) {
          window.Lampa.Storage.set('player_nw_path', '/usr/bin/vlc');
          window.Lampa.Storage.set('player_path', '/usr/bin/vlc');
        }
      } catch (e) {}
    } else {
      setTimeout(fixStorage, 50);
    }
  }
  fixStorage();

  // ── 7. Hook Lampa.Player.play ─────────────────────────────────────────────
  function hookPlayer() {
    if (!(window.Lampa && window.Lampa.Player && window.Lampa.Storage)) {
      setTimeout(hookPlayer, 200);
      return;
    }

    _log('[lampa-deck] Hooking Lampa.Player.play');

    var _origPlay = window.Lampa.Player.play.bind(window.Lampa.Player);

    window.Lampa.Player.play = function (data) {
      if (!data || !data.url) {
        return _origPlay(data);
      }

      var need = data.torrent_hash ? 'torrent' : '';
      var playerNeed = 'player' + (need ? '_' + need : '');
      var playerType = window.Lampa.Storage.get(playerNeed) ||
                       window.Lampa.Storage.field(playerNeed) || 'inner';

      // Launch external player if configured
      if (playerType === 'other' || playerType === 'vlc' || playerType === 'mpc') {
        var playerPath = window.Lampa.Storage.get('player_nw_path') || '/usr/bin/vlc';
        if (window.Lampa.Noty) window.Lampa.Noty.show('Запуск внешнего плеера...');
        fetch('http://127.0.0.1:8300/play?url=' + encodeURIComponent(data.url) +
              '&player=' + encodeURIComponent(playerPath))
          .catch(function(err) { console.error('[lampa-deck] Play fetch error:', err); });
        return;
      }

      // Preload TorrServer stream so buffering begins right away
      var streamUrl = data.url || '';
      var isTorr = streamUrl.indexOf('127.0.0.1:8090') !== -1 ||
                   streamUrl.indexOf('localhost:8090') !== -1;

      if (isTorr) {
        var preloadUrl = streamUrl.replace('&preload', '').replace('&play', '') + '&preload';
        try { fetch(preloadUrl).catch(function(){}); } catch(e){}
        if (window.Lampa.Noty) window.Lampa.Noty.show('Буферизация потока...');
      }

      // Built-in HTML5 video player plays the stream
      return _origPlay(data);
    };

    _log('[lampa-deck] Lampa.Player.play hooked successfully');
  }

  hookPlayer();

})();
