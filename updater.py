"""
AetherClean Self-Updater Module
ระบบอัปเดตอัตโนมัติสำหรับไฟล์ .exe เดี่ยว (PyInstaller Onefile Self-Updater)
"""

import os
import sys
import json
import time
import tempfile
import subprocess
import urllib.request
import urllib.error
from typing import Tuple, Optional, Callable, Dict, Any

# ค่าเริ่มต้นตามสเปก
APP_VERSION = "1.0.0"
DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/XELOWXZ/Aetherclean/main/version.json"


def parse_version(ver_str: str) -> Tuple:
    """แปลงเลขเวอร์ชัน (เช่น 1.0.0 หรือ 1.1.0-beta.1) เป็น tuple สำหรับเปรียบเทียบ"""
    try:
        clean_ver = ver_str.strip().lstrip('vV')
        parts = clean_ver.split('-')[0].split('.')
        nums = [int(p) for p in parts if p.isdigit()]
        is_beta = 'beta' in ver_str.lower() or 'alpha' in ver_str.lower()
        return tuple(nums) + (0 if is_beta else 1,)
    except Exception:
        return (0, 0, 0, 0)


def is_newer_version(remote_ver: str, current_ver: str = APP_VERSION) -> bool:
    """ตรวจสอบว่า remote_ver ใหม่กว่า current_ver หรือไม่"""
    return parse_version(remote_ver) > parse_version(current_ver)


def check_for_updates(
    update_url: str = DEFAULT_UPDATE_URL,
    channel: str = "stable",
    timeout: int = 10
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """
    ตรวจสอบอัปเดตจาก version.json บนเซิร์ฟเวอร์ (เช่น GitHub Raw)
    คืนค่า: (has_update, update_info, error_message)
    """
    try:
        req = urllib.request.Request(
            update_url,
            headers={"User-Agent": f"AetherClean-Updater/{APP_VERSION}"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status != 200:
                return False, None, f"HTTP Error: {response.status}"
            raw_data = response.read().decode('utf-8')
            data = json.loads(raw_data)

        if channel not in data:
            return False, None, f"ไม่พบข้อมูลสำหรับ Channel '{channel}' ใน version.json"

        channel_info = data[channel]
        remote_ver = channel_info.get("version", "")
        download_url = channel_info.get("download_url", "")

        if not remote_ver or not download_url:
            return False, None, "ข้อมูล version หรือ download_url ไม่ครบถ้วน"

        has_update = is_newer_version(remote_ver, APP_VERSION)
        return has_update, channel_info, None

    except urllib.error.URLError as e:
        return False, None, f"ไม่สามารถเชื่อมต่อได้: {e.reason}"
    except json.JSONDecodeError:
        return False, None, "รูปแบบไฟล์ version.json ไม่ถูกต้อง"
    except Exception as e:
        return False, None, str(e)


def download_update(
    download_url: str,
    target_path: str,
    progress_callback: Optional[Callable[[int, int, float], None]] = None,
    timeout: int = 60
) -> Tuple[bool, Optional[str]]:
    """
    ดาวน์โหลดไฟล์ .exe เวอร์ชันใหม่
    progress_callback(downloaded_bytes, total_bytes, percent)
    """
    try:
        req = urllib.request.Request(
            download_url,
            headers={"User-Agent": f"AetherClean-Updater/{APP_VERSION}"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            chunk_size = 64 * 1024  # 64 KB

            with open(target_path, 'wb') as out_file:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback:
                        percent = (downloaded / total_size * 100) if total_size > 0 else 0
                        progress_callback(downloaded, total_size, percent)

        return True, None
    except Exception as e:
        if os.path.exists(target_path):
            try:
                os.remove(target_path)
            except Exception:
                pass
        return False, str(e)


def apply_update_and_restart(new_exe_path: str) -> None:
    """
    สร้างสคริปต์ .bat ใน %TEMP% เพื่อสลับไฟล์และเปิดโปรแกรมเวอร์ชันใหม่
    จากนั้นปิดโปรแกรมตัวปัจจุบันทันที
    """
    # ระบุตำแหน่งไฟล์ .exe ปัจจุบันที่กำลังรันอยู่จริง
    current_exe = os.path.abspath(sys.executable)

    # หากรันในโหมด dev (python script) ไม่ใช่ compiled .exe ให้แจ้งเตือน
    if not getattr(sys, 'frozen', False):
        print(f"[Updater] รันในโหมด Python Script: จะจำลองการสลับไฟล์จาก {new_exe_path} ไปยัง {current_exe}")

    temp_dir = tempfile.gettempdir()
    bat_path = os.path.join(temp_dir, f"aetherclean_update_{int(time.time())}.bat")

    # สคริปต์ .bat ที่ทำงานอย่างรัดกุม:
    # 1. รอให้โปรแกรมเก่าปิดสนิท (2 วินาที)
    # 2. ลบ .exe ตัวเก่า
    # 3. เปลี่ยนชื่อ .exe ตัวใหม่เป็นชื่อเดิม
    # 4. สตาร์ท .exe ตัวใหม่
    # 5. ลบสคริปต์ .bat ตัวเองทิ้ง
    bat_script = f"""@echo off
chcp 65001 >nul
title AetherClean Self-Updater

echo ===================================================
echo   AetherClean กำลังทำการอัปเดตเป็นเวอร์ชันใหม่...
echo ===================================================
echo [1/4] รอให้โปรแกรมเดิมปิดตัวอย่างสมบูรณ์...
ping 127.0.0.1 -n 3 >nul

echo [2/4] นำไฟล์เวอร์ชันเก่าออก...
:RETRY_DEL
del /f /q "{current_exe}" >nul 2>&1
if exist "{current_exe}" (
    ping 127.0.0.1 -n 2 >nul
    goto RETRY_DEL
)

echo [3/4] ติดตั้งไฟล์เวอร์ชันใหม่...
move /y "{new_exe_path}" "{current_exe}" >nul

echo [4/4] เริ่มต้น AetherClean เวอร์ชันใหม่...
start "" "{current_exe}"

:: ลบสคริปต์ชั่วคราวนี้ทิ้ง
(goto) 2>nul & del /f /q "%~f0"
"""

    with open(bat_path, "w", encoding="utf-8") as f:
        f.write(bat_script)

    # รันสคริปต์ .bat ในโหมด Background Detached Process
    DETACHED_PROCESS = 0x00000008
    CREATE_NO_WINDOW = 0x08000000
    subprocess.Popen(
        ["cmd.exe", "/c", bat_path],
        creationflags=DETACHED_PROCESS | CREATE_NO_WINDOW,
        close_fds=True,
        shell=False
    )

    # ปิดโปรแกรมเดิมทันทีเพื่อปลดล็อกไฟล์ .exe ให้สคริปต์ .bat เขียนทับได้
    sys.exit(0)
