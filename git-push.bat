@echo off
cd /d "%~dp0"
title AetherClean - GitHub Sync Tool

:: ตรวจสอบ Python เพื่อรัน UI ภาษาไทยที่สมบูรณ์ 100%
python --version >nul 2>&1
if %errorlevel% equ 0 (
    python git_push.py
    exit /b %errorlevel%
)

:: กรณีไม่มี Python ให้ใช้คำสั่ง Git โดยตรง
echo ================================================================
echo    AetherClean Pro - Git Sync Fallback
echo ================================================================
echo.
git add .
git commit -m "Update AetherClean Pro"
git push -u origin main
pause
