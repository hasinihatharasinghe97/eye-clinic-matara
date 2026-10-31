@echo off
setlocal
title Nethraloka Eye Clinic - tools
cd /d "%~dp0"

set "TASK=Nethraloka Eye Clinic - cloud sync"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js 22+ from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)

:menu
cls
echo ==========================================================
echo   Nethraloka Eye Clinic - tools
echo   (To start the clinic app every day, use start-clinic.bat)
echo ==========================================================
echo.
echo   1. Sync now           laptop and online app, both ways
echo   2. Sync status        last sync and changes waiting
echo   3. Background sync ON   (every 5 min, even when the app is closed)
echo   4. Background sync OFF
echo   5. First-time copy from cloud   (NEW LAPTOP SETUP ONLY)
echo.
echo   0. Exit
echo.
choice /c 123450 /n /m "Choose 1-5, or 0 to exit: "
if errorlevel 6 goto :eof
if errorlevel 5 goto first_copy
if errorlevel 4 goto auto_off
if errorlevel 3 goto auto_on
if errorlevel 2 goto status
goto sync_now

:sync_now
echo.
echo Syncing the laptop and the online app both ways.
echo The laptop needs internet (Wi-Fi or phone hotspot).
echo.
call node scripts\cloud-sync.mjs sync
if errorlevel 1 (
  echo.
  echo Sync did NOT finish. Nothing was half-changed; try again later.
) else (
  echo.
  echo Sync finished.
)
goto done

:status
echo.
call node scripts\cloud-sync.mjs status
goto done

:auto_on
echo.
echo Every 5 minutes Windows checks, without opening any window, whether the laptop or
echo the online app has changes the other doesn't have yet. If so, and the internet
echo connection is stable, they are synced both ways - even when the clinic app is closed.
echo.
schtasks /Create /F /TN "%TASK%" /SC MINUTE /MO 5 /TR "wscript.exe \"%~dp0scripts\auto-sync-hidden.vbs\""
if errorlevel 1 (
  echo.
  echo Could not turn on background sync.
) else (
  echo.
  echo Background sync is ON.
)
goto done

:auto_off
echo.
schtasks /Delete /F /TN "%TASK%"
if errorlevel 1 (
  echo Background sync was not turned on.
) else (
  echo Background sync is OFF. The clinic app still syncs automatically while it is open.
)
goto done

:first_copy
echo.
echo FIRST-TIME SETUP ONLY.
echo Copies all patients, visits and photos from the cloud database (HeatWave)
echo onto this laptop. Needs an internet connection.
echo It will not run if this laptop already has patients.
echo.
choice /c YN /m "Continue"
if errorlevel 2 goto menu
call node scripts\cloud-sync.mjs pull
if errorlevel 1 (
  echo.
  echo The copy did NOT finish. Check the internet connection and .env, then try again.
) else (
  echo.
  echo Copy finished. Start the clinic system with start-clinic.bat.
)
goto done

:done
echo.
pause
goto menu
