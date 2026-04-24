# Serve a pasta do projeto em http://127.0.0.1:8080 (necessário para o módulo ES do simulador 3D).
Set-Location $PSScriptRoot
$port = 8080
Write-Host "Simulador T-Sim: http://127.0.0.1:$port/reboqueoceanico242TSIM.html"
Write-Host "Ctrl+C para parar."
python -m http.server $port --bind 127.0.0.1
