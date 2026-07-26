let video = document.querySelector('video') || document.createElement('video');
if(!document.body.contains(video)) {
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.zIndex = '9999';
    document.body.appendChild(video);
}
let script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
script.onload = () => {
    let hls = new Hls({debug: true});
    hls.loadSource('http://127.0.0.1:8300/hls/master.m3u8?link=badd944ce3d71e656d57ff16a0b3298029991e3&index=1');
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, function() {
        console.log("MANIFEST PARSED! PLAYING!");
        video.play().catch(e => console.log("Play failed: " + e));
    });
    hls.on(Hls.Events.ERROR, function(event, data) {
        console.log("HLS ERROR: " + data.type + " " + data.details);
    });
    video.addEventListener('playing', () => {
        console.log("VIDEO IS NOW PLAYING! width: " + video.videoWidth + " height: " + video.videoHeight);
    });
};
document.head.appendChild(script);
"Script injected";
