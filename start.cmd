@echo off
setlocal
title OpenCode Usage Dashboard
cd /d "%~dp0"

echo ==========================================
echo   OpenCode Usage Dashboard
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node 24 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
for /f "tokens=1 delims=." %%a in ("%NODE_VERSION:~1%") do set "NODE_MAJOR=%%a"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 24 (
  echo Node 24 or newer is required. Found %NODE_VERSION%.
  echo Install a newer Node.js and run this file again.
  pause
  exit /b 1
)
echo Node %NODE_VERSION% found.

set "PKG=pnpm"
set "RUN=pnpm exec next dev"
set "INSTALL=pnpm install --silent"
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm was not found on PATH. Falling back to npm.
  set "PKG=npm"
  set "RUN=npx next dev"
  set "INSTALL=npm install --silent --no-package-lock"
) else (
  echo pnpm found.
)
echo.

if not exist "node_modules" (
  echo Installing dependencies with %PKG%. This can take a minute...
  call %INSTALL%
  if errorlevel 1 (
    echo.
    echo Dependency install failed. Check the output above.
    pause
    exit /b 1
  )
  echo Dependencies installed.
  echo.
)

set "PORT=4321"
set "TRIED_ALT=0"

call :check_busy
if not errorlevel 1 goto :ask_alt

:serve
echo Starting the dashboard on http://localhost:%PORT%
echo The browser opens in a few seconds. Press Ctrl+C to stop.
echo.
rem Give the dev server a few seconds to bind before opening the browser.
start "" /b cmd /c "ping -n 5 127.0.0.1 >nul & start http://localhost:%PORT%"
call %RUN% -p %PORT%
if not errorlevel 1 goto :done
rem A busy port can also surface only after next dev returns; offer 4322 once.
if "%TRIED_ALT%"=="1" goto :failed
call :check_busy
if errorlevel 1 goto :failed
goto :ask_alt

:ask_alt
echo.
echo Port %PORT% is already in use.
set "ANSWER="
set /p "ANSWER=Start on 4322 instead? [Y/N] "
if /i "%ANSWER%"=="Y" goto :use_alt
echo Cancelled.
endlocal
exit /b 0

:use_alt
set "PORT=4322"
set "TRIED_ALT=1"
goto :serve

:done
endlocal
exit /b 0

:failed
echo.
echo The dev server stopped with an error.
echo If port 4321 is busy, run: pnpm exec next dev -p 4322
pause
endlocal
exit /b 1

:check_busy
rem Returns 0 when something is listening on 4321, 1 when the port is free.
netstat -ano | findstr /R /C:":4321 .*LISTENING" >nul
exit /b %errorlevel%
