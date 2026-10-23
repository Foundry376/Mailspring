import webview
import os
import sys

def start():
    # Load index.html from app/static/index.html
    html_path = os.path.join(os.path.dirname(__file__), 'app', 'static', 'index.html')

    # We create a window and start it. For MacOS, pywebview uses WebKit which is lighter than Electron.
    webview.create_window('Mailspring', html_path)
    webview.start()

if __name__ == '__main__':
    start()
