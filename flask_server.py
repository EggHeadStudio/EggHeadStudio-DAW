"""Optional local static Flask server; GitHub Pages does not run Flask."""
from pathlib import Path
from flask import Flask, send_from_directory
ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=None)
@app.route('/')
def index(): return send_from_directory(ROOT, 'index.html')
@app.route('/<path:path>')
def static_file(path): return send_from_directory(ROOT, path)
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
