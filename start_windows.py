#!/usr/bin/env python3
import os
import sys
import subprocess
import webbrowser
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def main():
    env = os.environ.copy()
    node_cmd = 'node'
    index_js = os.path.join(BASE_DIR, 'index.js')
    try:
        proc = subprocess.Popen([node_cmd, 'index.js'], cwd=BASE_DIR, env=env)
    except Exception as e:
        print(f"Hata: {e}")
        input("Kapatmak için Enter...")
        sys.exit(1)
    url = 'http://localhost:3000/login.html'
    time.sleep(2)
    try:
        webbrowser.open(url)
    except:
        pass
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()

if __name__ == '__main__':
    main()
