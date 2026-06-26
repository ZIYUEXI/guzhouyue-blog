@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"
echo Starting frontend dev server...
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' -and $_.AddressState -eq 'Preferred' } | Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LAN_IP=%%I"
if not "%LAN_IP%"=="" echo Phone URL: http://%LAN_IP%:5173
echo If the phone cannot open it, allow Node.js through Windows Defender Firewall for private networks.
call npm run dev

endlocal
