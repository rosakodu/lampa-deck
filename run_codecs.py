import asyncio
import json
import urllib.request
import websockets

async def test_codecs():
    req = urllib.request.urlopen('http://192.168.0.196:8081/json')
    targets = json.loads(req.read())
    ws_url = [t['webSocketDebuggerUrl'] for t in targets if 'webSocketDebuggerUrl' in t][0]
    
    async with websockets.connect(ws_url) as ws:
        js = """
        (() => {
            const f = [
                'audio/mp4; codecs="mp4a.40.2"', // AAC
                'audio/mp4; codecs="ac-3"',      // AC3
                'audio/mp4; codecs="ec-3"'       // E-AC3
            ];
            return f.map(x => `${x}: ${MediaSource.isTypeSupported(x)}`).join('\\n');
        })();
        """
        req = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": js, "returnByValue": True}
        }
        await ws.send(json.dumps(req))
        res = json.loads(await ws.recv())
        print(res.get('result', {}).get('result', {}).get('value'))

asyncio.run(test_codecs())
