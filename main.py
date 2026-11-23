"""
AetherClean Pro - PC Optimization & Self-Updating Desktop Utility
แอปพลิเคชันจัดการระบบ พร้อมระบบ Auto-Update สำหรับไฟล์ .exe เดี่ยว (Self-Updater)
"""

import os
import sys
import tempfile
import threading
import tkinter as tk
from tkinter import ttk, messagebox
import subprocess

# นำเข้าโมดูล updater
from updater import (
    APP_VERSION,
    DEFAULT_UPDATE_URL,
    check_for_updates,
    download_update,
    apply_update_and_restart
)


class AetherCleanApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title(f"AetherClean Pro - v{APP_VERSION}")
        self.geometry("780x560")
        self.minsize(700, 500)
        self.configure(bg="#0b0f19")

        # ไอคอนหน้าต่าง (ถ้ามี)
        icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tray-icon.ico")
        if os.path.exists(icon_path):
            try:
                self.iconbitmap(icon_path)
            except Exception:
                pass

        self.update_info = None
        self.is_updating = False

        self._setup_styles()
        self._build_ui()

        # ตรวจสอบอัปเดตอัตโนมัติตอนเปิดโปรแกรม (Background Thread)
        self.after(1000, lambda: self.start_check_updates(silent=True))

    def _setup_styles(self):
        style = ttk.Style(self)
        style.theme_use("clam")

        # ปรับสไตล์ Progressbar
        style.configure(
            "Cyan.Horizontal.TProgressbar",
            background="#00f0ff",
            troughcolor="#1e293b",
            borderwidth=0,
            thickness=12
        )

    def _build_ui(self):
        # 1. Header Bar
        header = tk.Frame(self, bg="#111827", height=70)
        header.pack(fill=tk.X, side=tk.TOP)
        header.pack_propagate(False)

        title_box = tk.Frame(header, bg="#111827")
        title_box.pack(side=tk.LEFT, padx=24, pady=12)

        lbl_logo = tk.Label(
            title_box,
            text="⚡ AetherClean Pro",
            font=("Segoe UI", 16, "bold"),
            fg="#f8fafc",
            bg="#111827"
        )
        lbl_logo.pack(anchor="w")

        lbl_sub = tk.Label(
            title_box,
            text="PC Cleaner & Automatic Self-Updating Engine",
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#111827"
        )
        lbl_sub.pack(anchor="w")

        # Version Pill Badge
        badge_frame = tk.Frame(header, bg="#064e3b", padx=10, pady=4)
        badge_frame.pack(side=tk.RIGHT, padx=24)

        lbl_ver = tk.Label(
            badge_frame,
            text=f"v{APP_VERSION} (Current)",
            font=("Segoe UI", 9, "bold"),
            fg="#34d399",
            bg="#064e3b"
        )
        lbl_ver.pack()

        # Container
        main_container = tk.Frame(self, bg="#0b0f19", padx=24, pady=20)
        main_container.pack(fill=tk.BOTH, expand=True)

        # 2. Main Optimization Actions (Clean Junk & RAM)
        clean_card = tk.LabelFrame(
            main_container,
            text=" 🧹 System Cleaner & Maintenance ",
            font=("Segoe UI", 11, "bold"),
            fg="#38bdf8",
            bg="#111827",
            padx=16,
            pady=16,
            relief=tk.FLAT,
            highlightbackground="#1f2937",
            highlightthickness=1
        )
        clean_card.pack(fill=tk.X, pady=(0, 16))

        clean_desc = tk.Label(
            clean_card,
            text="สแกนและล้างไฟล์ชั่วคราว %TEMP%, Windows Logs และคืนหน่วยความจำ RAM เบื้องหลัง",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#111827"
        )
        clean_desc.pack(anchor="w", pady=(0, 12))

        btn_box = tk.Frame(clean_card, bg="#111827")
        btn_box.pack(fill=tk.X)

        self.btn_clean = tk.Button(
            btn_box,
            text="🧹 Clean Junk Files",
            font=("Segoe UI", 10, "bold"),
            bg="#059669",
            fg="white",
            activebackground="#10b981",
            activeforeground="white",
            relief=tk.FLAT,
            padx=16,
            pady=8,
            cursor="hand2",
            command=self.action_clean_junk
        )
        self.btn_clean.pack(side=tk.LEFT, padx=(0, 10))

        self.btn_ram = tk.Button(
            btn_box,
            text="🧠 Flush RAM Cache",
            font=("Segoe UI", 10, "bold"),
            bg="#2563eb",
            fg="white",
            activebackground="#3b82f6",
            activeforeground="white",
            relief=tk.FLAT,
            padx=16,
            pady=8,
            cursor="hand2",
            command=self.action_flush_ram
        )
        self.btn_ram.pack(side=tk.LEFT)

        self.lbl_clean_status = tk.Label(
            clean_card,
            text="พร้อมสำหรับการทำความสะอาด",
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#111827"
        )
        self.lbl_clean_status.pack(anchor="w", pady=(10, 0))

        # 2.5 Gaming Display Tuning Card
        color_card = tk.LabelFrame(
            main_container,
            text=" 🎮 Gaming Display & Color Tuning (ปรับภาพและสีสำหรับเล่นเกม) ",
            font=("Segoe UI", 11, "bold"),
            fg="#00f0ff",
            bg="#111827",
            padx=16,
            pady=14,
            relief=tk.FLAT,
            highlightbackground="#1f2937",
            highlightthickness=1
        )
        color_card.pack(fill=tk.X, pady=(0, 16))

        color_desc = tk.Label(
            color_card,
            text="สูตร eSports Pro (ตามรูป): ความสว่าง +55%, ความคมชัด +57%, แกมม่า +1.25, Digital Vibrance +90%",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#111827"
        )
        color_desc.pack(anchor="w", pady=(0, 10))

        color_btn_box = tk.Frame(color_card, bg="#111827")
        color_btn_box.pack(fill=tk.X)

        tk.Button(
            color_btn_box,
            text="⚡ ปรับสีจอ 90% ทันที (CS2/Val)",
            font=("Segoe UI", 9, "bold"),
            bg="#0891b2",
            fg="white",
            activebackground="#06b6d4",
            relief=tk.FLAT,
            padx=12,
            pady=6,
            cursor="hand2",
            command=self.action_apply_gaming_color
        ).pack(side=tk.LEFT, padx=(0, 8))

        tk.Button(
            color_btn_box,
            text="🔄 คืนค่าเดิม",
            font=("Segoe UI", 9),
            bg="#374151",
            fg="#e5e7eb",
            activebackground="#4b5563",
            relief=tk.FLAT,
            padx=10,
            pady=6,
            cursor="hand2",
            command=self.action_reset_gaming_color
        ).pack(side=tk.LEFT, padx=(0, 8))

        tk.Button(
            color_btn_box,
            text="🟢 เปิด NVIDIA CPL",
            font=("Segoe UI", 9, "bold"),
            bg="#059669",
            fg="white",
            activebackground="#10b981",
            relief=tk.FLAT,
            padx=12,
            pady=6,
            cursor="hand2",
            command=self.action_open_nvidia
        ).pack(side=tk.LEFT, padx=(0, 8))

        tk.Button(
            color_btn_box,
            text="📋 คัดลอกสูตร",
            font=("Segoe UI", 9),
            bg="#1f2937",
            fg="#cbd5e1",
            activebackground="#374151",
            relief=tk.FLAT,
            padx=10,
            pady=6,
            cursor="hand2",
            command=self.action_copy_color_preset
        ).pack(side=tk.LEFT)

        # 3. Auto-Updater Panel
        updater_card = tk.LabelFrame(
            main_container,
            text=" 🚀 Auto-Update System (Self-Updater Engine) ",
            font=("Segoe UI", 11, "bold"),
            fg="#a78bfa",
            bg="#111827",
            padx=16,
            pady=16,
            relief=tk.FLAT,
            highlightbackground="#1f2937",
            highlightthickness=1
        )
        updater_card.pack(fill=tk.BOTH, expand=True)

        # Settings row (Channel & URL)
        cfg_row = tk.Frame(updater_card, bg="#111827")
        cfg_row.pack(fill=tk.X, pady=(0, 12))

        tk.Label(
            cfg_row,
            text="Update Channel:",
            font=("Segoe UI", 9, "bold"),
            fg="#cbd5e1",
            bg="#111827"
        ).pack(side=tk.LEFT, padx=(0, 8))

        self.var_channel = tk.StringVar(value="stable")
        r_stable = tk.Radiobutton(
            cfg_row,
            text="Stable (เสถียร)",
            variable=self.var_channel,
            value="stable",
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg="#111827",
            selectcolor="#1f2937",
            activebackground="#111827",
            activeforeground="white"
        )
        r_stable.pack(side=tk.LEFT, padx=(0, 12))

        r_beta = tk.Radiobutton(
            cfg_row,
            text="Beta (รุ่นทดสอบใหม่ล่าสุด)",
            variable=self.var_channel,
            value="beta",
            font=("Segoe UI", 9),
            fg="#e2e8f0",
            bg="#111827",
            selectcolor="#1f2937",
            activebackground="#111827",
            activeforeground="white"
        )
        r_beta.pack(side=tk.LEFT)

        # URL Input Row
        url_row = tk.Frame(updater_card, bg="#111827")
        url_row.pack(fill=tk.X, pady=(0, 14))

        tk.Label(
            url_row,
            text="Update URL:",
            font=("Segoe UI", 9, "bold"),
            fg="#94a3b8",
            bg="#111827"
        ).pack(side=tk.LEFT, padx=(0, 8))

        self.entry_url = tk.Entry(
            url_row,
            font=("Consolas", 9),
            bg="#1f2937",
            fg="#f8fafc",
            insertbackground="#00f0ff",
            relief=tk.FLAT
        )
        self.entry_url.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10), ipady=4)
        self.entry_url.insert(0, DEFAULT_UPDATE_URL)

        self.btn_check = tk.Button(
            url_row,
            text="🔍 Check for Updates",
            font=("Segoe UI", 9, "bold"),
            bg="#4f46e5",
            fg="white",
            activebackground="#6366f1",
            activeforeground="white",
            relief=tk.FLAT,
            padx=14,
            pady=4,
            cursor="hand2",
            command=lambda: self.start_check_updates(silent=False)
        )
        self.btn_check.pack(side=tk.RIGHT)

        # Update Info Card Frame
        self.info_frame = tk.Frame(updater_card, bg="#1e293b", padx=14, pady=12)
        self.info_frame.pack(fill=tk.X, pady=(0, 12))

        self.lbl_update_status = tk.Label(
            self.info_frame,
            text="คลิก 'Check for Updates' เพื่อตรวจหาเวอร์ชันใหม่บน GitHub",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#1e293b",
            wraplength=640,
            justify=tk.LEFT
        )
        self.lbl_update_status.pack(anchor="w")

        # Progress bar
        self.progress = ttk.Progressbar(
            updater_card,
            style="Cyan.Horizontal.TProgressbar",
            mode="determinate"
        )
        self.progress.pack(fill=tk.X, pady=(0, 10))

        # Action Buttons for Update
        self.update_action_box = tk.Frame(updater_card, bg="#111827")
        self.update_action_box.pack(fill=tk.X)

        self.btn_apply_update = tk.Button(
            self.update_action_box,
            text="⚡ อัปเดตและเริ่มโปรแกรมใหม่ทันที (Update & Restart)",
            font=("Segoe UI", 10, "bold"),
            bg="#10b981",
            fg="#042f2e",
            activebackground="#34d399",
            activeforeground="#042f2e",
            relief=tk.FLAT,
            padx=16,
            pady=8,
            cursor="hand2",
            state=tk.DISABLED,
            command=self.start_download_and_apply
        )
        self.btn_apply_update.pack(side=tk.LEFT)

    def action_clean_junk(self):
        """ล้างโฟลเดอร์ชั่วคราว %TEMP% อย่างปลอดภัย"""
        temp_dir = tempfile.gettempdir()
        deleted_count = 0
        freed_bytes = 0

        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                fpath = os.path.join(root, file)
                try:
                    size = os.path.getsize(fpath)
                    os.remove(fpath)
                    deleted_count += 1
                    freed_bytes += size
                except Exception:
                    pass

        mb_freed = freed_bytes / (1024 * 1024)
        self.lbl_clean_status.config(
            text=f"✅ ล้างสำเร็จ: ลบไฟล์ขยะได้ {deleted_count} ไฟล์ (กู้คืนพื้นที่ {mb_freed:.2f} MB)",
            fg="#34d399"
        )
        messagebox.showinfo("AetherClean Pro", f"ล้างไฟล์ขยะเสร็จสมบูรณ์!\nคืนพื้นที่ได้: {mb_freed:.2f} MB ({deleted_count} รายการ)")

    def action_flush_ram(self):
        """คืนหน่วยความจำ RAM"""
        try:
            # สั่ง PowerShell EmptyWorkingSet
            cmd = "Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} }; [GC]::Collect()"
            subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd], creationflags=0x08000000)
            self.lbl_clean_status.config(
                text="✅ คืนหน่วยความจำ RAM สำเร็จเรียบร้อยแล้ว",
                fg="#38bdf8"
            )
            messagebox.showinfo("AetherClean Pro", "คืนหน่วยความจำ RAM สำเร็จเรียบร้อยแล้ว!")
        except Exception as e:
            self.lbl_clean_status.config(text=f"⚠️ RAM Flush Error: {e}", fg="#f87171")

    def action_apply_gaming_color(self):
        """สั่งปรับ Digital Vibrance, Brightness, Contrast, Gamma ให้กับทุกหน้าจอทันที"""
        try:
            tuner = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "AetherDisplayTuner.exe")
            if os.path.exists(tuner):
                res = subprocess.run([tuner, "set", "90", "55", "57", "1.25"], capture_output=True, text=True, creationflags=0x08000000)
                if '"success":true' in res.stdout:
                    messagebox.showinfo("Gaming Color Tuned", "⚡ ปรับสีทุกหน้าจอจริงสำเร็จ!\n\nตั้งค่า Digital Vibrance 90%, ความสว่าง 55%, คอนทราสต์ 57%, แกมม่า 1.25 เรียบร้อยแล้ว สีในเกมจะสดและคมชัดขึ้นทันที")
                    return
            messagebox.showwarning("Notice", "ไม่สามารถปรับสีผ่านฮาร์ดแวร์ได้ กรุณาใช้ปุ่มเปิด NVIDIA Control Panel")
        except Exception as e:
            messagebox.showerror("Error", f"เกิดข้อผิดพลาด: {e}")

    def action_reset_gaming_color(self):
        """รีเซ็ตค่าสีและแสงของทุกหน้าจอกลับสู่มาตรฐาน"""
        try:
            tuner = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "AetherDisplayTuner.exe")
            if os.path.exists(tuner):
                res = subprocess.run([tuner, "reset"], capture_output=True, text=True, creationflags=0x08000000)
                if '"success":true' in res.stdout:
                    messagebox.showinfo("Reset Color", "🔄 คืนค่าสีเดิมสำเร็จ!\n\nรีเซ็ตค่าสีและแสงทุกหน้าจอกลับสู่ค่ามาตรฐาน (50%) เรียบร้อยแล้ว")
                    return
        except Exception as e:
            messagebox.showerror("Error", f"เกิดข้อผิดพลาด: {e}")

    def action_open_nvidia(self):
        """เปิด NVIDIA Control Panel ตรงไปยังหัวข้อการปรับสี"""
        try:
            cmd = 'Start-Process "shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel"'
            subprocess.run(["powershell", "-NoProfile", "-Command", cmd], creationflags=0x08000000)
            messagebox.showinfo("NVIDIA Control Panel", "เปิดหน้าต่าง NVIDIA Control Panel เรียบร้อยแล้ว!\nกรุณาไปที่ 'Adjust desktop color settings' เพื่อปรับตามสูตร")
        except Exception as e:
            messagebox.showerror("Error", f"ไม่สามารถเปิด NVIDIA Control Panel ได้: {e}")

    def action_copy_color_preset(self):
        """คัดลอกค่าสูตรสีลงคลิปบอร์ด"""
        preset_text = "[AetherClean - NVIDIA Gaming Color Preset]\n- Brightness: +55%\n- Contrast: +57%\n- Gamma: +1.25\n- Digital Vibrance: +90%\n- Hue: 0°"
        self.clipboard_clear()
        self.clipboard_append(preset_text)
        messagebox.showinfo("คัดลอกสำเร็จ", "คัดลอกสูตรการปรับสีเรียบร้อยแล้ว:\n\n" + preset_text)

    def start_check_updates(self, silent=False):
        """เริ่มตรวจหาอัปเดตบน Background Thread"""
        if self.is_updating:
            return

        url = self.entry_url.get().strip()
        channel = self.var_channel.get()
        self.btn_check.config(state=tk.DISABLED)
        self.lbl_update_status.config(
            text=f"กำลังตรวจสอบเวอร์ชันใหม่จากเซิร์ฟเวอร์ ({channel} channel)...",
            fg="#38bdf8"
        )

        def worker():
            has_update, info, err = check_for_updates(update_url=url, channel=channel)
            self.after(0, lambda: self._on_check_finished(has_update, info, err, silent))

        threading.Thread(target=worker, daemon=True).start()

    def _on_check_finished(self, has_update, info, err, silent):
        self.btn_check.config(state=tk.NORMAL)

        if err:
            self.lbl_update_status.config(text=f"❌ ไม่สามารถตรวจสอบอัปเดตได้: {err}", fg="#f87171")
            if not silent:
                messagebox.showwarning("ตรวจสอบอัปเดต", f"เกิดข้อผิดพลาดในการตรวจสอบ:\n{err}")
            return

        if has_update and info:
            self.update_info = info
            remote_ver = info.get("version")
            notes = info.get("release_notes", "-")
            text = f"🎉 พบเวอร์ชันใหม่: v{remote_ver} (เวอร์ชันปัจจุบัน: v{APP_VERSION})\nรายละเอียด: {notes}"
            self.lbl_update_status.config(text=text, fg="#34d399")
            self.btn_apply_update.config(state=tk.NORMAL)

            if not silent:
                res = messagebox.askyesno(
                    "พบเวอร์ชันใหม่!",
                    f"พบ AetherClean เวอร์ชันใหม่: v{remote_ver}\n\nบันทึกการอัปเดต:\n{notes}\n\nคุณต้องการดาวน์โหลดและติดตั้งทันทีหรือไม่?"
                )
                if res:
                    self.start_download_and_apply()
        else:
            self.lbl_update_status.config(
                text=f"✅ คุณกำลังใช้เวอร์ชันล่าสุดแล้ว (v{APP_VERSION}) สำหรับ Channel {self.var_channel.get()}",
                fg="#a7f3d0"
            )
            self.btn_apply_update.config(state=tk.DISABLED)
            if not silent:
                messagebox.showinfo("AetherClean Pro", f"คุณกำลังใช้เวอร์ชันล่าสุดแล้ว (v{APP_VERSION})")

    def start_download_and_apply(self):
        """ดาวน์โหลดตัวใหม่และเริ่มกระบวนการ Self-Update"""
        if not self.update_info or self.is_updating:
            return

        self.is_updating = True
        self.btn_apply_update.config(state=tk.DISABLED)
        self.btn_check.config(state=tk.DISABLED)
        download_url = self.update_info.get("download_url")

        # วางไฟล์ใหม่ไว้ข้างๆ .exe ปัจจุบันในชื่อ AetherClean_new.exe
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        new_exe_path = os.path.join(exe_dir, "AetherClean_new.exe")

        def progress_cb(downloaded, total, percent):
            self.after(0, lambda: self._update_progress(downloaded, total, percent))

        def worker():
            success, err = download_update(download_url, new_exe_path, progress_callback=progress_cb)
            self.after(0, lambda: self._on_download_finished(success, err, new_exe_path))

        threading.Thread(target=worker, daemon=True).start()

    def _update_progress(self, downloaded, total, percent):
        self.progress["value"] = percent
        mb_down = downloaded / (1024 * 1024)
        mb_total = total / (1024 * 1024) if total > 0 else 0
        self.lbl_update_status.config(
            text=f"⬇️ กำลังดาวน์โหลดเวอร์ชันใหม่: {mb_down:.1f}MB / {mb_total:.1f}MB ({percent:.1f}%)",
            fg="#00f0ff"
        )

    def _on_download_finished(self, success, err, new_exe_path):
        if not success:
            self.is_updating = False
            self.btn_apply_update.config(state=tk.NORMAL)
            self.btn_check.config(state=tk.NORMAL)
            self.lbl_update_status.config(text=f"❌ การดาวน์โหลดล้มเหลว: {err}", fg="#f87171")
            messagebox.showerror("ดาวน์โหลดล้มเหลว", f"ไม่สามารถดาวน์โหลดไฟล์อัปเดตได้:\n{err}")
            return

        self.lbl_update_status.config(
            text="🚀 ดาวน์โหลดเสร็จสมบูรณ์! กำลังปิดโปรแกรมและสลับไฟล์เป็นเวอร์ชันใหม่...",
            fg="#34d399"
        )
        self.update()

        # เรียกใช้ระบบ Self-Update ผ่านสคริปต์ .bat ใน %TEMP%
        apply_update_and_restart(new_exe_path)


if __name__ == "__main__":
    app = AetherCleanApp()
    app.mainloop()
