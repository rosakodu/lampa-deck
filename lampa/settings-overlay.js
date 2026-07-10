(function() {
  // Guarantee platform setting is stored
  window.localStorage.setItem('platform', 'electron');

  // Force default player settings to 'inner' (built-in) once on this version upgrade
  if (window.localStorage.getItem('player_v1_reset') !== 'true') {
    window.localStorage.setItem('player', 'inner');
    window.localStorage.setItem('player_torrent', 'inner');
    window.localStorage.setItem('player_iptv', 'inner');
    window.localStorage.setItem('player_v1_reset', 'true');
  }

  // Set default player path to VLC Flatpak for Steam Deck (since VLC is now the absolute default)
  const currentPath = window.localStorage.getItem('player_nw_path');
  if (!currentPath || currentPath.includes('.exe') || currentPath.includes(':/') || currentPath.includes(':\\') || currentPath === '/usr/bin/mpv') {
    window.localStorage.setItem('player_nw_path', 'flatpak run org.videolan.VLC');
  }

  // Force default Lampa configuration and plugins once on this version upgrade
  if (window.localStorage.getItem('settings_v1_reset') !== 'true') {
    // Connect to local TorrServer
    window.localStorage.setItem('torrserver_url', 'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_url_two', 'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_use_link', 'one');

    // Pre-configure the Jackett parser using the public jacred.ru proxy
    window.localStorage.setItem('parser_use', 'true');
    window.localStorage.setItem('parser_torrent_type', 'jackett');
    window.localStorage.setItem('parser_jackett_url', 'https://jacred.ru/');

    // Install critical plugins: TMDB proxy (bypasses blocks), etor (torrents), and online mod
    const defaultPlugins = [
      { url: 'https://plugin.rootu.top/tmdb.js', status: 1 },
      { url: 'http://cub.red/plugin/etor', status: 1 },
      { url: 'https://nb557.github.io/plugins/online_mod.js', status: 1 },
      { url: 'https://bylampa.github.io/jackett.js', status: 1 }
    ];
    window.localStorage.setItem('plugins', JSON.stringify(defaultPlugins));
    
    window.localStorage.setItem('settings_v1_reset', 'true');
  }

  let originalPlay = null;

  // Wait for Lampa object to become available
  function initLampaHook() {
    if (window.Lampa && window.Lampa.Player && window.Lampa.Storage) {
      console.log('Lampa object found! Hooking video player for Decky Loader iframe...');
      originalPlay = window.Lampa.Player.play;
      
      // Override Player.play
      window.Lampa.Player.play = function(data) {
        const need = data.torrent_hash ? 'torrent' : '';
        const playerNeed = 'player' + (need ? '_' + need : '');
        const playerType = window.Lampa.Storage.get(playerNeed) || window.Lampa.Storage.field(playerNeed) || 'inner';
        
        if (playerType === 'other' || playerType === 'vlc' || playerType === 'mpc') {
          // Read native player path from Lampa settings
          const playerPath = window.Lampa.Storage.get('player_nw_path') || window.Lampa.Storage.field('player_nw_path') || 'flatpak run org.videolan.VLC';
          
          console.log('Redirecting playback to Decky backend via postMessage:', playerType, playerPath, data.url);
          
          if (window.Lampa.Noty) {
            window.Lampa.Noty.show('Запуск внешнего плеера (' + playerType.toUpperCase() + ')...');
          }
          
          // Send request to the Python backend HTTP server play endpoint
          console.log('Sending play request to Python backend:', playerType, playerPath, data.url);
          fetch('/play?url=' + encodeURIComponent(data.url) + '&player=' + encodeURIComponent(playerPath))
            .catch(function(err) {
              console.error('Failed to trigger play on backend:', err);
            });
        } else {
          // Intercept TorrServer play URLs and rewrite them to use GStreamer HLS transcoding
          if (data.url && data.url.indexOf('/play/') !== -1) {
            const match = data.url.match(/\/play\/([a-fA-F0-9]+)\/(\d+)/);
            if (match) {
              const hash = match[1];
              const index = match[2];
              const hostMatch = data.url.match(/^(https?:\/\/[^\/]+)/);
              const host = hostMatch ? hostMatch[1] : 'http://127.0.0.1:8090';
              const newUrl = host + '/gst/' + hash + '/master.m3u8?index=' + index;
              console.log('Rewriting TorrServer play URL for GStreamer HLS transcoding:', data.url, '->', newUrl);
              data.url = newUrl;
            }
          }
          // Play using native Lampa player
          originalPlay.call(window.Lampa.Player, data);
        }
      };
    } else {
      setTimeout(initLampaHook, 100);
    }
  }

  // Initialize hook
  initLampaHook();
})();
