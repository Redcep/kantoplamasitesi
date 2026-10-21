#!/usr/bin/env python3
import os
import sys
import subprocess
import webbrowser
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def main():
    env = os.environ.copy()
    nvm_dir = env.get('NVM_DIR', os.path.expanduser('~/.config/nvm'))
    node_path = None
    if os.path.exists(os.path.join(nvm_dir, 'nvm.sh')):
        pass

    node_cmd = 'node' if sys.platform != 'win32' else 'node.exe'
    if not node_path:
        try:
            r = subprocess.run(['which', 'node'], capture_output=True, text=True)
            if r.returncode == 0:
                node_cmd = r.stdout.strip()
        except:
            pass

    index_js = os.path.join(BASE_DIR, 'index.js')
    if not os.path.exists(index_js):
        print("index.js bulunamadı")
        sys.exit(1)

    try:
        proc = subprocess.Popen([node_cmd, 'index.js'], cwd=BASE_DIR, env=env)
    except Exception as e:
        print(f"Başlatılamadı: {e}")
        sys.exit(1)

    url = 'http://localhost:3000/login.html'
    try:
        webbrowser.open(url, new=2)
    except:
        pass

    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except:
            proc.kill()

if __name__ == '__main__':
    main()
