using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

public class AetherDisplayTuner {
    [DllImport("nvapi64.dll", EntryPoint = "nvapi_QueryInterface", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr QueryInterface(uint id);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate int NvAPI_Initialize_t();

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate int NvAPI_EnumNvidiaDisplayHandle_t(int thisEnum, ref IntPtr pNvDispHandle);

    [StructLayout(LayoutKind.Sequential)]
    public struct NV_DISPLAY_DVC_INFO_EX {
        public uint version;
        public int currentLevel;
        public int minLevel;
        public int maxLevel;
        public int defaultLevel;
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate int NvAPI_Disp_GetDVCInfoEx_t(IntPtr dispHandle, int outputId, ref NV_DISPLAY_DVC_INFO_EX pDVCInfo);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate int NvAPI_Disp_SetDVCLevelEx_t(IntPtr dispHandle, int outputId, ref NV_DISPLAY_DVC_INFO_EX pDVCInfo);

    // GDI APIs for Gamma, Brightness, Contrast
    [DllImport("gdi32.dll")]
    public static extern bool SetDeviceGammaRamp(IntPtr hdc, ref RAMP lpRamp);

    [DllImport("gdi32.dll")]
    public static extern bool GetDeviceGammaRamp(IntPtr hdc, ref RAMP lpRamp);

    [DllImport("gdi32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr CreateDC(string lpszDriver, string lpszDevice, string lpszOutput, IntPtr lpInitData);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(IntPtr hdc);

    [DllImport("user32.dll")]
    public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DISPLAY_DEVICE {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceKey;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct RAMP {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)]
        public ushort[] Red;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)]
        public ushort[] Green;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)]
        public ushort[] Blue;
    }

    private static RAMP BuildRamp(double brightness, double contrast, double gamma) {
        RAMP ramp = new RAMP();
        ramp.Red = new ushort[256];
        ramp.Green = new ushort[256];
        ramp.Blue = new ushort[256];

        double brightnessOffset = (brightness - 50.0) / 100.0;
        double contrastFactor = contrast / 50.0;
        if (gamma <= 0.1) gamma = 1.0;

        for (int i = 0; i < 256; i++) {
            double v = (double)i / 255.0;
            double val = (v - 0.5) * contrastFactor + 0.5 + brightnessOffset;
            if (val < 0.0) val = 0.0;
            if (val > 1.0) val = 1.0;
            double gammaVal = Math.Pow(val, 1.0 / gamma);
            if (gammaVal < 0.0) gammaVal = 0.0;
            if (gammaVal > 1.0) gammaVal = 1.0;
            ushort rampVal = (ushort)Math.Round(gammaVal * 65535.0);
            ramp.Red[i] = rampVal;
            ramp.Green[i] = rampVal;
            ramp.Blue[i] = rampVal;
        }
        return ramp;
    }

    private static int ApplyGammaToAllScreens(double brightness, double contrast, double gamma) {
        int appliedCount = 0;
        try {
            RAMP ramp = BuildRamp(brightness, contrast, gamma);
            DISPLAY_DEVICE dd = new DISPLAY_DEVICE();
            dd.cb = Marshal.SizeOf(dd);
            for (uint id = 0; EnumDisplayDevices(null, id, ref dd, 0); id++) {
                if ((dd.StateFlags & 1) != 0) { // DISPLAY_DEVICE_ATTACHED_TO_DESKTOP
                    IntPtr hdc = CreateDC(null, dd.DeviceName, null, IntPtr.Zero);
                    if (hdc != IntPtr.Zero) {
                        if (SetDeviceGammaRamp(hdc, ref ramp)) {
                            appliedCount++;
                        }
                        DeleteDC(hdc);
                    }
                }
            }
        } catch { }
        return appliedCount;
    }

