@echo off
cd /d "%~dp0"
title Building AetherClean Pro (Electron App)
node build-runner.js
if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo   [SUCCESS] Build completed successfully!
    echo   Executable is ready at:
    echo     %~dp0dist_electron\AetherClean Pro 1.0.0.exe
    echo     %~dp0dist_electron\win-unpacked\AetherClean Pro.exe
    echo ================================================================
) else (
    echo.
    echo [ERROR] Build failed. Please check the logs above.
)
pause
