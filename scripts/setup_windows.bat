@echo off
REM =====================================================
REM  PARTH Windows Setup
REM  created_by:pushkar | helped_by:claude
REM  Run once: scripts\setup_windows.bat
REM =====================================================
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
set PARTH_DIR=%CD%
set CERT_DIR=%PARTH_DIR%\certs

echo.
echo  ==========================================
echo   PARTH Host Defender - Windows Setup
echo  ==========================================
echo.

REM ── [1] Python venv ──────────────────────────────────
echo [1/5] Setting up Python environment...
if exist "backend\.venv\Scripts\activate.bat" (
    echo   Virtual environment already exists
) else (
    python -m venv backend\.venv
    if errorlevel 1 (
        echo   ERROR: python not found. Install from https://python.org
        pause & exit /b 1
    )
    echo   Virtual environment created
)

REM ── [2] Python dependencies (includes mss) ───────────
echo [2/5] Installing Python dependencies...
call backend\.venv\Scripts\activate.bat
backend\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
backend\.venv\Scripts\python.exe -m pip install --quiet -r backend\requirements.txt
if errorlevel 1 (
    echo   WARNING: Some dependencies may have failed - check above
)
echo   Dependencies installed (including mss for screenshots)

REM ── [3] Node dependencies ─────────────────────────────
echo [3/5] Installing frontend dependencies...
if exist "frontend\node_modules" (
    echo   node_modules already exists
) else (
    cd frontend
    npm install --silent
    if errorlevel 1 echo   WARNING: Some npm packages failed
    cd ..
)

REM ── [4] Self-signed HTTPS certificate ─────────────────
echo [4/5] Generating HTTPS certificate...
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"

REM Check if openssl available (Git for Windows or WSL)
where openssl >nul 2>&1
if errorlevel 1 (
    REM Try via PowerShell .NET
    echo   openssl not found - generating cert via PowerShell...
    powershell -NoProfile -Command ^
      "$cert = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\LocalMachine\My' -NotAfter (Get-Date).AddDays(825) -KeyAlgorithm RSA -KeyLength 2048; ^
       $pwd = ConvertTo-SecureString -String 'parthcert' -Force -AsPlainText; ^
       Export-PfxCertificate -Cert $cert -FilePath '%CERT_DIR%\cert.pfx' -Password $pwd | Out-Null; ^
       Write-Host 'Cert generated (PFX format)'"
    REM Convert PFX to PEM for uvicorn via Python
    call backend\.venv\Scripts\activate.bat
    python -c "from cryptography.hazmat.primitives.serialization import pkcs12, Encoding, PrivateFormat, NoEncryption; import pathlib; data=pathlib.Path(r'%CERT_DIR%\cert.pfx').read_bytes(); k,c,_=pkcs12.load_key_and_certificates(data,b'parthcert'); pathlib.Path(r'%CERT_DIR%\key.pem').write_bytes(k.private_bytes(Encoding.PEM,PrivateFormat.PKCS8,NoEncryption())); pathlib.Path(r'%CERT_DIR%\cert.pem').write_bytes(c.public_bytes(Encoding.PEM)); print('PEM files written')" 2>nul
    if errorlevel 1 (
        echo   Could not generate cert - will run on HTTP (voice may not work^)
        echo   Install Git for Windows for openssl support: https://git-scm.com
    )
) else (
    REM Get LAN IP
    for /f "tokens=*" %%I in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*'} | Select-Object -First 1).IPAddress" 2^>nul') do set LAN_IP=%%I
    if "!LAN_IP!"=="" set LAN_IP=127.0.0.1

    openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes ^
        -keyout "%CERT_DIR%\key.pem" ^
        -out    "%CERT_DIR%\cert.pem" ^
        -subj   "/CN=PARTH-Dashboard" ^
        -addext "subjectAltName=IP:127.0.0.1,IP:!LAN_IP!,DNS:localhost" 2>nul
    echo   TLS certificate generated
)

REM ── [5] Choose and pull Ollama model ──────────────────
echo [5/5] Configuring AI model...
echo.
echo   Your PC specs guide model choice:
echo     2-4 GB RAM free  :  qwen2.5:0.5b   tinyllama    phi3:mini
echo     4-8 GB RAM free  :  qwen2.5:1.5b   phi3         gemma2:2b
echo     8-16 GB RAM free :  mistral         llama3.2     qwen2.5:7b
echo    16+ GB RAM free   :  llama3.1        mixtral
echo.
echo   You chose qwen2.5:0.5b during this session.
set /p CHOSEN_MODEL=  Model name [default: qwen2.5:0.5b]: 
if "!CHOSEN_MODEL!"=="" set CHOSEN_MODEL=qwen2.5:0.5b

REM Write .env — always overwrite PARTH_MODEL, never duplicate
if exist ".env" (
    powershell -NoProfile -Command ^
      "$f='.env'; $lines=Get-Content $f -ErrorAction SilentlyContinue | Where-Object {$_ -notmatch '^PARTH_MODEL='}; $lines += 'PARTH_MODEL=!CHOSEN_MODEL!'; Set-Content $f $lines"
) else (
    echo PARTH_MODEL=!CHOSEN_MODEL!> .env
    echo PARTH_ALLOW_EXECUTE=false>> .env
)
echo   Model set to: !CHOSEN_MODEL!

REM Pull the model
echo   Pulling model (may take a few minutes on first run^)...
ollama pull !CHOSEN_MODEL!
if errorlevel 1 echo   WARNING: Pull failed - run manually: ollama pull !CHOSEN_MODEL!

echo.
echo  ==========================================
echo   Setup complete!
echo  ==========================================
echo.
echo   Start PARTH:   scripts\start_windows.bat
echo   Dashboard:     https://localhost:5173
echo.
echo   NOTE: Browser will warn about self-signed cert.
echo   Click Advanced then Proceed to localhost - this is safe.
echo   Voice features require HTTPS - now enabled!
echo.
pause
