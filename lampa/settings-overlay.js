(function() {
  // Guarantee platform setting is stored
  window.localStorage.setItem('platform', 'electron');
  // Keep torrserver_gts=false — we handle GST manually with proper preload timing
  // (Lampa's auto-GST fires immediately without waiting for data → 502 error)
  window.localStorage.setItem('torrserver_gts', 'false');

  // Force default player settings to 'inner' (built-in) once on this version upgrade
  if (window.localStorage.getItem('player_v1_reset') !== 'true') {
    window.localStorage.setItem('player', 'inner');
    window.localStorage.setItem('player_torrent', 'inner');
    window.localStorage.setItem('player_iptv', 'inner');
    window.localStorage.setItem('player_v1_reset', 'true');
  }

  // Set default player path to VLC Flatpak for Steam Deck
  var currentPath = window.localStorage.getItem('player_nw_path');
  if (!currentPath || currentPath.includes('.exe') || currentPath.includes(':/') || currentPath.includes(':\\\\') || currentPath === '/usr/bin/mpv') {
    window.localStorage.setItem('player_nw_path', 'flatpak run org.videolan.VLC');
  }

  // Force default Lampa configuration and plugins once on first install
  if (window.localStorage.getItem('settings_v1_reset') !== 'true') {
    window.localStorage.setItem('torrserver_url', 'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_url_two', 'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_use_link', 'one');

    window.localStorage.setItem('parser_use', 'true');
    window.localStorage.setItem('parser_torrent_type', 'jackett');
    window.localStorage.setItem('parser_jackett_url', 'https://jacred.ru/');

    var defaultPlugins = [
      { url: 'https://plugin.rootu.top/tmdb.js', status: 1 },
      { url: 'http://cub.red/plugin/etor', status: 1 },
      { url: 'https://nb557.github.io/plugins/online_mod.js', status: 1 },
      { url: 'https://bylampa.github.io/jackett.js', status: 1 }
    ];
    window.localStorage.setItem('plugins', JSON.stringify(defaultPlugins));
    window.localStorage.setItem('settings_v1_reset', 'true');
  }

  var originalPlay = null;

  // Extract torrent hash and file index from a TorrServer /stream/ URL
  function parseTorrServerUrl(url) {
    try {
      var u = new URL(url);
      if (u.hostname !== '127.0.0.1' || u.port !== '8090') return null;
      if (u.pathname.indexOf('/stream') === -1) return null;
      var hash = u.searchParams.get('link');
      var index = u.searchParams.get('index') || '0';
      if (!hash) return null;
      return { hash: hash, index: index, host: u.origin };
    } catch(e) { return null; }
  }

  // Try to play via /gst/ HLS. If it fails, fall back to /stream/
  function playWithGst(data, parsed, originalData) {
    var gstUrl = parsed.host + '/gst/' + parsed.hash + '/master.m3u8?index=' + parsed.index + '&audio=0';
    // Quick probe: check if /gst/ is ready
    fetch(parsed.host + '/gst/' + parsed.hash + '/probe?index=' + parsed.index)
      .then(function(r) {
        if (r.ok) {
          console.log('[lampa-deck] GST probe OK, playing via HLS:', gstUrl);
          data.url = gstUrl;
          originalPlay.call(window.Lampa.Player, data);
        } else {
          console.log('[lampa-deck] GST probe failed (' + r.status + '), using /stream/ fallback');
          originalPlay.call(window.Lampa.Player, originalData);
        }
      })
      .catch(function() {
        console.log('[lampa-deck] GST probe error, using /stream/ fallback');
        originalPlay.call(window.Lampa.Player, originalData);
      });
  }

  // Preload torrent data, then try GST transcoding
  function preloadAndPlay(data) {
    var parsed = parseTorrServerUrl(data.url);
    if (!parsed) {
      originalPlay.call(window.Lampa.Player, data);
      return;
    }

    // Save original data (with /stream/ URL)
    var originalData = JSON.parse(JSON.stringify(data));

    console.log('[lampa-deck] Preloading torrent before GST playback...');
    if (window.Lampa && window.Lampa.Noty) {
      window.Lampa.Noty.show('Буферизация...');
    }

    // Start preload
    var preloadUrl = parsed.host + '/stream?link=' + parsed.hash + '&index=' + parsed.index + '&preload';
    fetch(preloadUrl).catch(function(){});

    // Poll torrent stat until we have some data downloaded (max 15 sec)
    var attempts = 0;
    var maxAttempts = 30; // 30 * 500ms = 15 sec

    function checkAndPlay() {
      attempts++;
      fetch(parsed.host + '/torrents', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'get', hash: parsed.hash})
      })
      .then(function(r) { return r.json(); })
      .then(function(stat) {
        var loaded = stat.preloaded_bytes || stat.bytes_read_useful_data || 0;
        var preloadSize = stat.preload_size || 10000000; // default 10MB
        var progress = preloadSize > 0 ? (loaded / preloadSize * 100) : 0;
        console.log('[lampa-deck] Preload progress: ' + loaded + ' / ' + preloadSize + ' (' + progress.toFixed(1) + '%)');

        // Need at least 3MB or 5% preloaded for gst-discoverer to work
        if (loaded >= 3145728 || progress >= 5 || attempts >= maxAttempts) {
          if (attempts >= maxAttempts) {
            console.log('[lampa-deck] Preload timeout - trying /stream/ directly');
            originalPlay.call(window.Lampa.Player, originalData);
          } else {
            console.log('[lampa-deck] Preload ready (' + loaded + ' bytes), starting GST');
            playWithGst(data, parsed, originalData);
          }
        } else {
          setTimeout(checkAndPlay, 500);
        }
      })
      .catch(function() {
        // If stat fails, just try playing
        originalPlay.call(window.Lampa.Player, originalData);
      });
    }

    // Start checking after initial 1 second
    setTimeout(checkAndPlay, 1000);
  }

  // Wait for Lampa object to become available
  function initLampaHook() {
    if (window.Lampa && window.Lampa.Player && window.Lampa.Storage) {
      console.log('[lampa-deck] Lampa found, hooking player...');
      originalPlay = window.Lampa.Player.play;

      window.Lampa.Player.play = function(data) {
        var need = data.torrent_hash ? 'torrent' : '';
        var playerNeed = 'player' + (need ? '_' + need : '');
        var playerType = window.Lampa.Storage.get(playerNeed) || window.Lampa.Storage.field(playerNeed) || 'inner';

        if (playerType === 'other' || playerType === 'vlc' || playerType === 'mpc') {
          var playerPath = window.Lampa.Storage.get('player_nw_path') || 'flatpak run org.videolan.VLC';
          if (window.Lampa.Noty) window.Lampa.Noty.show('Запуск VLC...');
          fetch('/play?url=' + encodeURIComponent(data.url) + '&player=' + encodeURIComponent(playerPath))
            .catch(function(err) { console.error('[lampa-deck] Play fetch error:', err); });
        } else {
          // Check if it's a TorrServer /stream/ URL → use GST transcoding with preload
          var parsed = parseTorrServerUrl(data.url);
          if (parsed) {
            preloadAndPlay(data);
          } else {
            originalPlay.call(window.Lampa.Player, data);
          }
        }
      };
    } else {
      setTimeout(initLampaHook, 100);
    }
  }

  initLampaHook();
})();
