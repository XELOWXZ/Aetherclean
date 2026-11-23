@echo off
cd /d "%~dp0"
title Building AetherClean Pro (Electron App)
echo ================================================================
echo    AetherClean Pro - Electron Executable Builder (.exe)
echo ================================================================
echo.
echo [1/2] Building Modern Neon Cyberpunk UI Executable...
call npm run build:portable
echo.
if %errorlevel% equ 0 (
    echo ================================================================
    echo   [SUCCESS] Build completed successfully!
    echo   Executable is ready at:
    echo     %~dp0dist_electron\AetherClean Pro 1.0.0.exe
    echo     %~dp0dist_electron\win-unpacked\AetherClean Pro.exe
    echo ================================================================
) else (
    echo [ERROR] Build failed. Please check the logs above.
)
pause
