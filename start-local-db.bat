@echo off
title Eye Clinic — local MySQL
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed or not in PATH.
  echo Install Docker Desktop from https://www.docker.com/products/docker-desktop/
  echo Or install MySQL 8 locally and put settings in .env.local
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo Creating .env.local from .env.local.example ...
  copy /Y ".env.local.example" ".env.local" >nul
)

echo Starting local MySQL ^(eye-clinic-mysql^)...
docker compose up -d
if errorlevel 1 (
  echo Failed to start Docker MySQL.
  pause
  exit /b 1
)

echo.
echo Waiting for MySQL to become ready...
powershell -NoProfile -Command ^
  "for ($i=0; $i -lt 40; $i++) { " ^
  "  docker exec eye-clinic-mysql mysqladmin ping -h 127.0.0.1 -uroot -proot --silent 2>$null; " ^
  "  if ($LASTEXITCODE -eq 0) { exit 0 }; Start-Sleep -Seconds 2 " ^
  "}; exit 1"
if errorlevel 1 (
  echo MySQL did not become ready in time. Check: docker compose logs mysql
  pause
  exit /b 1
)

echo.
echo Local MySQL is running on 127.0.0.1:3306
echo   user: root
echo   password: root
echo   database: eye_clinic
echo.
echo .env.local points the app at this database ^(overrides HeatWave .env^).
echo Next: double-click start-clinic.bat
echo.
pause
