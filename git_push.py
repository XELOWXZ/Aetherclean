# -*- coding: utf-8 -*-
import subprocess
import sys
import os

CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
RESET = "\033[0m"

os.system('') # Enable ANSI escape sequences on Windows

print(f"{CYAN}================================================================{RESET}")
print(f"{GREEN}   ⚡ AetherClean Pro - GitHub Sync & Auto-Release Tool{RESET}")
print(f"{CYAN}================================================================{RESET}\n")

# 1. ตรวจสอบ Git
try:
    subprocess.run(["git", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
except Exception:
    print(f"{RED}[ERROR] ไม่พบคำสั่ง Git ในเครื่อง กรุณาติดตั้ง Git ก่อนใช้งาน{RESET}")
    input("\nกด Enter เพื่อออก...")
    sys.exit(1)

# 2. ตรวจสอบ Remote Origin
try:
    res = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True)
    if res.returncode != 0:
        repo_url = "https://github.com/XELOWXZ/Aetherclean.git"
        subprocess.run(["git", "remote", "add", "origin", repo_url])
        print(f"เชื่อมต่อ Remote Origin: {repo_url}")
except Exception:
    pass

# 3. เตรียมไฟล์และ Commit
print(f"{CYAN}[1/3]{RESET} กำลังตรวจสอบไฟล์และเตรียมความพร้อม (git add .)...")
subprocess.run(["git", "add", "."])

status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
if status:
    print(f"{CYAN}[2/3]{RESET} มีไฟล์เปลี่ยนแปลง กำลัง Commit...")
    subprocess.run(["git", "commit", "-m", "Update AetherClean Pro with latest features"])
else:
    print(f"{GREEN}[2/3]{RESET} ไฟล์ทั้งหมดถูก Commit เรียบร้อยแล้ว")

# 4. Push ขึ้น GitHub
print(f"\n{CYAN}[3/3]{RESET} กำลังส่งไฟล์ขึ้น GitHub (git push -u origin main)...")
push_res = subprocess.run(["git", "push", "-u", "origin", "main"])

if push_res.returncode == 0:
    print(f"\n{GREEN}================================================================{RESET}")
    print(f"{GREEN}   [SUCCESS] อัปเดตโค้ดขึ้น GitHub เรียบร้อยแล้ว!{RESET}")
    print(f"{GREEN}================================================================{RESET}\n")

    try:
        do_rel = input("ต้องการสร้าง Release เวอร์ชันใหม่เลยหรือไม่? (y/n): ").strip().lower()
        if do_rel == 'y':
            ver = input("\nกรุณากรอกเลขเวอร์ชันใหม่ (เช่น 1.0.1 หรือ 1.0.2): ").strip()
            if ver:
                tag_name = f"v{ver}" if not ver.startswith('v') else ver
                subprocess.run(["git", "tag", tag_name])
                subprocess.run(["git", "push", "origin", tag_name])
                print(f"\n{GREEN}[SUCCESS] ส่ง Tag {tag_name} ขึ้น GitHub สำเร็จแล้ว!{RESET}")
                print(f"ระบบ GitHub Actions บนคลาวด์จะเริ่มบิลด์และสร้างไฟล์ดาวน์โหลด (.exe) ให้อัตโนมัติทันที")
    except Exception as e:
        pass
else:
    print(f"\n{YELLOW}[NOTICE] หาก Push ไม่ผ่านเนื่องจากยังไม่ได้ Login บน Git{RESET}")
    print("กรุณาตรวจสอบว่าได้ลงชื่อเข้าใช้ GitHub ผ่านเบราว์เซอร์หรือ Git Credential Manager แล้วหรือไม่")

print()
input("กด Enter เพื่อปิดหน้าต่างนี้...")
