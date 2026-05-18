@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"
echo Starting frontend dev server...
call npm run dev

endlocal
