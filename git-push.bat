@echo off
chcp 65001 > nul
cd /d "%~dp0"
title AetherClean - GitHub Auto Sync & Release Tool

echo ================================================================
echo    ⚡ AetherClean Pro - GitHub Sync & Auto-Release
echo ================================================================
echo.

:: 1. ตรวจสอบ Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบคำสั่ง Git ในเครื่อง กรุณาติดตั้ง Git ก่อนใช้งาน
    pause
    exit /b 1
)

:: 2. ตรวจสอบและตั้งค่า Git Repository
if not exist ".git" (
    echo [1/4] ยังไม่มี Git Repository กำลังตั้งค่าเบื้องต้น...
    git init
    git branch -M main
) else (
    echo [1/4] พบ Git Repository เรียบร้อย
)

:: ตรวจสอบ Remote Origin
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo กรุณากรอก URL ของ GitHub Repository ของคุณ
    echo ตัวอย่าง: https://github.com/XELOWXZ/Aetherclean.git
    set /p REPO_URL="Repository URL: "
    if not "%REPO_URL%"=="" (
        git remote add origin %REPO_URL%
    ) else (
        git remote add origin https://github.com/XELOWXZ/Aetherclean.git
    )
)

echo.
echo [2/4] กำลังตรวจสอบและเตรียมไฟล์ (Staging files)...
git add .

echo.
echo [3/4] กำลัง Commit โค้ดล่าสุด...
set COMMIT_MSG=Update AetherClean Pro - %date% %time%
git commit -m "%COMMIT_MSG%"

echo.
echo [4/4] กำลัง Push ขึ้น GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo   [SUCCESS] อัปเดตไฟล์ขึ้น GitHub เรียบร้อยแล้ว!
    echo ================================================================
    echo.
    echo คุณต้องการสร้าง Release เวอร์ชันใหม่เลยหรือไม่? (y/n)
    echo (ระบบ GitHub Actions จะบิลด์ไฟล์ .exe และสร้างหน้า Release ให้อัตโนมัติในคลาวด์)
    set /p DO_RELEASE="เลือก (y/n): "
    if /i "%DO_RELEASE%"=="y" (
        echo.
        echo กรุณากรอกเลขเวอร์ชันใหม่ (เช่น 1.0.1 หรือ 1.0.2):
        set /p NEW_VER="เวอร์ชัน: "
        if not "%NEW_VER%"=="" (
            git tag "v%NEW_VER%"
            git push origin "v%NEW_VER%"
            echo.
            echo [SUCCESS] ส่ง Tag v%NEW_VER% ขึ้น GitHub สำเร็จแล้ว!
            echo ระบบ GitHub Actions บนคลาวด์จะเริ่มบิลด์และสร้าง Release ให้อัตโนมัติทันที
        )
    )
) else (
    echo.
    echo [NOTICE] หาก Push ไม่ผ่านเนื่องจากยังไม่ได้ Login บน Git ให้รันคำสั่ง:
    echo   git push -u origin main
    echo แล้วเข้าสู่ระบบ GitHub ผ่านเบราว์เซอร์หรือใส่ Personal Access Token ครับ
)

echo.
pause
