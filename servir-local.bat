@echo off
cd /d "%~dp0"
echo Simulador T-Sim: http://127.0.0.1:8080/reboqueoceanico242TSIM.html
echo Feche a janela ou Ctrl+C para parar.
python -m http.server 8080 --bind 127.0.0.1
pause
