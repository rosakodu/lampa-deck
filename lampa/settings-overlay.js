(function () {
  'use strict';

  // ── Tiny JS logger → plugin backend ──────────────────────────────────────
  var _log = function (msg) {
    try { fetch('http://127.0.0.1:8300/log_js?msg=' + encodeURIComponent(msg)); } catch (e) {}
  };

  // ── Save current Lampa page URL every 3 s ────────────────────────────────
  setInterval(function () {
    try {
      var url = window.location.href;
      if (url && url.indexOf('127.0.0.1:8300') !== -1) {
        fetch('http://127.0.0.1:8300/save_url?url=' + encodeURIComponent(url)).catch(function(){});
      }
    } catch (e) {}
  }, 3000);

  // ── Persistent localStorage defaults ─────────────────────────────────────
  // Force player to 'video' (built-in HTML5 player)
  if (window.localStorage.getItem('lampadeck_transcode_reset') !== 'v2') {
    window.localStorage.setItem('player',         'video');
    window.localStorage.setItem('player_torrent', 'video');
    window.localStorage.setItem('player_iptv',    'video');
    // TorrServer
    window.localStorage.setItem('torrserver_url',      'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_url_two',  'http://127.0.0.1:8090');
    window.localStorage.setItem('torrserver_use_link', 'one');
    window.localStorage.setItem('torrserver_gts',      'false');
    window.localStorage.setItem('lampadeck_transcode_reset', 'v2');
    _log('[lampa-deck] localStorage defaults applied (Transcoder mode)');
  }

  // Force built-in player settings
  window.localStorage.setItem('player', 'video');
  window.localStorage.setItem('player_torrent', 'video');
  window.localStorage.setItem('torrserver_gts', 'false');

  // ── Hook Lampa.Player.play ───────────────────────────────────────────────
  function hookPlayer() {
    if (!(window.Lampa && window.Lampa.Player && window.Lampa.Storage)) {
      setTimeout(hookPlayer, 300);
      return;
    }

    _log('[lampa-deck] Hooking Lampa.Player.play for built-in WebM Transcoder');

    var _origPlay = window.Lampa.Player.play.bind(window.Lampa.Player);

    window.Lampa.Player.play = function (data) {
      if (!data || !data.url) {
        return _origPlay(data);
      }

      var url = data.url || '';

      // Only intercept TorrServer stream URLs
      var isTorr = url.indexOf('127.0.0.1:8090') !== -1 ||
                   url.indexOf('localhost:8090')  !== -1;

      if (!isTorr) {
        // Non-torrent URL — pass through
        return _origPlay(data);
      }

      // Check timeline position to resume playback from correct second
      var startTime = 0;
      if (data.timeline && typeof data.timeline.time !== 'undefined') {
        startTime = Math.floor(data.timeline.time);
      }

      // Redirect player to our local VP8/Opus WebM live transcode stream
      var transcodedUrl = 'http://127.0.0.1:8300/stream.webm?url=' + encodeURIComponent(url) + '&start=' + startTime;
      
      _log('[lampa-deck] Intercepted stream, redirecting to transcoder: ' + transcodedUrl);
      
      data.url = transcodedUrl;

      // Call original play method; built-in HTML5 video player will now open the WebM stream
      return _origPlay(data);
    };

    _log('[lampa-deck] Lampa.Player.play hooked — Transcoder mode active');
  }

  hookPlayer();

})();
