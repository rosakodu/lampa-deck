import urllib.request
import time
import urllib.parse
import os

url = 'http://127.0.0.1:8300/hls/master.m3u8?link=badd944ce3d71e656d57ff16a0b32980299991e3&index=1'

print("Fetching master playlist...")
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    resp = urllib.request.urlopen(req)
    master = resp.read().decode('utf-8').strip()
    print("Master:\n" + master)
    
    media_url = master.split('\n')[-1]
    print(f"\nFetching media playlist: {media_url}")
    req = urllib.request.Request(media_url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req)
    media = resp.read().decode('utf-8')
    print("Media:\n" + media)
    
    print("\nWaiting for segments to be generated...")
    time.sleep(1)
    
    init_url = 'http://127.0.0.1:8300/hls/init.mp4?link=badd944ce3d71e656d57ff16a0b32980299991e3&index=1'
    print(f"Fetching init.mp4 from {init_url}")
    req = urllib.request.Request(init_url, headers={'User-Agent': 'Mozilla/5.0'})
    init_data = urllib.request.urlopen(req).read()
    print(f"init.mp4 downloaded, size: {len(init_data)} bytes")
    
    seg0_url = 'http://127.0.0.1:8300/hls/segment_0.m4s?link=badd944ce3d71e656d57ff16a0b32980299991e3&index=1'
    print(f"Fetching segment 0...")
    req = urllib.request.Request(seg0_url, headers={'User-Agent': 'Mozilla/5.0'})
    seg0_data = urllib.request.urlopen(req).read()
    print(f"segment_0.m4s downloaded, size: {len(seg0_data)} bytes")
    
    seg1_url = 'http://127.0.0.1:8300/hls/segment_1.m4s?link=badd944ce3d71e656d57ff16a0b32980299991e3&index=1'
    print(f"Fetching segment 1...")
    req = urllib.request.Request(seg1_url, headers={'User-Agent': 'Mozilla/5.0'})
    seg1_data = urllib.request.urlopen(req).read()
    print(f"segment_1.m4s downloaded, size: {len(seg1_data)} bytes")
    
    print("\nSUCCESS! The pipeline is fully functional!")
except Exception as e:
    print(f"Error: {e}")
