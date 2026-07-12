(function() {
  // Hook HTMLMediaElement.src to handle dynamic source swapping (e.g. ad plugins)
  try {
    var originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (originalSrcDescriptor && originalSrcDescriptor.configurable) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get: function() {
          return originalSrcDescriptor.get.call(this);
        },
        set: function(val) {
          var video = this;
          
          // Debug logs for events
          if (!video._hasLoggedEvents) {
            video._hasLoggedEvents = true;
            var events = ['play', 'playing', 'pause', 'waiting', 'stalled', 'error', 'ended', 'loadstart', 'loadedmetadata', 'canplay'];
            events.forEach(function(evt) {
              video.addEventListener(evt, function() {
                console.log('[lampa-deck-video]', evt, 'paused:', video.paused, 'src:', video.src, 'readyState:', video.readyState);
              });
            });
          }

          if (typeof val === 'string' && val.indexOf('/hls/master.m3u8') > -1) {
            console.log('[lampa-deck] Intercepted video.src setter to HLS URL:', val);
            if (video.hlsInstance) {
              video.hlsInstance.destroy();
              delete video.hlsInstance;
            }
            setTimeout(function() {
              if (window.Hls && window.Hls.isSupported()) {
                console.log('[lampa-deck] Dynamic HLS binding after source change');
                var hls = new window.Hls({
                  maxMaxBufferLength: 20
                });
                hls.loadSource(val);
                hls.attachMedia(video);
                video.hlsInstance = hls;
                
                hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
                  console.log('[lampa-deck] Dynamic HLS playing...');
                  if (window.isAutomatedTest) {
                    video.muted = true;
                  }
                  video.play().catch(function(e){});
                });
                
                hls.on(window.Hls.Events.ERROR, function(event, data) {
                  console.warn('[lampa-deck] HLS error:', data.details, 'fatal:', data.fatal);
                  if (data.fatal) {
                    switch (data.type) {
                      case window.Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                      case window.Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                      default:
                        break;
                    }
                  }
                });
                
                // Add play event listener to force load segment if play is clicked
                video.addEventListener('play', function() {
                  if (video.hlsInstance) {
                    console.log('[lampa-deck] Video play triggered, calling startLoad()');
                    video.hlsInstance.startLoad();
                  }
                });
              } else {
                originalSrcDescriptor.set.call(video, val);
              }
            }, 0);
          } else {
            if (video.hlsInstance) {
              console.log('[lampa-deck] Destroying dynamic HLS for non-HLS src:', val);
              video.hlsInstance.destroy();
              delete video.hlsInstance;
            }
            originalSrcDescriptor.set.call(video, val);
          }
        }
      });
      console.log('[lampa-deck] Prototype src descriptor hooked');
    }
  } catch (e) {
    console.error('[lampa-deck] Error hooking src:', e);
  }

  // Guarantee platform setting is stored
  window.localStorage.setItem('platform', 'electron');
  // Keep torrserver_gts=false — we handle transcoding ourselves with preload.
  // (Lampa's auto-GST fires immediately without waiting for data → 502 error)
  window.localStorage.setItem('torrserver_gts', 'false');

  // Force default player settings to 'inner' (built-in) once on this version upgrade
  if (window.localStorage.getItem('player_v2_reset') !== 'true') {
    window.localStorage.setItem('player', 'inner');
    window.localStorage.setItem('player_torrent', 'inner');
    window.localStorage.setItem('player_iptv', 'inner');
    // Prefer program HLS (hls.js) for our transcoder playlists
    window.localStorage.setItem('player_hls_method', 'hlsjs');
    window.localStorage.setItem('player_v2_reset', 'true');
  }

  // External player path: prefer host mpv/vlc if present later; no Flatpak default
  var currentPath = window.localStorage.getItem('player_nw_path');
  if (!currentPath || currentPath.includes('.exe') || currentPath.includes(':/') ||
      currentPath.includes(':\\\\') || currentPath.indexOf('flatpak') !== -1) {
    window.localStorage.setItem('player_nw_path', 'mpv');
  }

  // Force default Lampa TorrServer configuration once on first install
  if (window.localStorage.getItem('settings_v1_reset') !== 'true') {
    window.localStorage.setItem('torrserver_url', 'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_url_two', 'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_use_link', 'one');
    window.localStorage.setItem('settings_v1_reset', 'true');
  }

  var originalPlay = null;

  // Extract torrent hash and file index from a TorrServer /stream URL
  function parseTorrServerUrl(url) {
    try {
      var u = new URL(url);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return null;
      if (u.port !== '8090') return null;
      if (u.pathname.indexOf('/stream') === -1) return null;
      var hash = u.searchParams.get('link');
      var index = u.searchParams.get('index') || '0';
      if (!hash) return null;
      return { hash: hash, index: index, host: u.origin };
    } catch (e) {
      return null;
    }
  }

  function showNoty(msg) {
    try {
      if (window.Lampa && window.Lampa.Noty) window.Lampa.Noty.show(msg);
    } catch (e) {}
  }

  // Preload torrent data, probe codecs, then play via HLS transcoder or direct
  function preloadAndPlay(data) {
    var parsed = parseTorrServerUrl(data.url);
    if (!parsed) {
      originalPlay.call(window.Lampa.Player, data);
      return;
    }

    var originalData = JSON.parse(JSON.stringify(data));

    console.log('[lampa-deck] Preloading torrent before playback...');
    showNoty('Буферизация...');

    var preloadUrl = parsed.host + '/stream?link=' + encodeURIComponent(parsed.hash) +
      '&index=' + encodeURIComponent(parsed.index) + '&preload';
    fetch(preloadUrl).catch(function() {});

    var attempts = 0;
    var maxAttempts = 40; // 40 * 500ms = 20s

    function checkAndPlay() {
      attempts++;
      fetch(parsed.host + '/torrents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', hash: parsed.hash })
      })
        .then(function(r) { return r.json(); })
        .then(function(stat) {
          var loaded = stat.preloaded_bytes || stat.bytes_read_useful_data || 0;
          var preloadSize = stat.preload_size || 10000000;
          var progress = preloadSize > 0 ? (loaded / preloadSize * 100) : 0;
          console.log(
            '[lampa-deck] Preload progress: ' + loaded + ' / ' + preloadSize +
            ' (' + progress.toFixed(1) + '%)'
          );

          // Need a few MB of header so ffprobe / first segment can start
          if (loaded >= 3145728 || progress >= 8 || attempts >= maxAttempts) {
            if (attempts >= maxAttempts && loaded < 1048576) {
              console.log('[lampa-deck] Preload timeout - trying direct /stream/');
              originalPlay.call(window.Lampa.Player, originalData);
              return;
            }

            console.log('[lampa-deck] Preload ready (' + loaded + ' bytes), probing codecs...');
            showNoty('Анализ формата...');

            var probeUrl = 'http://127.0.0.1:8000/probe_stream?link=' +
              encodeURIComponent(parsed.hash) + '&index=' + encodeURIComponent(parsed.index);

            fetch(probeUrl)
              .then(function(res) { return res.json(); })
              .then(function(probeRes) {
                // Always use HLS transcoder when probe says so, OR when probe failed
                // with a known-unsupported path. Prefer direct only when explicitly OK.
                if (probeRes && probeRes.transcode === true) {
                  console.log('[lampa-deck] Codecs unsupported → Python HLS transcoder');
                  showNoty('Транскодирование (HLS)...');
                  data.url = 'http://127.0.0.1:8000/hls/master.m3u8?link=' +
                    encodeURIComponent(parsed.hash) + '&index=' + encodeURIComponent(parsed.index);
                  // Let Lampa's own hls.js path handle the .m3u8 (no src prototype conflict)
                  originalPlay.call(window.Lampa.Player, data);
                } else if (probeRes && probeRes.transcode === false && !probeRes.error) {
                  console.log('[lampa-deck] Codecs supported natively → Direct Stream');
                  showNoty('Прямой поток (Direct Play)...');
                  originalPlay.call(window.Lampa.Player, originalData);
                } else {
                  // Probe error / unknown → safer to transcode (AVI/mpeg4/AC3 etc.)
                  console.log('[lampa-deck] Probe uncertain, using HLS transcoder:', probeRes);
                  showNoty('Транскодирование (HLS)...');
                  data.url = 'http://127.0.0.1:8000/hls/master.m3u8?link=' +
                    encodeURIComponent(parsed.hash) + '&index=' + encodeURIComponent(parsed.index);
                  originalPlay.call(window.Lampa.Player, data);
                }
              })
              .catch(function(err) {
                console.log('[lampa-deck] Probe failed, using HLS transcoder:', err);
                showNoty('Транскодирование (HLS)...');
                data.url = 'http://127.0.0.1:8000/hls/master.m3u8?link=' +
                  encodeURIComponent(parsed.hash) + '&index=' + encodeURIComponent(parsed.index);
                originalPlay.call(window.Lampa.Player, data);
              });
          } else {
            setTimeout(checkAndPlay, 500);
          }
        })
        .catch(function() {
          originalPlay.call(window.Lampa.Player, originalData);
        });
    }

    setTimeout(checkAndPlay, 800);
  }

  // Wait for Lampa object to become available
  function initLampaHook() {
    if (window.Lampa && window.Lampa.Player && window.Lampa.Storage) {
      console.log('[lampa-deck] Lampa found, hooking player...');
      originalPlay = window.Lampa.Player.play;

      window.Lampa.Player.play = function(data) {
        if (!data || !data.url) {
          return originalPlay.call(window.Lampa.Player, data);
        }

        var need = data.torrent_hash ? 'torrent' : '';
        var playerNeed = 'player' + (need ? '_' + need : '');
        var playerType = window.Lampa.Storage.get(playerNeed) ||
          window.Lampa.Storage.field(playerNeed) || 'inner';

        if (playerType === 'other' || playerType === 'vlc' || playerType === 'mpc') {
          var playerPath = window.Lampa.Storage.get('player_nw_path') || 'mpv';
          if (window.Lampa.Noty) window.Lampa.Noty.show('Запуск плеера...');
          fetch('/play?url=' + encodeURIComponent(data.url) +
            '&player=' + encodeURIComponent(playerPath))
            .catch(function(err) { console.error('[lampa-deck] Play fetch error:', err); });
          return;
        }

        // Already our HLS URL — play as-is (Lampa hls.js)
        if (typeof data.url === 'string' && data.url.indexOf('/hls/master.m3u8') !== -1) {
          return originalPlay.call(window.Lampa.Player, data);
        }

        var parsed = parseTorrServerUrl(data.url);
        if (parsed) {
          preloadAndPlay(data);
        } else {
          originalPlay.call(window.Lampa.Player, data);
        }
      };
    } else {
      setTimeout(initLampaHook, 100);
    }
  }

  // Gamepad to Keyboard Event Mapper for Steam Deck controller support
  function initGamepadMapper() {
    var buttonStates = {};
    var axisStates = { x: 0, y: 0 };
    var KEY_MAP = {
      12: { code: 'ArrowUp', key: 'ArrowUp', keyCode: 38 },     // D-Pad Up
      13: { code: 'ArrowDown', key: 'ArrowDown', keyCode: 40 }, // D-Pad Down
      14: { code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37 }, // D-Pad Left
      15: { code: 'ArrowRight', key: 'ArrowRight', keyCode: 39 }, // D-Pad Right
      0: { code: 'Enter', key: 'Enter', keyCode: 13 },          // Button A (Select)
      1: { code: 'Escape', key: 'Escape', keyCode: 27 }          // Button B (Back)
    };

    function triggerKeyEvent(type, mapping) {
      var event = new KeyboardEvent(type, {
        code: mapping.code,
        key: mapping.key,
        keyCode: mapping.keyCode,
        which: mapping.keyCode,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);
      if (window.Lampa && window.Lampa.Keypad && type === 'keydown') {
        try {
          window.Lampa.Keypad.listener(event);
        } catch (e) {}
      }
    }

    function updateGamepads() {
      var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      var gp = null;
      for (var i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) { gp = gamepads[i]; break; }
      }

      if (!gp) {
        requestAnimationFrame(updateGamepads);
        return;
      }

      // Check buttons
      Object.keys(KEY_MAP).forEach(function(btnIndex) {
        var button = gp.buttons[btnIndex];
        var pressed = button ? button.pressed : false;
        var prevState = buttonStates[btnIndex] || false;

        if (pressed && !prevState) {
          triggerKeyEvent('keydown', KEY_MAP[btnIndex]);
        } else if (!pressed && prevState) {
          triggerKeyEvent('keyup', KEY_MAP[btnIndex]);
        }
        buttonStates[btnIndex] = pressed;
      });

      // Check Left Stick axes
      var threshold = 0.5;
      var stickX = gp.axes[0] || 0;
      var stickY = gp.axes[1] || 0;

      // X Axis
      var currX = 0;
      if (stickX < -threshold) currX = -1;
      else if (stickX > threshold) currX = 1;

      if (currX !== axisStates.x) {
        if (currX === -1) triggerKeyEvent('keydown', KEY_MAP[14]); // ArrowLeft
        if (currX === 1) triggerKeyEvent('keydown', KEY_MAP[15]);  // ArrowRight
        if (axisStates.x === -1 && currX === 0) triggerKeyEvent('keyup', KEY_MAP[14]);
        if (axisStates.x === 1 && currX === 0) triggerKeyEvent('keyup', KEY_MAP[15]);
        axisStates.x = currX;
      }

      // Y Axis
      var currY = 0;
      if (stickY < -threshold) currY = -1;
      else if (stickY > threshold) currY = 1;

      if (currY !== axisStates.y) {
        if (currY === -1) triggerKeyEvent('keydown', KEY_MAP[12]); // ArrowUp
        if (currY === 1) triggerKeyEvent('keydown', KEY_MAP[13]);  // ArrowDown
        if (axisStates.y === -1 && currY === 0) triggerKeyEvent('keyup', KEY_MAP[12]);
        if (axisStates.y === 1 && currY === 0) triggerKeyEvent('keyup', KEY_MAP[13]);
        axisStates.y = currY;
      }

      requestAnimationFrame(updateGamepads);
    }

    // Auto-focus body to ensure keyboard focus
    document.addEventListener('DOMContentLoaded', function() {
      document.body.focus();
    });
    window.addEventListener('focus', function() {
      document.body.focus();
    });
    
    requestAnimationFrame(updateGamepads);
  }

  try {
    initGamepadMapper();
  } catch (e) {
    console.error('[lampa-deck] Failed to init Gamepad Mapper:', e);
  }

  initLampaHook();
})();
