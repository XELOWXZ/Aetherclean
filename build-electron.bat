@echo off
cd /d "%~dp0"
title Building AetherClean Pro (Electron App)

:: ปิด Process เดิมที่อาจเปิดค้างอยู่ เพื่อป้องกันไฟล์ล็อก
taskkill /f /im "AetherClean Pro.exe" >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1

node build-runner.js
if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo   [SUCCESS] Build completed successfully!
    echo   Executable is ready at:
    echo     %~dp0dist_electron\AetherClean Pro 1.0.0.exe
    echo ================================================================
) else (
    echo.
    echo [ERROR] Build failed. Please check the logs above.
)
pause
