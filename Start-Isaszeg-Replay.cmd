@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/ and open this file again.
  pause
  exit /b 1
)
if not exist node_modules\electron\dist\electron.exe (
  echo Installing app dependencies. Internet is needed for this first step.
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
