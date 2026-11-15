@echo off
rem Builds the dev bundle and serves it on http://127.0.0.1:8787/ (close this window or press Ctrl+C to stop). It builds again by itself when a file in src/ changes.
rem The game tab needs localStorage FST_dev_base = 8787 (set once; remove it to go back to the published toolkit).
cd /d "%~dp0"
if not exist node_modules call npm install
node tools/serve.mjs
pause
