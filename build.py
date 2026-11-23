import os
import sys
import subprocess

def main():
    print("=" * 64)
    print("   AetherClean Pro - Executable Builder (PyInstaller)")
    print("=" * 64)
    print()

    # ย้าย Current Directory มาที่โฟลเดอร์ของสคริปต์
    app_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(app_dir)

    # 1. ตรวจสอบ PyInstaller
    print("[1/3] Checking PyInstaller installation...")
    try:
        import PyInstaller
        print(f"      PyInstaller version: {PyInstaller.__version__} (OK)")
    except ImportError:
        print("      PyInstaller not found. Installing now...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)

    # 2. เตรียมคำสั่ง PyInstaller
    print("\n[2/3] Building single-file executable: AetherClean.exe...")
    icon_path = os.path.join(app_dir, "tray-icon.ico")
    
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--name", "AetherClean"
    ]

    if os.path.exists(icon_path):
        print("      Found tray-icon.ico - embedding as program icon.")
        cmd.extend(["--icon", icon_path])
    else:
        print("      Note: tray-icon.ico not found, building with default icon.")

    cmd.append("main.py")

    print(f"      Running: {' '.join(cmd)}")
    print("-" * 64)

    # 3. รันการ Build
    result = subprocess.run(cmd)

    print("-" * 64)
    if result.returncode == 0:
        dist_exe = os.path.join(app_dir, "dist", "AetherClean.exe")
        print("\n" + "=" * 64)
        print("  [SUCCESS] Build completed successfully!")
        print(f"  Output File: {dist_exe}")
        if os.path.exists(dist_exe):
            size_mb = os.path.getsize(dist_exe) / (1024 * 1024)
            print(f"  File Size:   {size_mb:.2f} MB")
        print("=" * 64)
    else:
        print("\n[ERROR] Build failed with return code:", result.returncode)

    print()
    input("Press Enter to continue...")

if __name__ == "__main__":
    main()
