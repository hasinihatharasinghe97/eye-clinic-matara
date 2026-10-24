@echo off
title Nethraloka Eye Clinic - sync to cloud
cd /d "%~dp0"

echo Sends today's work from this laptop to the cloud database (HeatWave),
echo so the online app shows the same patients and visits.
echo Connect the laptop to the internet first (Wi-Fi or phone hotspot).
echo.

call node scripts\cloud-sync.mjs push
if errorlevel 1 (
  echo.
  echo Sync did NOT finish. Nothing in the cloud was changed.
  echo Check the internet connection and run this again.
) else (
  echo.
  echo Sync finished.
)
echo.
pause
