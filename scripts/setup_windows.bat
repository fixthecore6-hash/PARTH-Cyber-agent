@echo off
REM One-time Windows setup helper
REM Run once: scripts\setup_windows.bat

setlocal enabledelayedexpansion
cd /d "%~dp0\.."

echo.
echo ======= PARTH Windows Setup =======
echo.

echo [1] Creating Python venv...
if exist "backend\.venv" (
  echo   Already exists
) else (
  python -m venv backend\.venv
  if errorlevel 1 (
    echo   ERROR: Failed
    pause & exit /b 1
  )
)

echo [2] Installing Python dependencies...
call backend\.venv\Scripts\activate.bat
pip install --quiet -r backend\requirements.txt
if errorlevel 1 (
  echo   WARNING: Some dependencies failed
)

echo [3] Installing Node dependencies...
if exist "frontend\node_modules" (
  echo   Already exists
) else (
  cd frontend
  npm install --silent
  if errorlevel 1 (
    echo   WARNING: Some packages failed
  )
  cd ..
)

echo.
echo Setup complete!
echo.
echo Next: Run scripts\start.bat
echo.
pause
