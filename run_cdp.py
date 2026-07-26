import json, urllib.request, websocket, sys
try:
    resp = urllib.request.urlopen("http://127.0.0.1:9222/json")
    targets = json.loads(resp.read())
    ws_url = next(t['webSocketDebuggerUrl'] for t in targets if t['type'] == 'page')
    ws = websocket.create_connection(ws_url)
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": sys.argv[1]}}))
    print(ws.recv())
    ws.close()
except Exception as e:
    print(e)
