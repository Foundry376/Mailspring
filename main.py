import webview
import os
import sys

class MailspringApi:
    def get_env(self):
        return dict(os.environ)

    def write_clipboard(self, text):
        pass

    def open_devtools(self):
        pass

    def set_window_size(self, width, height):
        pass

    def center_window(self):
        pass

    def log_error(self, error):
        print(f"Frontend Error: {error}")

def start():
    # Load index.html from app/static/index.html
    html_path = os.path.join(os.path.dirname(__file__), 'app', 'static', 'index.html')

    api = MailspringApi()

    # We create a window and start it. For MacOS, pywebview uses WebKit which is lighter than Electron.
    webview.create_window('Mailspring', html_path, js_api=api)
    webview.start()

if __name__ == '__main__':
    start()
