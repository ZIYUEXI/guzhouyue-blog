@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"

set "CONDA_ENV=py313"
set "BACKEND_URL=http://127.0.0.1:4174"
set "FRONTEND_URL=http://127.0.0.1:5173"

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

if exist "server\requirements.txt" (
  echo Installing Python backend dependencies...
  call python -m pip install -r server\requirements.txt
  if errorlevel 1 (
    echo Python dependency install failed.
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
echo Frontend: %FRONTEND_URL%
echo Backend:  %BACKEND_URL%
echo Configure admin password in server\config.json.
pause

endlocal
