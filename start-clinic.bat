@echo off
title Eye Clinic Matara
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing root dependencies...
  call npm install
)
if not exist "server\node_modules" (
  echo Installing server dependencies...
  call npm install --prefix server
)
if not exist "client\node_modules" (
  echo Installing client dependencies...
  call npm install --prefix client
)

echo.
echo Starting Eye Clinic system...
echo Open http://localhost:5173 in your browser
echo Default password: clinic123
echo.
call npm run dev
pause
