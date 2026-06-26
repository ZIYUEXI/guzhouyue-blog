@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

set "CONDA_ENV=py313"
set "BACKEND_URL=http://127.0.0.1:4174"
set "FRONTEND_URL=http://127.0.0.1:5173"
set "FRONTEND_HOST=0.0.0.0"
set "FRONTEND_PORT=5173"
set "LAN_IP="
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' -and $_.AddressState -eq 'Preferred' } | Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LAN_IP=%%I"
if not "%LAN_IP%"=="" set "FRONTEND_LAN_URL=http://%LAN_IP%:%FRONTEND_PORT%"

if /I "%CONDA_DEFAULT_ENV%"=="%CONDA_ENV%" (
  echo Conda env already active: %CONDA_ENV%
) else if exist "%USERPROFILE%\miniconda3\condabin\conda.bat" (
  call "%USERPROFILE%\miniconda3\condabin\conda.bat" activate "%CONDA_ENV%"
) else if exist "%USERPROFILE%\anaconda3\condabin\conda.bat" (
  call "%USERPROFILE%\anaconda3\condabin\conda.bat" activate "%CONDA_ENV%"
) else if exist "%ProgramData%\miniconda3\condabin\conda.bat" (
  call "%ProgramData%\miniconda3\condabin\conda.bat" activate "%CONDA_ENV%"
) else if exist "%ProgramData%\anaconda3\condabin\conda.bat" (
  call "%ProgramData%\anaconda3\condabin\conda.bat" activate "%CONDA_ENV%"
) else (
  where conda >nul 2>nul
  if errorlevel 1 (
    echo Conda was not found. Please run this from Anaconda Prompt or add conda to PATH.
    pause
    exit /b 1
  )
  call conda activate "%CONDA_ENV%"
)

if errorlevel 1 if /I not "%CONDA_DEFAULT_ENV%"=="%CONDA_ENV%" (
  echo Failed to activate conda env: %CONDA_ENV%
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist "server\config.json" (
  echo Creating server config from example...
  copy /Y "server\config.example.json" "server\config.json" >nul
  if errorlevel 1 (
    echo Failed to create server config.
    pause
    exit /b 1
  )
)

set "PYTHON_COMMAND=%CONDA_PREFIX%\python.exe"

echo Seeding backend data...
call npm run seed:server
if errorlevel 1 (
  echo Backend seed failed.
  pause
  exit /b 1
)

echo Starting backend: %BACKEND_URL%
start "Guzhouyue Blog Backend" /D "%~dp0" cmd /k "chcp 65001 >nul && npm run dev:server"

echo Starting frontend: %FRONTEND_URL%
start "Guzhouyue Blog Frontend" /D "%~dp0" cmd /k "chcp 65001 >nul && npm run dev"

echo.
echo Started frontend and backend.
echo Frontend local: %FRONTEND_URL%
if not "%LAN_IP%"=="" echo Frontend phone: %FRONTEND_LAN_URL%
echo Backend:  %BACKEND_URL%
echo.
echo To open from a phone, connect it to the same Wi-Fi and visit the phone URL above.
echo If it still cannot open, allow Node.js through Windows Defender Firewall for private networks.
echo Configure admin password in server\config.json.
pause

endlocal
