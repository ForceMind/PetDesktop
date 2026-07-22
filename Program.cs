using System;
using System.Globalization;
using System.Threading;
using System.Windows.Forms;

namespace CocoDesktopPet
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            bool isFirstInstance;
            using (Mutex mutex = new Mutex(true, "CocoDesktopPet.SingleInstance", out isFirstInstance))
            {
                if (!isFirstInstance)
                {
                    string cultureName = CultureInfo.CurrentUICulture.Name ?? string.Empty;
                    bool chineseUi = cultureName.Equals("zh", StringComparison.OrdinalIgnoreCase) ||
                        cultureName.StartsWith("zh-", StringComparison.OrdinalIgnoreCase);
                    MessageBox.Show(
                        chineseUi ? "Coco 已经在桌面上啦！" : "Coco is already on your desktop!",
                        chineseUi ? "Coco 桌宠" : "Coco Desktop Pet",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                NativeMethods.TryEnableDpiAwareness();
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new DesktopPetForm());
                GC.KeepAlive(mutex);
            }
        }
    }
}
