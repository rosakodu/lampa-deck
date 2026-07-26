const puppeteer = require('puppeteer-core');
(async () => {
    try {
        const browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null
        });
        const pages = await browser.pages();
        let page = pages.find(p => p.url().includes('127.0.0.1:8300'));
        if (!page) {
            page = await browser.newPage();
            await page.goto('http://127.0.0.1:8300');
        }
        console.log("Connected to Lampa Page");
        
        await page.evaluate(() => {
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
                hls.loadSource('http://127.0.0.1:8300/hls/master.m3u8?link=badd944ce3d71e656d57ff16a0b32980299991e3&index=1');
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
        });
        
        console.log("Injected test script, listening for console logs...");
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        await new Promise(r => setTimeout(r, 10000));
        await browser.disconnect();
    } catch (e) {
        console.error(e);
    }
})();
