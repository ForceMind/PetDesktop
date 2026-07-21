using System;
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
                    MessageBox.Show("Coco 已经在桌面上啦！", "Coco 桌宠",
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
