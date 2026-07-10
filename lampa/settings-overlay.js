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

  // Set default TorrServer URLs so Lampa connects to the local TorrServer instance
  if (!window.localStorage.getItem('torrserver_url')) {
    window.localStorage.setItem('torrserver_url', 'http://127.0.0.1:8090');
  }
  if (!window.localStorage.getItem('torrserver_url_two')) {
    window.localStorage.setItem('torrserver_url_two', 'http://127.0.0.1:8090');
  }
  if (!window.localStorage.getItem('torrserver_use_link')) {
    window.localStorage.setItem('torrserver_use_link', 'one');
  }

  // Enable Lampa's built-in torrent parser setting
  if (window.localStorage.getItem('parser_use') === null) {
    window.localStorage.setItem('parser_use', 'true');
  }

  // Pre-load standard plugins (TorrServer Parser and VOD Streams) if no plugins are configured yet
  if (!window.localStorage.getItem('plugins')) {
    const defaultPlugins = [
      { url: 'http://cub.red/plugin/etor', status: 1 },
      { url: 'https://nb557.github.io/plugins/online_mod.js', status: 1 }
    ];
    window.localStorage.setItem('plugins', JSON.stringify(defaultPlugins));
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