    public static void Main(string[] args) {
        string action = args.Length > 0 ? args[0].ToLower() : "get";

        if (action == "open-cpl") {
            try {
                Process.Start("shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel");
                Console.WriteLine("{\"success\":true,\"action\":\"open-cpl\"}");
            } catch (Exception ex) {
                Console.WriteLine("{\"success\":false,\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}");
            }
            return;
        }

        try {
            IntPtr pInit = QueryInterface(0x0150E828);
            if (pInit == IntPtr.Zero) {
                if (action == "set" || action == "reset") {
                    double b = 50, c = 50, g = 1.0;
                    if (action == "set") {
                        if (args.Length > 2) double.TryParse(args[2], NumberStyles.Any, CultureInfo.InvariantCulture, out b);
                        if (args.Length > 3) double.TryParse(args[3], NumberStyles.Any, CultureInfo.InvariantCulture, out c);
                        if (args.Length > 4) double.TryParse(args[4], NumberStyles.Any, CultureInfo.InvariantCulture, out g);
                    }
                    int cnt = ApplyGammaToAllScreens(b, c, g);
                    Console.WriteLine("{\"success\":true,\"nvapi\":false,\"screens\":" + cnt + "}");
                } else {
                    Console.WriteLine("{\"success\":false,\"error\":\"NvAPI not available\"}");
                }
                return;
            }

            var init = (NvAPI_Initialize_t)Marshal.GetDelegateForFunctionPointer(pInit, typeof(NvAPI_Initialize_t));
            int resInit = init();
            if (resInit != 0) {
                Console.WriteLine("{\"success\":false,\"error\":\"NvAPI_Initialize returned " + resInit + "\"}");
                return;
            }

            var enumDisp = (NvAPI_EnumNvidiaDisplayHandle_t)Marshal.GetDelegateForFunctionPointer(QueryInterface(0x9ABDD40D), typeof(NvAPI_EnumNvidiaDisplayHandle_t));
            var getDVC = (NvAPI_Disp_GetDVCInfoEx_t)Marshal.GetDelegateForFunctionPointer(QueryInterface(0x0E45002D), typeof(NvAPI_Disp_GetDVCInfoEx_t));
            var setDVC = (NvAPI_Disp_SetDVCLevelEx_t)Marshal.GetDelegateForFunctionPointer(QueryInterface(0x4A82C2B1), typeof(NvAPI_Disp_SetDVCLevelEx_t));

            NV_DISPLAY_DVC_INFO_EX dvc = new NV_DISPLAY_DVC_INFO_EX();
            dvc.version = (uint)Marshal.SizeOf(typeof(NV_DISPLAY_DVC_INFO_EX)) | 0x10000;

            if (action == "get") {
                int lastVibrance = 50;
                int screenCount = 0;
                string displaysJson = "[";
                for (int i = 0; i < 8; i++) {
                    IntPtr hDisp = IntPtr.Zero;
                    int resEnum = enumDisp(i, ref hDisp);
                    if (resEnum != 0 || hDisp == IntPtr.Zero) break;

                    int resGet = getDVC(hDisp, 0, ref dvc);
                    if (resGet == 0) {
                        if (screenCount > 0) displaysJson += ",";
                        displaysJson += "{\"index\":" + i + ",\"vibrance\":" + dvc.currentLevel + "}";
                        lastVibrance = dvc.currentLevel;
                        screenCount++;
                    }
                }
                displaysJson += "]";
                Console.WriteLine("{\"success\":true,\"vibrance\":" + lastVibrance + ",\"displays\":" + displaysJson + ",\"count\":" + screenCount + ",\"min\":0,\"max\":100,\"default\":50}");
            } else if (action == "set") {
                int level = 50;
                if (args.Length > 1) int.TryParse(args[1], out level);
                if (level < 0) level = 0;
                if (level > 100) level = 100;

                double b = 50, c = 50, g = 1.0;
                if (args.Length > 2) double.TryParse(args[2], NumberStyles.Any, CultureInfo.InvariantCulture, out b);
                if (args.Length > 3) double.TryParse(args[3], NumberStyles.Any, CultureInfo.InvariantCulture, out c);
                if (args.Length > 4) double.TryParse(args[4], NumberStyles.Any, CultureInfo.InvariantCulture, out g);

                dvc.currentLevel = level;
                int updatedCount = 0;
                for (int i = 0; i < 8; i++) {
                    IntPtr hDisp = IntPtr.Zero;
                    int resEnum = enumDisp(i, ref hDisp);
                    if (resEnum != 0 || hDisp == IntPtr.Zero) break;

                    int resSet = setDVC(hDisp, 0, ref dvc);
                    if (resSet == 0) updatedCount++;
                }

                int gammaCount = ApplyGammaToAllScreens(b, c, g);
                Console.WriteLine("{\"success\":true,\"vibrance\":" + level + ",\"brightness\":" + b + ",\"contrast\":" + c + ",\"gamma\":" + g + ",\"nvidiaScreens\":" + updatedCount + ",\"gdiScreens\":" + gammaCount + "}");
            } else if (action == "reset") {
                dvc.currentLevel = 50;
                int resetCount = 0;
                for (int i = 0; i < 8; i++) {
                    IntPtr hDisp = IntPtr.Zero;
                    int resEnum = enumDisp(i, ref hDisp);
                    if (resEnum != 0 || hDisp == IntPtr.Zero) break;

                    int resReset = setDVC(hDisp, 0, ref dvc);
                    if (resReset == 0) resetCount++;
                }
                int gammaReset = ApplyGammaToAllScreens(50, 50, 1.0);
                Console.WriteLine("{\"success\":true,\"vibrance\":50,\"brightness\":50,\"contrast\":50,\"gamma\":1.0,\"nvidiaScreens\":" + resetCount + ",\"gdiScreens\":" + gammaReset + "}");
            } else {
                Console.WriteLine("{\"success\":false,\"error\":\"Unknown action\"}");
            }
        } catch (Exception ex) {
            Console.WriteLine("{\"success\":false,\"error\":\"" + ex.Message.Replace("\\", "\\\\").Replace("\"", "'") + "\"}");
        }
    }
}
