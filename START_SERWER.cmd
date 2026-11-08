@echo off
REM ============================================================================
REM  "Trasa" — serwer-backend pod domene jakdojade.edu.pl.
REM  Rozpakuj te paczke na Windows Server 2019 i kliknij ten plik.
REM  Serwer startuje na porcie 3400; tunel Cloudflare laczy sie do localhost:3400.
REM
REM  Pierwsze uruchomienie pobiera rozklad ZTM Gdansk (~24 MB) do katalogu data\.
REM  Nie kasuj data\ — tam sa konta i rozklady. Zamkniecie okna = stop serwera.
REM ============================================================================
title Trasa - serwer 3400
cd /d "%~dp0"
set PORT=3400
set HOST=127.0.0.1

where node >nul 2>&1
if errorlevel 1 (
  echo BLAD: nie znaleziono Node.js. Zainstaluj Node 20+ z https://nodejs.org i uruchom ponownie.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instaluje zaleznosci ^(raz^)...
  call npm.cmd install
)

:loop
echo.
echo [%date% %time%] Start serwera Trasa  ^|  http://localhost:%PORT%/api/time  (test)
node server.js
echo.
echo [%date% %time%] Serwer sie zatrzymal ^(kod %errorlevel%^). Restart za 3 s... ^(Ctrl+C = koniec^)
timeout /t 3 /nobreak >nul
goto :loop
