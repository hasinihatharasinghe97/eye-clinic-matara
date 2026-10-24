@echo off
title Nethraloka Eye Clinic - first-time copy from cloud
cd /d "%~dp0"

echo FIRST-TIME SETUP ONLY.
echo Copies all patients, visits and photos from the cloud database (HeatWave)
echo onto this laptop. Needs an internet connection.
echo It will not run if this laptop already has patients.
echo.
pause

call node scripts\cloud-sync.mjs pull
if errorlevel 1 (
  echo.
  echo The copy did NOT finish. Check the internet connection and .env, then run this again.
) else (
  echo.
  echo Copy finished. Start the clinic system with start-clinic.bat.
)
echo.
pause
