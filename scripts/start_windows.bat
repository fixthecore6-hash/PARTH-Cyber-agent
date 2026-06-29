@echo off
setlocal EnableDelayedExpansion
title PARTH - Cybersecurity AI

set PARTH_DIR=%~dp0..
cd /d %PARTH_DIR%

echo.
echo PARTH Startup
echo -------------

if "%PARTH_MODEL%"=="" (
    set /p PARTH_MODEL=Enter Ollama model [default: mistral]: 
    if "%PARTH_MODEL%"=="" set PARTH_MODEL=mistral
)
echo [OK] Using model: %PARTH_MODEL%

echo.
echo Hosting mode:
echo   1) LAN mode (phone/other devices on same WiFi)
echo   2) Localhost only (this PC only)
set /p HOST_MODE=Choice [1]: 
if "%HOST_MODE%"=="" set HOST_MODE=1

set /p FRONTEND_PORT=Frontend port [default: 5173]: 
if "%FRONTEND_PORT%"=="" set FRONTEND_PORT=5173
set /p BACKEND_PORT=Backend port [default: 8000]: 
if "%BACKEND_PORT%"=="" set BACKEND_PORT=8000

for /f "delims=0123456789" %%A in ("%FRONTEND_PORT%") do set FRONTEND_PORT=
if "%FRONTEND_PORT%"=="" set FRONTEND_PORT=5173
for /f "delims=0123456789" %%A in ("%BACKEND_PORT%") do set BACKEND_PORT=
if "%BACKEND_PORT%"=="" set BACKEND_PORT=8000

if "%HOST_MODE%"=="2" (
    set PARTH_HOST=127.0.0.1
) else (
    set PARTH_HOST=0.0.0.0
)
set PARTH_PORT=%BACKEND_PORT%

echo [OK] Host bind: %PARTH_HOST%
echo [OK] Frontend port: %FRONTEND_PORT%
echo [OK] Backend port: %BACKEND_PORT%

echo [1/3] Starting Ollama...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if errorlevel 1 (
    start /min ollama serve
    timeout /t 3 /nobreak > NUL
)
echo [OK] Ollama ready

echo [2/3] Starting backend...
cd /d %PARTH_DIR%\backend
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
) else (
    echo [ERR] No venv found. Run scripts\setup_windows.bat
    pause
    exit /b 1
)
start /min python main.py
timeout /t 3 /nobreak > NUL
echo [OK] Backend started

echo [3/3] Starting frontend...
cd /d %PARTH_DIR%\frontend
start /min npm run dev -- --host %PARTH_HOST% --port %FRONTEND_PORT%
timeout /t 4 /nobreak > NUL

for /f "tokens=*" %%I in ('powershell -NoProfile -Command "$r = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' ^| Sort-Object RouteMetric ^| Select-Object -First 1; if ($r) { (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $r.InterfaceIndex ^| Where-Object { $_.IPAddress -notlike '169.*' } ^| Select-Object -First 1).IPAddress }" 2^>nul') do set LAN_IP=%%I
set LAN_IP=%LAN_IP: =%
if "%LAN_IP%"=="" set LAN_IP=127.0.0.1

echo.
echo PARTH is running
echo Local URL : http://localhost:%FRONTEND_PORT%
if not "%HOST_MODE%"=="2" echo Phone URL : http://%LAN_IP%:%FRONTEND_PORT%
echo.
echo If phone cannot connect, allow python.exe and node.exe in Windows Defender Firewall for Private networks.
echo Press any key to stop PARTH...
pause > NUL

echo Stopping PARTH...
taskkill /IM "python.exe" /F > NUL 2>&1
taskkill /IM "node.exe" /F > NUL 2>&1
