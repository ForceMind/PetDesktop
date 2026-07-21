using System;
using System.Runtime.InteropServices;

namespace CocoDesktopPet
{
    internal static class NativeMethods
    {
        internal const int WsExLayered = 0x00080000;
        internal const int WsExToolWindow = 0x00000080;
        internal const int WmNcHitTest = 0x0084;
        internal const int HtTransparent = -1;
        internal const int HtClient = 1;
        internal const byte AcSrcOver = 0;
        internal const byte AcSrcAlpha = 1;
        internal const int UlwAlpha = 2;

        [StructLayout(LayoutKind.Sequential)]
        internal struct Point
        {
            internal int X;
            internal int Y;

            internal Point(int x, int y)
            {
                X = x;
                Y = y;
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct Size
        {
            internal int Cx;
            internal int Cy;

            internal Size(int cx, int cy)
            {
                Cx = cx;
                Cy = cy;
            }
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        internal struct BlendFunction
        {
            internal byte BlendOp;
            internal byte BlendFlags;
            internal byte SourceConstantAlpha;
            internal byte AlphaFormat;
        }

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern bool UpdateLayeredWindow(
            IntPtr hwnd,
            IntPtr hdcDst,
            ref Point pptDst,
            ref Size psize,
            IntPtr hdcSrc,
            ref Point pprSrc,
            int crKey,
            ref BlendFunction pblend,
            int dwFlags);

        [DllImport("user32.dll")]
        internal static extern IntPtr GetDC(IntPtr hwnd);

        [DllImport("user32.dll")]
        internal static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

        [DllImport("gdi32.dll")]
        internal static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        internal static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        internal static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

        [DllImport("gdi32.dll")]
        internal static extern bool DeleteObject(IntPtr hObject);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        internal static void TryEnableDpiAwareness()
        {
            try
            {
                SetProcessDPIAware();
            }
            catch
            {
                // Older Windows versions can ignore this; the app remains usable.
            }
        }

        internal static int SignedLowWord(IntPtr value)
        {
            return unchecked((short)((long)value & 0xFFFF));
        }

        internal static int SignedHighWord(IntPtr value)
        {
            return unchecked((short)(((long)value >> 16) & 0xFFFF));
        }
    }
}
