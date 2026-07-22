using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace CocoDesktopPet
{
    internal sealed class DesktopPetForm : Form
    {
        private enum InteractionKind
        {
            None,
            Jump,
            Squash,
            Shake,
            Bounce,
            Nod,
            Sway,
            Spin,
            ReverseSpin,
            HopLeft,
            HopRight,
            Tiptoe,
            Stretch,
            Shrink,
            PeekLeft,
            PeekRight,
            FigureEight,
            Tremble,
            Proud,
            Bow,
            Backflip,
            Frontflip,
            Dance,
            Moonwalk,
            Heartbeat,
            Dizzy,
            Sneak,
            Charge,
            Float,
            Stomp,
            Laugh,
            Surprise,
            Sleepy
        }

        private enum DialogueLanguage
        {
            Chinese,
            English
        }

        private enum OutfitKind
        {
            Default,
            RedScarf,
            BlueCape,
            RoundGlasses,
            SailorCap
        }

        private struct RigPose
        {
            internal float Head;
            internal float LeftArm;
            internal float RightArm;
            internal float LeftLeg;
            internal float RightLeg;
            internal float HeadX;
            internal float HeadY;
            internal float LeftArmY;
            internal float RightArmY;
            internal float LeftLegY;
            internal float RightLegY;
        }

        private enum ClickRegion
        {
            Head,
            FaceLeft,
            FaceRight,
            LeftPaw,
            Body,
            RightPaw,
            Feet
        }

        private static readonly InteractionKind[] InteractionOrder =
        {
            InteractionKind.Jump,
            InteractionKind.Squash,
            InteractionKind.Shake,
            InteractionKind.Bounce,
            InteractionKind.Nod,
            InteractionKind.Sway,
            InteractionKind.Spin,
            InteractionKind.ReverseSpin,
            InteractionKind.HopLeft,
            InteractionKind.HopRight,
            InteractionKind.Tiptoe,
            InteractionKind.Stretch,
            InteractionKind.Shrink,
            InteractionKind.PeekLeft,
            InteractionKind.PeekRight,
            InteractionKind.FigureEight,
            InteractionKind.Tremble,
            InteractionKind.Proud,
            InteractionKind.Bow,
            InteractionKind.Backflip,
            InteractionKind.Frontflip,
            InteractionKind.Dance,
            InteractionKind.Moonwalk,
            InteractionKind.Heartbeat,
            InteractionKind.Dizzy,
            InteractionKind.Sneak,
            InteractionKind.Charge,
            InteractionKind.Float,
            InteractionKind.Stomp,
            InteractionKind.Laugh,
            InteractionKind.Surprise,
            InteractionKind.Sleepy
        };

        private const int BasePetHeight = 320;
        private const int JumpSpace = 54;
        private const int MinBubbleWidth = 180;
        private const int MinBubbleHeight = 78;
        private const int MaxBubbleTextWidth = 276;
        private const int BubbleGap = 12;
        private const double MinScale = 0.55;
        private const double MaxScale = 1.75;

        private readonly Timer animationTimer;
        private readonly Random random;
        private readonly ContextMenuStrip contextMenu;
        private readonly ToolStripMenuItem topMostMenuItem;
        private readonly ToolStripMenuItem sizeMenuItem;
        private readonly ToolStripMenuItem languageMenuItem;
        private readonly ToolStripMenuItem outfitMenuItem;
        private readonly ToolStripMenuItem exitMenuItem;
        private readonly ToolStripMenuItem smallSizeMenuItem;
        private readonly ToolStripMenuItem normalSizeMenuItem;
        private readonly ToolStripMenuItem largeSizeMenuItem;
        private readonly ToolStripMenuItem extraLargeSizeMenuItem;
        private readonly ToolStripMenuItem chineseLanguageMenuItem;
        private readonly ToolStripMenuItem englishLanguageMenuItem;
        private readonly ToolStripMenuItem[] outfitMenuItems;
        private readonly bool systemUsesChineseUi;

        private Bitmap petImage;
        private Bitmap[] idleFrameImages;
        private Bitmap[][] idleOutfitFrameImages;
        private Bitmap[][] actionFrameImages;
        // Kept only for compatibility with the legacy helper methods below;
        // the production renderer never populates or draws these arrays.
        private Bitmap[] idleFollowImages;
        private Bitmap[] idleLifeImages;
        private Bitmap lastFrame;
        private Bitmap rigCore;
        private Bitmap rigArmLeft;
        private Bitmap rigArmRight;
        private Bitmap rigLegLeft;
        private Bitmap rigLegRight;
        private Bitmap rigSocketArmLeft;
        private Bitmap rigSocketArmRight;
        private Bitmap rigSocketLegLeft;
        private Bitmap rigSocketLegRight;
        private Bitmap outfitScarf;
        private Bitmap outfitCape;
        private Bitmap outfitGlasses;
        private Bitmap outfitCap;
        private static Stream frameArchiveStream;
        private static ZipArchive frameArchive;
        private double scaleFactor = 1.0;
        private int petWidth;
        private int petHeight;
        private int petScreenX;
        private int petScreenY;
        private bool bubbleOnLeft = true;
        private string bubbleText = string.Empty;
        private DateTime bubbleUntil;
        private InteractionKind interaction = InteractionKind.None;
        private DateTime interactionStarted;
        private int interactionIndex;
        private DialogueLanguage dialogueLanguage = DialogueLanguage.English;
        private OutfitKind outfit = OutfitKind.Default;
        private DateTime idleStarted;
        private DateTime idleGestureStarted;
        private DateTime nextIdleGestureAt;
        private int idleGesturePair;
        private bool idleGestureActive;
        private Rectangle lastCharacterBounds;

        private bool mouseIsDown;
        private bool wasDragged;
        private Point dragStartMouse;
        private Point dragStartPet;
        private bool diagnosticFrameSaved;
        private double gazeX;
        private double gazeY;

        private static readonly string[] CommonChineseLines =
        {
            "今天也要高高兴兴～",
            "小小布偶，大大能量！",
            "再点一下试试看？",
            "Coco 的表演时间！",
            "把烦恼交给我吧～",
            "蓝羽毛状态满分！"
        };

        private static readonly string[] CommonEnglishLines =
        {
            "Good vibes only!",
            "Tiny doll, huge energy!",
            "Tap me again!",
            "It's Coco showtime!",
            "Leave your worries to me!",
            "Blue feathers: perfect!"
        };

        private static readonly string[] SimpleMixedLines =
        {
            "Nice！今天状态满分～",
            "Let's go！一起冒险吧～",
            "Good job！给自己鼓掌～",
            "Hi～今天也要开心！",
            "OK！Coco 准备好啦！",
            "Wow！这个动作帅不帅？"
        };

        internal DesktopPetForm()
        {
            systemUsesChineseUi = SystemUsesChineseUi();
            dialogueLanguage = systemUsesChineseUi
                ? DialogueLanguage.Chinese
                : DialogueLanguage.English;
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Text = UiText("Coco 桌宠", "Coco Desktop Pet");
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            AutoScaleMode = AutoScaleMode.None;
            MinimumSize = new Size(1, 1);
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint |
                     ControlStyles.OptimizedDoubleBuffer, true);

            random = new Random();
            // v2 renders one complete Coco in every frame. No body part or outfit
            // is assembled at runtime, so shoulders, hands, clothing and the
            // transparent silhouette cannot separate while animating.
            petImage = LoadResourceBitmap("frame_neutral.png");
            idleOutfitFrameImages = LoadFrameIdles(petImage);
            idleFrameImages = idleOutfitFrameImages[0];
            actionFrameImages = LoadFrameActions(petImage);
            idleFollowImages = null;
            idleLifeImages = null;
            idleStarted = DateTime.UtcNow;
            nextIdleGestureAt = idleStarted.AddMilliseconds(1800 + random.Next(1800));
            UpdatePetDimensions();

            Rectangle work = Screen.PrimaryScreen.WorkingArea;
            petScreenX = work.Right - petWidth - 28;
            petScreenY = work.Bottom - petHeight - 24;

            animationTimer = new Timer();
            // Authored whole-character frames are sampled at a stable 30 FPS.
            animationTimer.Interval = 33;
            animationTimer.Tick += AnimationTimerTick;

            contextMenu = new ContextMenuStrip();
            contextMenu.ShowImageMargin = false;
            contextMenu.Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Regular);
            contextMenu.Padding = new Padding(4);
            contextMenu.Renderer = new CocoMenuRenderer();

            sizeMenuItem = new ToolStripMenuItem();
            smallSizeMenuItem = CreateSizeMenuItem(string.Empty, 0.75);
            normalSizeMenuItem = CreateSizeMenuItem(string.Empty, 1.00);
            largeSizeMenuItem = CreateSizeMenuItem(string.Empty, 1.25);
            extraLargeSizeMenuItem = CreateSizeMenuItem(string.Empty, 1.50);
            sizeMenuItem.DropDownItems.AddRange(new ToolStripItem[]
            {
                smallSizeMenuItem,
                normalSizeMenuItem,
                largeSizeMenuItem,
                extraLargeSizeMenuItem
            });

            languageMenuItem = new ToolStripMenuItem();
            chineseLanguageMenuItem = CreateLanguageMenuItem(string.Empty, DialogueLanguage.Chinese);
            englishLanguageMenuItem = CreateLanguageMenuItem(string.Empty, DialogueLanguage.English);
            languageMenuItem.DropDownItems.AddRange(new ToolStripItem[]
            {
                chineseLanguageMenuItem,
                englishLanguageMenuItem
            });
            UpdateLanguageMenuChecks();

            outfitMenuItem = new ToolStripMenuItem();
            outfitMenuItems = new[]
            {
                CreateOutfitMenuItem(string.Empty, OutfitKind.Default),
                CreateOutfitMenuItem(string.Empty, OutfitKind.RedScarf),
                CreateOutfitMenuItem(string.Empty, OutfitKind.BlueCape),
                CreateOutfitMenuItem(string.Empty, OutfitKind.RoundGlasses),
                CreateOutfitMenuItem(string.Empty, OutfitKind.SailorCap)
            };
            outfitMenuItem.DropDownItems.AddRange(outfitMenuItems);
            UpdateOutfitMenuChecks();

            topMostMenuItem = new ToolStripMenuItem();
            topMostMenuItem.Checked = true;
            topMostMenuItem.CheckOnClick = true;
            topMostMenuItem.Click += delegate
            {
                TopMost = topMostMenuItem.Checked;
                ShowBubble(TopMost
                    ? LocalizedMessage("我会一直陪在最上面～", "I'll stay right on top!")
                    : LocalizedMessage("需要我时再叫我吧。", "Call me when you need me."), 2200);
            };

            exitMenuItem = new ToolStripMenuItem();
            exitMenuItem.Click += delegate { Close(); };

            ApplyInterfaceLanguage();

            contextMenu.Items.Add(sizeMenuItem);
            if (systemUsesChineseUi)
            {
                contextMenu.Items.Add(languageMenuItem);
            }
            contextMenu.Items.Add(outfitMenuItem);
            contextMenu.Items.Add(topMostMenuItem);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(exitMenuItem);

            MouseDown += PetMouseDown;
            MouseMove += PetMouseMove;
            MouseUp += PetMouseUp;
            MouseWheel += PetMouseWheel;
            Shown += PetShown;
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ExStyle |= NativeMethods.WsExLayered | NativeMethods.WsExToolWindow;
                return parameters;
            }
        }

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            animationTimer.Stop();
            animationTimer.Dispose();
            contextMenu.Dispose();
            if (lastFrame != null)
            {
                lastFrame.Dispose();
                lastFrame = null;
            }
            HashSet<Bitmap> authoredFrames = new HashSet<Bitmap>();
            if (petImage != null) authoredFrames.Add(petImage);
            AddImages(authoredFrames, idleFrameImages);
            if (idleOutfitFrameImages != null)
            {
                for (int index = 1; index < idleOutfitFrameImages.Length; index++)
                {
                    AddImages(authoredFrames, idleOutfitFrameImages[index]);
                }
            }
            if (actionFrameImages != null)
            {
                foreach (Bitmap[] sequence in actionFrameImages)
                {
                    AddImages(authoredFrames, sequence);
                }
            }
            foreach (Bitmap image in authoredFrames) image.Dispose();
            petImage = null;
            idleFrameImages = null;
            idleOutfitFrameImages = null;
            actionFrameImages = null;
            DisposeBitmap(ref rigCore);
            DisposeBitmap(ref rigArmLeft);
            DisposeBitmap(ref rigArmRight);
            DisposeBitmap(ref rigLegLeft);
            DisposeBitmap(ref rigLegRight);
            DisposeBitmap(ref rigSocketArmLeft);
            DisposeBitmap(ref rigSocketArmRight);
            DisposeBitmap(ref rigSocketLegLeft);
            DisposeBitmap(ref rigSocketLegRight);
            DisposeBitmap(ref outfitScarf);
            DisposeBitmap(ref outfitCape);
            DisposeBitmap(ref outfitGlasses);
            DisposeBitmap(ref outfitCap);
            if (frameArchive != null)
            {
                frameArchive.Dispose();
                frameArchive = null;
            }
            if (frameArchiveStream != null)
            {
                frameArchiveStream.Dispose();
                frameArchiveStream = null;
            }
            base.OnFormClosed(e);
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == NativeMethods.WmNcHitTest && lastFrame != null)
            {
                int screenX = NativeMethods.SignedLowWord(message.LParam);
                int screenY = NativeMethods.SignedHighWord(message.LParam);
                int localX = screenX - Left;
                int localY = screenY - Top;

                if (localX < 0 || localY < 0 || localX >= lastFrame.Width || localY >= lastFrame.Height ||
                    lastFrame.GetPixel(localX, localY).A < 18)
                {
                    message.Result = new IntPtr(NativeMethods.HtTransparent);
                    return;
                }
            }

            base.WndProc(ref message);
        }

        private void PetShown(object sender, EventArgs e)
        {
            string diagnosticOutfit = Environment.GetEnvironmentVariable("COCO_PET_DIAGNOSTIC_OUTFIT");
            OutfitKind parsedOutfit;
            if (!string.IsNullOrEmpty(diagnosticOutfit) &&
                Enum.TryParse(diagnosticOutfit, true, out parsedOutfit))
            {
                outfit = parsedOutfit;
                UpdateOutfitMenuChecks();
            }

            ShowBubble(LocalizedMessage("嗨，我是 Coco！拖我去逛逛吧～",
                "Hi, I'm Coco! Drag me around!"), 3600);
            animationTimer.Start();
            string diagnosticAction = Environment.GetEnvironmentVariable("COCO_PET_DIAGNOSTIC_ACTION");
            InteractionKind parsedAction;
            if (!string.IsNullOrEmpty(diagnosticAction) &&
                Enum.TryParse(diagnosticAction, true, out parsedAction) &&
                parsedAction != InteractionKind.None)
            {
                TriggerInteraction(parsedAction, ClickRegion.Body);
            }
            else
            {
                RenderFrame();
            }
        }

        private ToolStripMenuItem CreateSizeMenuItem(string text, double value)
        {
            ToolStripMenuItem item = new ToolStripMenuItem(text);
            item.Tag = value;
            item.Click += delegate { SetScale((double)item.Tag, true); };
            return item;
        }

        private ToolStripMenuItem CreateLanguageMenuItem(string text, DialogueLanguage language)
        {
            ToolStripMenuItem item = new ToolStripMenuItem(text);
            item.Tag = language;
            item.Click += delegate
            {
                dialogueLanguage = (DialogueLanguage)item.Tag;
                ApplyInterfaceLanguage();
                UpdateLanguageMenuChecks();
                if (dialogueLanguage == DialogueLanguage.Chinese)
                {
                    ShowBubble("中文对白已开启！", 1800);
                }
                else
                {
                    ShowBubble("English dialogue is on!", 1800);
                }
            };
            return item;
        }

        private ToolStripMenuItem CreateOutfitMenuItem(string text, OutfitKind selectedOutfit)
        {
            ToolStripMenuItem item = new ToolStripMenuItem(text);
            item.Tag = selectedOutfit;
            item.Click += delegate
            {
                outfit = (OutfitKind)item.Tag;
                // Start the selected fully rendered outfit loop at its authored
                // standing frame instead of switching halfway through a cycle.
                idleStarted = DateTime.UtcNow;
                UpdateOutfitMenuChecks();
                ShowBubble(LocalizedMessage("新造型准备好啦！", "New outfit ready!"), 1800);
            };
            return item;
        }

        private void UpdateOutfitMenuChecks()
        {
            if (outfitMenuItems == null)
            {
                return;
            }
            for (int index = 0; index < outfitMenuItems.Length; index++)
            {
                outfitMenuItems[index].Checked = (int)outfit == index;
            }
        }

        private void UpdateLanguageMenuChecks()
        {
            chineseLanguageMenuItem.Checked = dialogueLanguage == DialogueLanguage.Chinese;
            englishLanguageMenuItem.Checked = dialogueLanguage == DialogueLanguage.English;
        }

        private static bool SystemUsesChineseUi()
        {
            string cultureName = CultureInfo.CurrentUICulture.Name ?? string.Empty;
            return cultureName.Equals("zh", StringComparison.OrdinalIgnoreCase) ||
                cultureName.StartsWith("zh-", StringComparison.OrdinalIgnoreCase);
        }

        private string UiText(string chinese, string english)
        {
            return dialogueLanguage == DialogueLanguage.Chinese ? chinese : english;
        }

        private void ApplyInterfaceLanguage()
        {
            Text = UiText("Coco 桌宠", "Coco Desktop Pet");
            sizeMenuItem.Text = UiText("调整大小", "Resize");
            smallSizeMenuItem.Text = UiText("小巧  75%", "Small  75%");
            normalSizeMenuItem.Text = UiText("标准  100%", "Normal  100%");
            largeSizeMenuItem.Text = UiText("大号  125%", "Large  125%");
            extraLargeSizeMenuItem.Text = UiText("超大  150%", "Extra Large  150%");
            languageMenuItem.Text = UiText("对白语言", "Dialogue Language");
            chineseLanguageMenuItem.Text = UiText("中文（可混合简单 English）", "Chinese (light English)");
            englishLanguageMenuItem.Text = UiText("English（纯英文）", "English only");
            outfitMenuItem.Text = UiText("换装", "Outfit");
            outfitMenuItems[0].Text = UiText("默认", "Default");
            outfitMenuItems[1].Text = UiText("红围巾", "Red Scarf");
            outfitMenuItems[2].Text = UiText("蓝披风", "Blue Cape");
            outfitMenuItems[3].Text = UiText("圆眼镜", "Round Glasses");
            outfitMenuItems[4].Text = UiText("海军帽", "Sailor Cap");
            topMostMenuItem.Text = UiText("始终置顶", "Always on Top");
            exitMenuItem.Text = UiText("退出 Coco", "Quit Coco");
        }

        private static Bitmap LoadPetImage()
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream stream = assembly.GetManifestResourceStream("CocoDesktopPet.coco.png"))
            {
                if (stream == null)
                {
                    throw new InvalidOperationException(SystemUsesChineseUi()
                        ? "找不到内置的 Coco 图片资源。"
                        : "The embedded Coco image resource is missing.");
                }

                using (Bitmap source = new Bitmap(stream))
                {
                    return TrimTransparentPixels(source, 4);
                }
            }
        }

        private static Bitmap LoadResourceBitmap(string resourceName)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            Stream stream = assembly.GetManifestResourceStream("CocoDesktopPet." + resourceName);
            if (stream == null && resourceName.StartsWith("frame_", StringComparison.Ordinal))
            {
                EnsureFrameArchive();
                ZipArchiveEntry entry = frameArchive.GetEntry(resourceName);
                if (entry != null)
                {
                    stream = entry.Open();
                }
            }

            if (stream == null)
            {
                throw new InvalidOperationException("Missing embedded image resource: " + resourceName);
            }

            using (stream)
            {
                using (Bitmap source = new Bitmap(stream))
                {
                    Bitmap copy = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
                    using (Graphics graphics = Graphics.FromImage(copy))
                    {
                        graphics.DrawImageUnscaled(source, 0, 0);
                    }
                    return copy;
                }
            }
        }

        private static void EnsureFrameArchive()
        {
            if (frameArchive != null)
            {
                return;
            }
            frameArchiveStream = Assembly.GetExecutingAssembly().GetManifestResourceStream(
                "CocoDesktopPet.frame_animation.zip");
            if (frameArchiveStream == null)
            {
                throw new InvalidOperationException("Missing embedded frame animation archive.");
            }
            frameArchive = new ZipArchive(frameArchiveStream, ZipArchiveMode.Read, false);
        }

        private static void DisposeBitmap(ref Bitmap image)
        {
            if (image == null)
            {
                return;
            }
            image.Dispose();
            image = null;
        }

        private static Bitmap[] LoadActionImages(string suffix)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            Bitmap[] images = new Bitmap[InteractionOrder.Length];
            for (int index = 0; index < images.Length; index++)
            {
                string resourceName = string.Format("CocoDesktopPet.action_{0:D2}{1}.png",
                    index + 1, suffix);
                using (Stream stream = assembly.GetManifestResourceStream(resourceName))
                {
                if (stream == null)
                {
                    throw new InvalidOperationException(SystemUsesChineseUi()
                        ? "找不到动作图片资源：" + resourceName
                        : "The action image resource is missing: " + resourceName);
                    }

                    using (Bitmap source = new Bitmap(stream))
                    {
                        images[index] = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
                        using (Graphics graphics = Graphics.FromImage(images[index]))
                        {
                            graphics.DrawImageUnscaled(source, 0, 0);
                        }
                    }
                }
            }
            return images;
        }

        private static Bitmap[] LoadImageSequence(string prefix, int count)
        {
            Bitmap[] images = new Bitmap[count];
            for (int index = 0; index < count; index++)
            {
                string resourceName = string.Format("{0}_{1:D2}.png",
                    prefix, index + 1);
                images[index] = LoadResourceBitmap(resourceName);
            }
            return images;
        }

        private static Bitmap[][] LoadFrameActions(Bitmap neutral)
        {
            Bitmap[][] actions = new Bitmap[InteractionOrder.Length][];
            for (int actionIndex = 0; actionIndex < actions.Length; actionIndex++)
            {
                actions[actionIndex] = new Bitmap[8];
                actions[actionIndex][0] = neutral;
                actions[actionIndex][7] = neutral;
                for (int frameIndex = 1; frameIndex < 7; frameIndex++)
                {
                    string resourceName = string.Format("frame_action_{0:D2}_{1:D2}.png",
                        actionIndex + 1, frameIndex + 1);
                    actions[actionIndex][frameIndex] = LoadResourceBitmap(resourceName);
                }
            }
            return actions;
        }

        private static Bitmap[][] LoadFrameIdles(Bitmap neutral)
        {
            Bitmap[][] outfits = new Bitmap[5][];
            for (int outfitIndex = 0; outfitIndex < outfits.Length; outfitIndex++)
            {
                outfits[outfitIndex] = new Bitmap[7];
                for (int frameIndex = 0; frameIndex < 6; frameIndex++)
                {
                    if (outfitIndex == 0 && frameIndex == 0)
                    {
                        outfits[outfitIndex][frameIndex] = neutral;
                        continue;
                    }
                    string resourceName = string.Format("frame_idle_{0:D2}_{1:D2}.png",
                        outfitIndex, frameIndex + 1);
                    outfits[outfitIndex][frameIndex] = LoadResourceBitmap(resourceName);
                }
                outfits[outfitIndex][6] = outfits[outfitIndex][0];
            }
            return outfits;
        }

        private static void DisposeImages(Bitmap[] images)
        {
            if (images == null)
            {
                return;
            }
            foreach (Bitmap image in images)
            {
                if (image != null) image.Dispose();
            }
        }

        private static void AddImages(HashSet<Bitmap> target, Bitmap[] images)
        {
            if (images == null) return;
            foreach (Bitmap image in images)
            {
                if (image != null) target.Add(image);
            }
        }

        private static Bitmap TrimTransparentPixels(Bitmap source, int padding)
        {
            Bitmap working = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
            using (Graphics graphics = Graphics.FromImage(working))
            {
                graphics.DrawImageUnscaled(source, 0, 0);
            }

            Rectangle bounds = new Rectangle(0, 0, working.Width, working.Height);
            BitmapData data = working.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int minX = working.Width;
            int minY = working.Height;
            int maxX = -1;
            int maxY = -1;

            try
            {
                int bytes = Math.Abs(data.Stride) * data.Height;
                byte[] pixels = new byte[bytes];
                Marshal.Copy(data.Scan0, pixels, 0, bytes);

                for (int y = 0; y < data.Height; y++)
                {
                    int row = y * data.Stride;
                    for (int x = 0; x < data.Width; x++)
                    {
                        if (pixels[row + x * 4 + 3] > 8)
                        {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
            }
            finally
            {
                working.UnlockBits(data);
            }

            if (maxX < minX || maxY < minY)
            {
                return working;
            }

            minX = Math.Max(0, minX - padding);
            minY = Math.Max(0, minY - padding);
            maxX = Math.Min(working.Width - 1, maxX + padding);
            maxY = Math.Min(working.Height - 1, maxY + padding);
            Rectangle crop = Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
            Bitmap trimmed = working.Clone(crop, PixelFormat.Format32bppArgb);
            working.Dispose();
            return trimmed;
        }

        private void PetMouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                mouseIsDown = true;
                wasDragged = false;
                dragStartMouse = Cursor.Position;
                dragStartPet = new Point(petScreenX, petScreenY);
                Capture = true;
            }
            else if (e.Button == MouseButtons.Right)
            {
                UpdateSizeMenuChecks();
                contextMenu.Show(Cursor.Position);
            }
        }

        private void PetMouseMove(object sender, MouseEventArgs e)
        {
            if (!mouseIsDown || e.Button != MouseButtons.Left)
            {
                return;
            }

            Point current = Cursor.Position;
            int dx = current.X - dragStartMouse.X;
            int dy = current.Y - dragStartMouse.Y;
            if (!wasDragged && Math.Abs(dx) + Math.Abs(dy) >= 5)
            {
                wasDragged = true;
            }

            if (wasDragged)
            {
                petScreenX = dragStartPet.X + dx;
                petScreenY = dragStartPet.Y + dy;
                ClampPetToScreen();
                RenderFrame();
            }
        }

        private void PetMouseUp(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left || !mouseIsDown)
            {
                return;
            }

            mouseIsDown = false;
            Capture = false;

            if (!wasDragged)
            {
                if (lastCharacterBounds.Contains(e.Location))
                {
                    ClickRegion region = ClassifyClickRegion(e.Location);
                    TriggerInteraction(PickInteractionForRegion(region), region);
                }
            }
            else
            {
                RenderFrame();
            }
        }

        private void PetMouseWheel(object sender, MouseEventArgs e)
        {
            double next = scaleFactor + (e.Delta > 0 ? 0.10 : -0.10);
            SetScale(next, false);
        }

        private void SetScale(double requestedScale, bool fromMenu)
        {
            double nextScale = Math.Max(MinScale, Math.Min(MaxScale, requestedScale));
            nextScale = Math.Round(nextScale, 2);
            if (Math.Abs(nextScale - scaleFactor) < 0.001)
            {
                return;
            }

            int oldCenterX = petScreenX + petWidth / 2;
            int oldBottom = petScreenY + petHeight;
            scaleFactor = nextScale;
            UpdatePetDimensions();
            petScreenX = oldCenterX - petWidth / 2;
            petScreenY = oldBottom - petHeight;
            ClampPetToScreen();
            UpdateSizeMenuChecks();
            ShowBubble(fromMenu
                ? LocalizedMessage("大小调好啦！", "Size updated!")
                : LocalizedMessage("滚一滚，我就变身～", "Scroll and watch me resize!"), 1500);
        }

        private void UpdatePetDimensions()
        {
            petHeight = Math.Max(120, (int)Math.Round(BasePetHeight * scaleFactor));
            // All authored v2 frames use a square canvas. Preserve that canvas
            // exactly; non-square drawing would visibly stretch Coco.
            petWidth = petHeight;
        }

        private void UpdateSizeMenuChecks()
        {
            smallSizeMenuItem.Checked = Math.Abs(scaleFactor - 0.75) < 0.01;
            normalSizeMenuItem.Checked = Math.Abs(scaleFactor - 1.00) < 0.01;
            largeSizeMenuItem.Checked = Math.Abs(scaleFactor - 1.25) < 0.01;
            extraLargeSizeMenuItem.Checked = Math.Abs(scaleFactor - 1.50) < 0.01;
        }

        private ClickRegion ClassifyClickRegion(Point point)
        {
            Rectangle bounds = lastCharacterBounds;
            if (bounds.Width <= 0 || bounds.Height <= 0)
            {
                return ClickRegion.Body;
            }

            double x = Math.Max(0.0, Math.Min(1.0,
                (point.X - bounds.Left) / (double)bounds.Width));
            double y = Math.Max(0.0, Math.Min(1.0,
                (point.Y - bounds.Top) / (double)bounds.Height));

            if (y < 0.20)
            {
                return ClickRegion.Head;
            }
            if (y < 0.46)
            {
                return x < 0.5 ? ClickRegion.FaceLeft : ClickRegion.FaceRight;
            }
            if (y < 0.76)
            {
                if (x < 0.31) return ClickRegion.LeftPaw;
                if (x > 0.69) return ClickRegion.RightPaw;
                return ClickRegion.Body;
            }
            return ClickRegion.Feet;
        }

        private InteractionKind PickInteractionForRegion(ClickRegion region)
        {
            InteractionKind[] choices;
            switch (region)
            {
                case ClickRegion.Head:
                    choices = new[] { InteractionKind.Nod, InteractionKind.Proud,
                        InteractionKind.Surprise, InteractionKind.Float, InteractionKind.Sleepy };
                    break;
                case ClickRegion.FaceLeft:
                    choices = new[] { InteractionKind.PeekLeft, InteractionKind.Shake,
                        InteractionKind.Dizzy, InteractionKind.Sway };
                    break;
                case ClickRegion.FaceRight:
                    choices = new[] { InteractionKind.PeekRight, InteractionKind.ReverseSpin,
                        InteractionKind.Laugh, InteractionKind.Heartbeat };
                    break;
                case ClickRegion.LeftPaw:
                    choices = new[] { InteractionKind.HopLeft, InteractionKind.Bow,
                        InteractionKind.Dance, InteractionKind.Moonwalk };
                    break;
                case ClickRegion.RightPaw:
                    choices = new[] { InteractionKind.HopRight, InteractionKind.Charge,
                        InteractionKind.Spin, InteractionKind.FigureEight };
                    break;
                case ClickRegion.Feet:
                    choices = new[] { InteractionKind.Jump, InteractionKind.Bounce,
                        InteractionKind.Stomp, InteractionKind.Tiptoe,
                        InteractionKind.Backflip, InteractionKind.Frontflip };
                    break;
                default:
                    choices = new[] { InteractionKind.Squash, InteractionKind.Heartbeat,
                        InteractionKind.Laugh, InteractionKind.Shrink,
                        InteractionKind.Tremble, InteractionKind.Sneak, InteractionKind.Stretch };
                    break;
            }
            return choices[random.Next(choices.Length)];
        }

        private void TriggerInteraction(InteractionKind selectedInteraction, ClickRegion region)
        {
            interaction = selectedInteraction;
            interactionIndex++;
            interactionStarted = DateTime.UtcNow;
            idleGestureActive = false;
            Text = string.Format(UiText("Coco 桌宠 - {0} - {1}",
                "Coco Desktop Pet - {0} - {1}"), region, interaction);
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("COCO_PET_DIAGNOSTIC_FRAME")))
            {
                diagnosticFrameSaved = false;
            }

            bubbleText = random.Next(3) == 0
                ? PickRegionDialogue(region)
                : PickDialogue(interaction);
            bubbleUntil = DateTime.UtcNow.AddMilliseconds(2600);
            animationTimer.Start();
            RenderFrame();
        }

        private string PickRegionDialogue(ClickRegion region)
        {
            bool english = dialogueLanguage == DialogueLanguage.English;
            switch (region)
            {
                case ClickRegion.Head:
                    return english ? "Careful with my blue feathers!" : "摸摸头，羽毛可别弄乱啦～";
                case ClickRegion.FaceLeft:
                    return english ? "That cheek is ticklish!" : "左脸有一点怕痒！";
                case ClickRegion.FaceRight:
                    return english ? "You found my playful side!" : "右边被你发现啦！";
                case ClickRegion.LeftPaw:
                    return english ? "Left-paw high five!" : "左手击掌，High five！";
                case ClickRegion.RightPaw:
                    return english ? "Right paw ready!" : "右手已经准备好啦！";
                case ClickRegion.Feet:
                    return english ? "My feet want to jump!" : "脚底痒痒，要跳起来啦！";
                default:
                    return english ? "My belly is very ticklish!" : "哈哈，肚皮最怕痒了！";
            }
        }

        private string PickDialogue(InteractionKind kind)
        {
            if (dialogueLanguage == DialogueLanguage.Chinese && random.Next(5) == 0)
            {
                return SimpleMixedLines[random.Next(SimpleMixedLines.Length)];
            }

            bool useEnglish = dialogueLanguage == DialogueLanguage.English;

            if (random.Next(4) == 0)
            {
                string[] common = useEnglish ? CommonEnglishLines : CommonChineseLines;
                return common[random.Next(common.Length)];
            }

            return useEnglish ? PickEnglishDialogue(kind) : PickChineseDialogue(kind);
        }

        private string LocalizedMessage(string chinese, string english)
        {
            return dialogueLanguage == DialogueLanguage.English ? english : chinese;
        }

        private string PickChineseDialogue(InteractionKind kind)
        {
            bool first = random.Next(2) == 0;
            switch (kind)
            {
                case InteractionKind.Jump: return first ? "看我起飞！" : "摸高成功！";
                case InteractionKind.Squash: return first ? "我只是变扁了一下！" : "弹性满分～";
                case InteractionKind.Shake: return first ? "抖落一点小烦恼！" : "蓝羽毛还在吗？";
                case InteractionKind.Bounce: return first ? "弹弹弹，停不下来！" : "今天弹性很好～";
                case InteractionKind.Nod: return first ? "嗯嗯，我同意！" : "点头通过～";
                case InteractionKind.Sway: return first ? "随风摇摆～" : "羽毛在跳舞！";
                case InteractionKind.Spin: return first ? "转一圈给你看！" : "别眨眼哦～";
                case InteractionKind.ReverseSpin: return first ? "反方向再来一圈！" : "放心，我没晕～";
                case InteractionKind.HopLeft: return first ? "向左探险！" : "左边有惊喜吗？";
                case InteractionKind.HopRight: return first ? "向右出发！" : "右边也看看～";
                case InteractionKind.Tiptoe: return first ? "踮起脚看一看～" : "我是不是更高了？";
                case InteractionKind.Stretch: return first ? "伸个大懒腰！" : "长高一点点～";
                case InteractionKind.Shrink: return first ? "开启迷你模式！" : "小小一只也可爱～";
                case InteractionKind.PeekLeft: return first ? "左边是谁呀？" : "偷偷看一眼～";
                case InteractionKind.PeekRight: return first ? "右边有动静！" : "让我瞧瞧～";
                case InteractionKind.FigureEight: return first ? "画个幸运八！" : "路线有点花哨～";
                case InteractionKind.Tremble: return first ? "能量正在加载！" : "抖一抖更精神！";
                case InteractionKind.Proud: return first ? "今天也很神气！" : "夸夸我的蓝羽毛～";
                case InteractionKind.Bow: return first ? "谢谢你的陪伴！" : "Coco 向你行礼～";
                case InteractionKind.Backflip: return first ? "后空翻，完成！" : "羽毛一点没乱～";
                case InteractionKind.Frontflip: return first ? "前空翻也会哦！" : "稳稳落地！";
                case InteractionKind.Dance: return first ? "跟着节奏摇起来！" : "这是 Coco 舞步～";
                case InteractionKind.Moonwalk: return first ? "看我的太空步！" : "悄悄滑过去～";
                case InteractionKind.Heartbeat: return first ? "心情值加一！" : "扑通扑通～";
                case InteractionKind.Dizzy: return first ? "好多小星星……" : "转得我眼冒金星！";
                case InteractionKind.Sneak: return first ? "嘘，轻轻地走～" : "潜行模式开启！";
                case InteractionKind.Charge: return first ? "蓄力——冲呀！" : "Coco 冲锋！";
                case InteractionKind.Float: return first ? "轻飘飘飞起来～" : "云朵借我坐一下！";
                case InteractionKind.Stomp: return first ? "咚！气势满分！" : "地板没事吧？";
                case InteractionKind.Laugh: return first ? "哈哈，停不下来！" : "今天真开心～";
                case InteractionKind.Surprise: return first ? "哇！被你发现了！" : "惊喜时间到！";
                case InteractionKind.Sleepy: return first ? "有一点点困啦……" : "借我打个小盹～";
                default: return "Coco 在这里！";
            }
        }

        private string PickEnglishDialogue(InteractionKind kind)
        {
            bool first = random.Next(2) == 0;
            switch (kind)
            {
                case InteractionKind.Jump: return first ? "Watch me fly!" : "New height record!";
                case InteractionKind.Squash: return first ? "Just a little squished!" : "Maximum bounce!";
                case InteractionKind.Shake: return first ? "Shake the worries away!" : "Feathers still there?";
                case InteractionKind.Bounce: return first ? "Boing, boing, boing!" : "Extra bouncy today!";
                case InteractionKind.Nod: return first ? "Yes, I agree!" : "Coco approved!";
                case InteractionKind.Sway: return first ? "Sway with the breeze!" : "My feathers can dance!";
                case InteractionKind.Spin: return first ? "One spin, coming up!" : "Don't blink!";
                case InteractionKind.ReverseSpin: return first ? "Reverse spin!" : "I'm not dizzy... yet!";
                case InteractionKind.HopLeft: return first ? "Adventure to the left!" : "Anything over there?";
                case InteractionKind.HopRight: return first ? "Right we go!" : "Let's check this side!";
                case InteractionKind.Tiptoe: return first ? "Up on my toes!" : "Do I look taller?";
                case InteractionKind.Stretch: return first ? "Big morning stretch!" : "Growing a little taller!";
                case InteractionKind.Shrink: return first ? "Mini Coco mode!" : "Tiny is cute too!";
                case InteractionKind.PeekLeft: return first ? "Who's on the left?" : "Just a quick peek!";
                case InteractionKind.PeekRight: return first ? "Something on the right!" : "Let me take a look!";
                case InteractionKind.FigureEight: return first ? "A lucky figure eight!" : "Fancy footwork!";
                case InteractionKind.Tremble: return first ? "Energy loading!" : "Shake into action!";
                case InteractionKind.Proud: return first ? "Looking sharp today!" : "Admire my blue feathers!";
                case InteractionKind.Bow: return first ? "Thanks for being here!" : "A bow from Coco!";
                case InteractionKind.Backflip: return first ? "Backflip complete!" : "Not a feather moved!";
                case InteractionKind.Frontflip: return first ? "Front flip time!" : "Perfect landing!";
                case InteractionKind.Dance: return first ? "Feel the rhythm!" : "The Coco shuffle!";
                case InteractionKind.Moonwalk: return first ? "Check my moonwalk!" : "Sliding by quietly!";
                case InteractionKind.Heartbeat: return first ? "Mood level plus one!" : "Ba-dum, ba-dum!";
                case InteractionKind.Dizzy: return first ? "So many stars..." : "Okay, now I'm dizzy!";
                case InteractionKind.Sneak: return first ? "Shh, sneaking through!" : "Stealth mode on!";
                case InteractionKind.Charge: return first ? "Ready... charge!" : "Coco rush!";
                case InteractionKind.Float: return first ? "Light as a cloud!" : "Up, up, and away!";
                case InteractionKind.Stomp: return first ? "Boom! Full power!" : "Is the floor okay?";
                case InteractionKind.Laugh: return first ? "Ha-ha, I can't stop!" : "What a happy day!";
                case InteractionKind.Surprise: return first ? "Whoa! You found me!" : "Surprise time!";
                case InteractionKind.Sleepy: return first ? "Getting a little sleepy..." : "Just a tiny nap...";
                default: return "Coco is here!";
            }
        }

        private void ShowBubble(string text, int milliseconds)
        {
            bubbleText = text;
            bubbleUntil = DateTime.UtcNow.AddMilliseconds(milliseconds);
            animationTimer.Start();
            RenderFrame();
        }

        private void AnimationTimerTick(object sender, EventArgs e)
        {
            DateTime now = DateTime.UtcNow;
            UpdateContinuousGaze();
            if (interaction != InteractionKind.None &&
                (now - interactionStarted).TotalMilliseconds >= InteractionDuration(interaction))
            {
                interaction = InteractionKind.None;
                // Every joint curve ends at zero, so resetting the idle clock
                // continues from the exact same neutral rig without a hard cut.
                idleStarted = now;
                Text = UiText("Coco 桌宠 - 待机", "Coco Desktop Pet - Idle");
                nextIdleGestureAt = now.AddMilliseconds(700 + random.Next(900));
            }

            if (!string.IsNullOrEmpty(bubbleText) && now >= bubbleUntil)
            {
                bubbleText = string.Empty;
            }

            if (interaction == InteractionKind.None)
            {
                UpdateIdleGesture(now);
            }

            RenderFrame();
        }

        private void UpdateIdleGesture(DateTime now)
        {
            if (mouseIsDown)
            {
                return;
            }

            if (idleGestureActive)
            {
                if ((now - idleGestureStarted).TotalMilliseconds >= 1800.0)
                {
                    idleGestureActive = false;
                    nextIdleGestureAt = now.AddMilliseconds(2200 + random.Next(3000));
                }
                return;
            }

            if (now >= nextIdleGestureAt)
            {
                idleGesturePair = random.Next(4);
                idleGestureStarted = now;
                idleGestureActive = true;
            }
        }

        private static double InteractionDuration(InteractionKind kind)
        {
            switch (kind)
            {
                case InteractionKind.Jump: return 760.0;
                case InteractionKind.Squash: return 820.0;
                case InteractionKind.Shake: return 720.0;
                case InteractionKind.Bounce: return 1050.0;
                case InteractionKind.Nod: return 820.0;
                case InteractionKind.Sway: return 1100.0;
                case InteractionKind.Spin:
                case InteractionKind.ReverseSpin: return 1050.0;
                case InteractionKind.HopLeft:
                case InteractionKind.HopRight: return 920.0;
                case InteractionKind.Tiptoe: return 900.0;
                case InteractionKind.Stretch:
                case InteractionKind.Shrink: return 980.0;
                case InteractionKind.PeekLeft:
                case InteractionKind.PeekRight: return 1000.0;
                case InteractionKind.FigureEight: return 1250.0;
                case InteractionKind.Tremble: return 780.0;
                case InteractionKind.Proud: return 1050.0;
                case InteractionKind.Bow: return 1100.0;
                case InteractionKind.Backflip:
                case InteractionKind.Frontflip: return 1150.0;
                case InteractionKind.Dance: return 1450.0;
                case InteractionKind.Moonwalk: return 1200.0;
                case InteractionKind.Heartbeat: return 1050.0;
                case InteractionKind.Dizzy: return 1300.0;
                case InteractionKind.Sneak: return 1250.0;
                case InteractionKind.Charge: return 980.0;
                case InteractionKind.Float: return 1500.0;
                case InteractionKind.Stomp: return 1050.0;
                case InteractionKind.Laugh: return 1200.0;
                case InteractionKind.Surprise: return 900.0;
                case InteractionKind.Sleepy: return 1600.0;
                default: return 0.0;
            }
        }

        private void ClampPetToScreen()
        {
            Rectangle work = Screen.FromPoint(new Point(
                petScreenX + petWidth / 2,
                petScreenY + petHeight / 2)).WorkingArea;
            const int visibleMargin = 18;
            petScreenX = Math.Max(work.Left - petWidth + visibleMargin,
                Math.Min(work.Right - visibleMargin, petScreenX));
            petScreenY = Math.Max(work.Top,
                Math.Min(work.Bottom - visibleMargin, petScreenY));
        }

        private void RenderFrame()
        {
            if (!IsHandleCreated || petImage == null)
            {
                return;
            }

            Rectangle work = Screen.FromPoint(new Point(
                petScreenX + petWidth / 2,
                petScreenY + petHeight / 2)).WorkingArea;
            bool desiredBubbleOnLeft = petScreenX + petWidth / 2 > work.Left + work.Width / 2;
            bubbleOnLeft = desiredBubbleOnLeft;

            Size bubbleSize = MeasureSpeechBubble();
            int bubbleLayoutWidth = bubbleSize.IsEmpty ? 0 : bubbleSize.Width;
            int bubbleLayoutGap = bubbleSize.IsEmpty ? 0 : BubbleGap;
            int motionSideSpace = Math.Max(32, petHeight / 2);
            int motionBottomSpace = Math.Max(20, petHeight / 10);
            int characterY = JumpSpace + motionBottomSpace;
            int frameWidth = petWidth + bubbleLayoutGap + bubbleLayoutWidth + motionSideSpace * 2;
            int frameHeight = Math.Max(characterY + petHeight + motionBottomSpace,
                characterY + 18 + bubbleSize.Height);
            int characterX = bubbleOnLeft
                ? motionSideSpace + bubbleLayoutWidth + bubbleLayoutGap
                : motionSideSpace;
            int frameX = petScreenX - characterX;
            int frameY = petScreenY - characterY;

            Bitmap frame = new Bitmap(frameWidth, frameHeight, PixelFormat.Format32bppPArgb);
            using (Graphics graphics = Graphics.FromImage(frame))
            {
                graphics.Clear(Color.Transparent);
                graphics.CompositingMode = CompositingMode.SourceOver;
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.SmoothingMode = SmoothingMode.AntiAlias;

                GraphicsState state = graphics.Save();
                graphics.TranslateTransform(characterX + petWidth / 2F,
                    characterY + petHeight);

                lastCharacterBounds = new Rectangle(characterX, characterY, petWidth, petHeight);
                DrawFrameTimeline(graphics, petHeight);
                graphics.Restore(state);

                if (!string.IsNullOrEmpty(bubbleText))
                {
                    DrawSpeechBubble(graphics, characterX, characterY, bubbleSize);
                }
            }

            string diagnosticPath = Environment.GetEnvironmentVariable("COCO_PET_DIAGNOSTIC_FRAME");
            bool waitingForDiagnosticAction = interaction == InteractionKind.None &&
                !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(
                    "COCO_PET_DIAGNOSTIC_ACTION"));
            double diagnosticProgress = GetInteractionProgress();
            if (!waitingForDiagnosticAction && !diagnosticFrameSaved &&
                !string.IsNullOrEmpty(diagnosticPath) &&
                (interaction == InteractionKind.None ||
                 (diagnosticProgress >= 0.56 && diagnosticProgress <= 0.72)))
            {
                frame.Save(diagnosticPath, ImageFormat.Png);
                diagnosticFrameSaved = true;
                if (!string.IsNullOrEmpty(
                    Environment.GetEnvironmentVariable("COCO_PET_DIAGNOSTIC_EXIT")))
                {
                    BeginInvoke(new Action(Close));
                }
            }

            Rectangle nextBounds = new Rectangle(frameX, frameY, frameWidth, frameHeight);
            if (Bounds != nextBounds)
            {
                SetBounds(frameX, frameY, frameWidth, frameHeight, BoundsSpecified.All);
            }
            ApplyLayeredBitmap(frame);

            Bitmap oldFrame = lastFrame;
            lastFrame = frame;
            if (oldFrame != null)
            {
                oldFrame.Dispose();
            }
        }

        private void DrawFrameTimeline(Graphics graphics, int canvasSize)
        {
            Bitmap first;
            Bitmap second;
            float blend;
            GetFrameTimeline(out first, out second, out blend);

            // The v2 timeline deliberately renders exactly one opaque authored
            // frame. Drawing a second frame, even with a nominal zero opacity,
            // risks translucent contours in layered-window composition.
            GraphicsState state = graphics.Save();
            PointF motion = GetAuthoredActionOffset(canvasSize);
            graphics.TranslateTransform(motion.X, motion.Y);
            DrawSprite(graphics, first, canvasSize, canvasSize, false, 1F);
            graphics.Restore(state);
        }

        private PointF GetAuthoredActionOffset(int canvasSize)
        {
            if (interaction == InteractionKind.None)
            {
                return PointF.Empty;
            }

            double t = Math.Max(0.0, Math.Min(1.0, GetInteractionProgress()));
            // All paths begin and end at zero, preserving the exact neutral
            // endpoint while restoring motion intentionally removed by frame
            // anchoring. Frame anchoring removes jitter; this curve supplies
            // the designed whole-character trajectory independently.
            double envelope = Math.Sin(Math.PI * t);
            double x = 0.0;
            double y = 0.0;
            switch (interaction)
            {
                case InteractionKind.HopLeft:
                    x = -0.11 * envelope;
                    break;
                case InteractionKind.HopRight:
                    x = 0.11 * envelope;
                    break;
                case InteractionKind.FigureEight:
                    x = 0.09 * Math.Sin(Math.PI * 2.0 * t);
                    y = -0.035 * Math.Sin(Math.PI * 4.0 * t);
                    break;
                case InteractionKind.Moonwalk:
                    x = -0.10 * envelope;
                    break;
                case InteractionKind.Sneak:
                    x = -0.07 * envelope;
                    break;
                case InteractionKind.Charge:
                    x = 0.12 * envelope * envelope;
                    break;
            }
            return new PointF((float)(x * canvasSize), (float)(y * canvasSize));
        }

        private void GetFrameTimeline(out Bitmap first, out Bitmap second, out float blend)
        {
            if (interaction == InteractionKind.None)
            {
                Bitmap[] sequence = idleOutfitFrameImages[Math.Max(0,
                    Math.Min(idleOutfitFrameImages.Length - 1, (int)outfit))];
                double elapsed = Math.Max(0.0,
                    (DateTime.UtcNow - idleStarted).TotalMilliseconds);
                // Authored whole frames play without cross-fading. Cross-fading
                // creates doubled hands and translucent outlines on a layered window.
                int frameIndex = (int)Math.Floor(elapsed / 115.0) % sequence.Length;
                first = sequence[frameIndex];
                second = first;
                blend = 0F;
                return;
            }

            // Eight whole-character frames: exact default neutral, six authored
            // poses, exact default neutral. No rig, overlay or interpolation.
            int actionIndex = Math.Max(0, Math.Min(actionFrameImages.Length - 1,
                (int)interaction - 1));
            Bitmap[] actionSequence = actionFrameImages[actionIndex];
            int actionFrame = Math.Min(actionSequence.Length - 1,
                (int)Math.Floor(GetInteractionProgress() * actionSequence.Length));
            first = actionSequence[actionFrame];
            second = first;
            blend = 0F;
        }

        private Bitmap GetIdleAnchor(int anchor)
        {
            if (anchor <= 0 || anchor >= 9)
            {
                return petImage;
            }
            return idleFrameImages[anchor - 1];
        }

        private Bitmap GetActionAnchor(int actionIndex, int anchor)
        {
            if (anchor <= 0 || anchor >= 9)
            {
                return petImage;
            }
            return actionFrameImages[actionIndex][anchor - 1];
        }

        private static void DrawFrameAccessory(Graphics graphics, Bitmap image,
            int canvasSize, float x, float y, float width)
        {
            float drawWidth = canvasSize * width;
            float drawHeight = drawWidth * image.Height / image.Width;
            RectangleF destination = new RectangleF(
                -canvasSize / 2F + canvasSize * x,
                -canvasSize / 2F + canvasSize * y,
                drawWidth, drawHeight);
            graphics.DrawImage(image, destination,
                new RectangleF(0, 0, image.Width, image.Height), GraphicsUnit.Pixel);
        }

        private void DrawIdlePoseLayers(Graphics graphics, int canvasSize,
            bool centerPivot, float opacity)
        {
            if (opacity <= 0F)
            {
                return;
            }

            Bitmap followImage = null;
            if (idleFollowImages != null && idleFollowImages.Length >= 8)
            {
                followImage = idleFollowImages[GetFollowImageIndex()];
            }

            float secondGestureOpacity;
            float gestureOpacity = GetIdleGestureOpacity(out secondGestureOpacity);
            if (followImage != null)
            {
                DrawSprite(graphics, followImage, canvasSize, canvasSize,
                    centerPivot, opacity * (1F - gestureOpacity));
            }
            else
            {
                DrawSprite(graphics, petImage, petWidth, petHeight,
                    centerPivot, opacity * (1F - gestureOpacity));
            }

            if (gestureOpacity <= 0F || idleLifeImages == null || idleLifeImages.Length < 8)
            {
                return;
            }

            int firstIndex = idleGesturePair * 2;
            int secondIndex = firstIndex + 1;
            DrawSprite(graphics, idleLifeImages[firstIndex], canvasSize, canvasSize,
                centerPivot, opacity * gestureOpacity * (1F - secondGestureOpacity));
            DrawSprite(graphics, idleLifeImages[secondIndex], canvasSize, canvasSize,
                centerPivot, opacity * gestureOpacity * secondGestureOpacity);
        }

        private int GetFollowImageIndex()
        {
            Point cursor = Cursor.Position;
            double dx = (cursor.X - (petScreenX + petWidth / 2.0)) / Math.Max(1.0, petWidth);
            double dy = (cursor.Y - (petScreenY + petHeight * 0.34)) / Math.Max(1.0, petHeight);
            double absX = Math.Abs(dx);
            double absY = Math.Abs(dy);

            if (absX < 0.16 && absY < 0.13)
            {
                double blinkPhase = (DateTime.UtcNow - idleStarted).TotalMilliseconds % 4200.0;
                return blinkPhase < 170.0 ? 1 : 0;
            }

            if (absX > absY * 0.82)
            {
                if (absX < 0.55 && absY < 0.30)
                {
                    return dx < 0 ? 7 : 6;
                }
                return dx < 0 ? 3 : 2;
            }
            return dy < 0 ? 4 : 5;
        }

        private void UpdateContinuousGaze()
        {
            Point cursor = Cursor.Position;
            double targetX = (cursor.X - (petScreenX + petWidth / 2.0)) /
                Math.Max(1.0, petWidth * 0.72);
            double targetY = (cursor.Y - (petScreenY + petHeight * 0.30)) /
                Math.Max(1.0, petHeight * 0.72);
            targetX = Math.Max(-1.0, Math.Min(1.0, targetX));
            targetY = Math.Max(-1.0, Math.Min(1.0, targetY));

            // Exponential smoothing prevents direction changes from snapping between sprites.
            gazeX += (targetX - gazeX) * 0.18;
            gazeY += (targetY - gazeY) * 0.18;
        }

        private float GetHeadTrackingWeight()
        {
            if (interaction == InteractionKind.None)
            {
                return 1F;
            }

            double t = GetInteractionProgress();
            if (t < 0.18)
            {
                return (float)(1.0 - SmoothStep(t / 0.18));
            }
            if (t > 0.82)
            {
                return (float)SmoothStep((t - 0.82) / 0.18);
            }
            return 0F;
        }

        private void DrawRigCharacter(Graphics graphics, bool centerPivot, RigPose pose,
            float headTrackingWeight)
        {
            const float RigWidth = 745F;
            const float RigHeight = 1205F;
            float rigScale = petHeight / RigHeight;
            float originX = -petWidth / 2F;
            float originY = centerPivot ? -petHeight / 2F : -petHeight;

            GraphicsState trackingState = graphics.Save();
            float lookAngle = (float)(gazeX * 1.4 * headTrackingWeight) + pose.Head * 0.12F;
            float lookX = (float)(gazeX * 2.5 * headTrackingWeight) + pose.HeadX * 0.10F;
            float lookY = (float)(gazeY * 1.4 * headTrackingWeight) + pose.HeadY * 0.08F;
            float lookPivotX = originX + RigWidth * 0.5F * rigScale;
            float lookPivotY = originY + 790F * rigScale;
            graphics.TranslateTransform(lookPivotX + lookX, lookPivotY + lookY);
            graphics.RotateTransform(lookAngle);
            graphics.TranslateTransform(-lookPivotX, -lookPivotY);

            if (outfit == OutfitKind.BlueCape)
            {
                DrawRigAccessory(graphics, outfitCape, originX, originY, rigScale,
                    55F, 560F, 640F);
            }

            // Rounded fabric sockets sit behind the moving cut-outs and fade in
            // only while their joint moves. This prevents the desktop from
            // showing through as a white crescent at a shoulder or hip.
            DrawRigSocket(graphics, rigSocketLegLeft, originX, originY, rigScale,
                199F, 1044F, pose.LeftLeg * 0.5F, pose.LeftLegY * 0.5F,
                JointSocketOpacity(pose.LeftLeg, pose.LeftLegY));
            DrawRigSocket(graphics, rigSocketLegRight, originX, originY, rigScale,
                433F, 1044F, pose.RightLeg * 0.5F, pose.RightLegY * 0.5F,
                JointSocketOpacity(pose.RightLeg, pose.RightLegY));
            DrawRigSocket(graphics, rigSocketArmLeft, originX, originY, rigScale,
                136F, 742F, pose.LeftArm * 0.5F, pose.LeftArmY * 0.5F,
                JointSocketOpacity(pose.LeftArm, pose.LeftArmY));
            DrawRigSocket(graphics, rigSocketArmRight, originX, originY, rigScale,
                484F, 748F, pose.RightArm * 0.5F, pose.RightArmY * 0.5F,
                JointSocketOpacity(pose.RightArm, pose.RightArmY));

            DrawRigPart(graphics, rigLegLeft, originX, originY, rigScale,
                199F, 1044F + pose.LeftLegY, 199F, 1044F, pose.LeftLeg);
            DrawRigPart(graphics, rigLegRight, originX, originY, rigScale,
                433F, 1044F + pose.RightLegY, 433F, 1044F, pose.RightLeg);
            DrawRigPart(graphics, rigArmLeft, originX, originY, rigScale,
                136F, 742F + pose.LeftArmY, 136F, 742F, pose.LeftArm);
            DrawRigPart(graphics, rigArmRight, originX, originY, rigScale,
                484F, 748F + pose.RightArmY, 484F, 748F, pose.RightArm);

            RectangleF coreDestination = new RectangleF(originX, originY,
                RigWidth * rigScale, RigHeight * rigScale);
            graphics.DrawImage(rigCore, coreDestination,
                new RectangleF(0, 0, rigCore.Width, rigCore.Height), GraphicsUnit.Pixel);

            if (outfit == OutfitKind.RedScarf)
            {
                DrawRigAccessory(graphics, outfitScarf, originX, originY, rigScale,
                    185F, 650F, 375F);
            }
            else if (outfit == OutfitKind.RoundGlasses)
            {
                DrawRigAccessory(graphics, outfitGlasses, originX, originY, rigScale,
                    205F, 390F, 335F);
            }
            else if (outfit == OutfitKind.SailorCap)
            {
                DrawRigAccessory(graphics, outfitCap, originX, originY, rigScale,
                    205F, 135F, 360F);
            }
            graphics.Restore(trackingState);
        }

        private static void DrawRigPart(Graphics graphics, Bitmap image,
            float originX, float originY, float rigScale,
            float targetX, float targetY, float pivotX, float pivotY, float rotation)
        {
            GraphicsState state = graphics.Save();
            graphics.TranslateTransform(originX + targetX * rigScale,
                originY + targetY * rigScale);
            graphics.RotateTransform(rotation);
            RectangleF destination = new RectangleF(-pivotX * rigScale, -pivotY * rigScale,
                image.Width * rigScale, image.Height * rigScale);
            graphics.DrawImage(image, destination,
                new RectangleF(0, 0, image.Width, image.Height), GraphicsUnit.Pixel);
            graphics.Restore(state);
        }

        private static float JointSocketOpacity(float rotation, float offsetY)
        {
            return ClampFloat(Math.Abs(rotation) / 12F + Math.Abs(offsetY) / 16F, 0F, 1F);
        }

        private static void DrawRigSocket(Graphics graphics, Bitmap image,
            float originX, float originY, float rigScale, float pivotX, float pivotY,
            float rotation, float offsetY, float opacity)
        {
            if (image == null || opacity <= 0.001F)
            {
                return;
            }
            GraphicsState state = graphics.Save();
            graphics.TranslateTransform(originX + pivotX * rigScale,
                originY + (pivotY + offsetY) * rigScale);
            graphics.RotateTransform(rotation);
            Rectangle destination = Rectangle.Round(new RectangleF(-pivotX * rigScale,
                -pivotY * rigScale, image.Width * rigScale, image.Height * rigScale));
            ColorMatrix matrix = new ColorMatrix();
            matrix.Matrix33 = opacity;
            using (ImageAttributes attributes = new ImageAttributes())
            {
                attributes.SetColorMatrix(matrix, ColorMatrixFlag.Default,
                    ColorAdjustType.Bitmap);
                graphics.DrawImage(image, destination, 0, 0,
                    image.Width, image.Height, GraphicsUnit.Pixel, attributes);
            }
            graphics.Restore(state);
        }

        private static void DrawRigAccessory(Graphics graphics, Bitmap image,
            float originX, float originY, float rigScale,
            float x, float y, float width)
        {
            float height = width * image.Height / image.Width;
            RectangleF destination = new RectangleF(originX + x * rigScale,
                originY + y * rigScale, width * rigScale, height * rigScale);
            graphics.DrawImage(image, destination,
                new RectangleF(0, 0, image.Width, image.Height), GraphicsUnit.Pixel);
        }

        private RigPose CalculateRigPose()
        {
            RigPose pose = new RigPose();
            if (interaction == InteractionKind.None)
            {
                double idleSeconds = (DateTime.UtcNow - idleStarted).TotalSeconds;
                double breathe = Math.Sin(idleSeconds * Math.PI * 2.0 / 2.8);
                double step = Math.Sin(idleSeconds * Math.PI * 2.0 / 4.6);
                pose.LeftArm = (float)(7.0 * step + 2.0 * breathe);
                pose.RightArm = (float)(-7.0 * step - 2.0 * breathe);
                pose.LeftLeg = (float)(3.0 * step);
                pose.RightLeg = (float)(-3.0 * step);
                pose.Head = (float)(3.0 * Math.Sin(idleSeconds * Math.PI * 2.0 / 5.8));
                if (!idleGestureActive)
                {
                    LimitRigPose(ref pose);
                    return pose;
                }
                double idleT = Math.Max(0.0, Math.Min(1.0,
                    (DateTime.UtcNow - idleGestureStarted).TotalMilliseconds / 1800.0));
                double idleEnvelope = Math.Sin(Math.PI * idleT);
                double idleWave = Math.Sin(idleT * Math.PI * 4.0);
                switch (idleGesturePair)
                {
                    case 0:
                        pose.LeftArm = (float)((58.0 + idleWave * 24.0) * idleEnvelope);
                        pose.Head = (float)(-idleWave * 3.0 * idleEnvelope);
                        break;
                    case 1:
                        pose.LeftLeg = (float)(22.0 * idleEnvelope);
                        pose.RightLeg = (float)(-22.0 * idleEnvelope);
                        pose.LeftLegY = (float)(-18.0 * Math.Max(0.0, idleWave) * idleEnvelope);
                        pose.RightLegY = (float)(18.0 * Math.Min(0.0, idleWave) * idleEnvelope);
                        break;
                    case 2:
                        pose.LeftArm = (float)(125.0 * idleEnvelope);
                        pose.RightArm = (float)(-125.0 * idleEnvelope);
                        pose.HeadY = (float)(-8.0 * idleEnvelope);
                        break;
                    default:
                        pose.LeftArm = (float)(idleWave * 18.0 * idleEnvelope);
                        pose.RightArm = (float)(-idleWave * 18.0 * idleEnvelope);
                        pose.Head = (float)(idleWave * 6.0 * idleEnvelope);
                        break;
                }
                LimitRigPose(ref pose);
                return pose;
            }

            double t = GetInteractionProgress();
            double envelope = Math.Sin(Math.PI * t);
            double wave = Math.Sin(t * Math.PI * 6.0) * envelope;
            double pulse = Math.Abs(Math.Sin(t * Math.PI * 4.0)) * envelope;
            switch (interaction)
            {
                case InteractionKind.Jump:
                    pose.LeftArm = (float)(85 * envelope); pose.RightArm = (float)(-85 * envelope);
                    pose.LeftLeg = (float)(18 * envelope); pose.RightLeg = (float)(-18 * envelope); break;
                case InteractionKind.Squash:
                    pose.LeftArm = (float)(-28 * envelope); pose.RightArm = (float)(28 * envelope);
                    pose.LeftLeg = (float)(16 * envelope); pose.RightLeg = (float)(-16 * envelope); break;
                case InteractionKind.Shake:
                    pose.LeftArm = (float)(wave * 35); pose.RightArm = (float)(-wave * 35);
                    pose.Head = (float)(wave * 8); break;
                case InteractionKind.Bounce:
                    pose.LeftArm = (float)(55 * pulse); pose.RightArm = (float)(-55 * pulse);
                    pose.LeftLegY = (float)(-18 * pulse); pose.RightLegY = (float)(-18 * pulse); break;
                case InteractionKind.Nod:
                    pose.Head = (float)(Math.Sin(t * Math.PI * 5.0) * 16 * envelope);
                    pose.HeadY = (float)(8 * pulse); break;
                case InteractionKind.Sway:
                    pose.LeftArm = (float)(wave * 28); pose.RightArm = (float)(wave * 28);
                    pose.Head = (float)(-wave * 5); break;
                case InteractionKind.Spin:
                case InteractionKind.ReverseSpin:
                    pose.LeftArm = (float)(80 * envelope); pose.RightArm = (float)(-80 * envelope);
                    pose.LeftLeg = (float)(24 * envelope); pose.RightLeg = (float)(-24 * envelope); break;
                case InteractionKind.HopLeft:
                    pose.LeftLeg = (float)(65 * envelope); pose.LeftLegY = (float)(-48 * envelope);
                    pose.RightArm = (float)(-70 * envelope); break;
                case InteractionKind.HopRight:
                    pose.RightLeg = (float)(-65 * envelope); pose.RightLegY = (float)(-48 * envelope);
                    pose.LeftArm = (float)(70 * envelope); break;
                case InteractionKind.Tiptoe:
                    pose.LeftLeg = (float)(wave * 10); pose.RightLeg = (float)(-wave * 10);
                    pose.LeftLegY = (float)(-20 * pulse); pose.RightLegY = (float)(-20 * (envelope - pulse)); break;
                case InteractionKind.Stretch:
                    pose.LeftArm = (float)(145 * envelope); pose.RightArm = (float)(-145 * envelope);
                    pose.HeadY = (float)(-12 * envelope); break;
                case InteractionKind.Shrink:
                    pose.LeftArm = (float)(-42 * envelope); pose.RightArm = (float)(42 * envelope);
                    pose.LeftLeg = (float)(18 * envelope); pose.RightLeg = (float)(-18 * envelope); break;
                case InteractionKind.PeekLeft:
                    pose.Head = (float)(-20 * envelope); pose.HeadX = (float)(-24 * envelope);
                    pose.LeftArm = (float)(60 * envelope); break;
                case InteractionKind.PeekRight:
                    pose.Head = (float)(20 * envelope); pose.HeadX = (float)(24 * envelope);
                    pose.RightArm = (float)(-60 * envelope); break;
                case InteractionKind.FigureEight:
                    pose.LeftArm = (float)(Math.Sin(t * Math.PI * 4) * 75 * envelope);
                    pose.RightArm = (float)(-Math.Cos(t * Math.PI * 4) * 75 * envelope); break;
                case InteractionKind.Tremble:
                    pose.LeftArm = (float)(Math.Sin(t * Math.PI * 24) * 18 * envelope);
                    pose.RightArm = -pose.LeftArm; pose.Head = (float)(wave * 5); break;
                case InteractionKind.Proud:
                    pose.LeftArm = (float)(-48 * envelope); pose.RightArm = (float)(48 * envelope);
                    pose.HeadY = (float)(-10 * envelope); break;
                case InteractionKind.Bow:
                    pose.Head = (float)(24 * envelope); pose.HeadY = (float)(18 * envelope);
                    pose.LeftArm = (float)(25 * envelope); pose.RightArm = (float)(-25 * envelope); break;
                case InteractionKind.Backflip:
                case InteractionKind.Frontflip:
                    pose.LeftArm = (float)(-50 * envelope); pose.RightArm = (float)(50 * envelope);
                    pose.LeftLeg = (float)(55 * envelope); pose.RightLeg = (float)(-55 * envelope); break;
                case InteractionKind.Dance:
                    pose.LeftArm = (float)(wave * 100); pose.RightArm = (float)(-wave * 100);
                    pose.LeftLeg = (float)(-wave * 32); pose.RightLeg = (float)(wave * 32); break;
                case InteractionKind.Moonwalk:
                    pose.LeftLeg = (float)(Math.Sin(t * Math.PI * 4) * 38 * envelope);
                    pose.RightLeg = (float)(Math.Cos(t * Math.PI * 4) * 38 * envelope);
                    pose.LeftArm = (float)(-25 * envelope); pose.RightArm = (float)(25 * envelope); break;
                case InteractionKind.Heartbeat:
                    pose.LeftArm = (float)(48 * pulse); pose.RightArm = (float)(-48 * pulse);
                    pose.HeadY = (float)(-6 * pulse); break;
                case InteractionKind.Dizzy:
                    pose.Head = (float)(Math.Sin(t * Math.PI * 7) * 22 * envelope);
                    pose.LeftArm = (float)(80 * envelope); pose.RightArm = (float)(-80 * envelope); break;
                case InteractionKind.Sneak:
                    pose.LeftArm = (float)(-35 * envelope + wave * 12); pose.RightArm = (float)(35 * envelope - wave * 12);
                    pose.LeftLeg = (float)(wave * 28); pose.RightLeg = (float)(-wave * 28); break;
                case InteractionKind.Charge:
                    pose.LeftArm = (float)(-75 * envelope); pose.RightArm = (float)(75 * envelope);
                    pose.LeftLeg = (float)(-22 * envelope); pose.RightLeg = (float)(22 * envelope); break;
                case InteractionKind.Float:
                    pose.LeftArm = (float)(112 * envelope); pose.RightArm = (float)(-112 * envelope);
                    pose.LeftLeg = (float)(28 * envelope); pose.RightLeg = (float)(-28 * envelope); break;
                case InteractionKind.Stomp:
                    pose.RightLeg = (float)(-58 * envelope); pose.RightLegY = (float)(-72 * envelope);
                    pose.LeftArm = (float)(35 * envelope); pose.RightArm = (float)(-35 * envelope); break;
                case InteractionKind.Laugh:
                    pose.LeftArm = (float)(65 * pulse); pose.RightArm = (float)(-65 * pulse);
                    pose.Head = (float)(wave * 7); break;
                case InteractionKind.Surprise:
                    pose.LeftArm = (float)(125 * envelope); pose.RightArm = (float)(-125 * envelope);
                    pose.LeftLeg = (float)(20 * envelope); pose.RightLeg = (float)(-20 * envelope); break;
                case InteractionKind.Sleepy:
                    pose.Head = (float)(18 * envelope + wave * 3);
                    pose.HeadY = (float)(16 * envelope); pose.LeftArm = (float)(-18 * envelope);
                    pose.RightArm = (float)(18 * envelope); break;
            }
            LimitRigPose(ref pose);
            return pose;
        }

        private static void LimitRigPose(ref RigPose pose)
        {
            // These limits are wide enough to make hands and feet visibly move,
            // while staying inside the clean overlap area of the source cut-outs.
            pose.LeftArm = ClampFloat(pose.LeftArm * 0.30F, -30F, 30F);
            pose.RightArm = ClampFloat(pose.RightArm * 0.30F, -30F, 30F);
            pose.LeftLeg = ClampFloat(pose.LeftLeg * 0.30F, -14F, 14F);
            pose.RightLeg = ClampFloat(pose.RightLeg * 0.30F, -14F, 14F);
            pose.LeftArmY = ClampFloat(pose.LeftArmY * 0.28F, -10F, 10F);
            pose.RightArmY = ClampFloat(pose.RightArmY * 0.28F, -10F, 10F);
            pose.LeftLegY = ClampFloat(pose.LeftLegY * 0.40F, -28F, 12F);
            pose.RightLegY = ClampFloat(pose.RightLegY * 0.40F, -28F, 12F);
            pose.Head = ClampFloat(pose.Head * 0.18F, -7F, 7F);
            pose.HeadX = ClampFloat(pose.HeadX * 0.12F, -5F, 5F);
            pose.HeadY = ClampFloat(pose.HeadY * 0.12F, -5F, 5F);
        }

        private static float ClampFloat(float value, float minimum, float maximum)
        {
            return Math.Max(minimum, Math.Min(maximum, value));
        }

        private void DrawContinuousCharacter(Graphics graphics, Bitmap image, int canvasSize,
            bool centerPivot, float headTrackingWeight)
        {
            int left = -canvasSize / 2;
            int top = centerPivot ? -canvasSize / 2 : -canvasSize;
            int bodySourceY = (int)Math.Round(image.Height * 0.62);
            int headSourceHeight = (int)Math.Round(image.Height * 0.74);
            int bodyTop = top + (int)Math.Round(canvasSize * 0.62);
            int headHeight = (int)Math.Round(canvasSize * 0.74);

            Rectangle bodyDestination = new Rectangle(left, bodyTop, canvasSize,
                canvasSize - (bodyTop - top));
            Rectangle bodySource = new Rectangle(0, bodySourceY, image.Width,
                image.Height - bodySourceY);
            graphics.DrawImage(image, bodyDestination, bodySource, GraphicsUnit.Pixel);

            GraphicsState headState = graphics.Save();
            float neckY = top + canvasSize * 0.66F;
            float lookX = (float)(gazeX * canvasSize * 0.018 * headTrackingWeight);
            float lookY = (float)(gazeY * canvasSize * 0.010 * headTrackingWeight);
            float lookRotation = (float)(gazeX * 3.2 * headTrackingWeight);
            graphics.TranslateTransform(lookX, lookY);
            graphics.TranslateTransform(0F, neckY);
            graphics.RotateTransform(lookRotation);
            graphics.TranslateTransform(0F, -neckY);

            Rectangle headDestination = new Rectangle(left, top, canvasSize, headHeight);
            Rectangle headSource = new Rectangle(0, 0, image.Width, headSourceHeight);
            graphics.DrawImage(image, headDestination, headSource, GraphicsUnit.Pixel);
            graphics.Restore(headState);
        }

        private float GetIdleGestureOpacity(out float secondFrameOpacity)
        {
            secondFrameOpacity = 0F;
            if (!idleGestureActive)
            {
                return 0F;
            }

            double t = Math.Max(0.0, Math.Min(1.0,
                (DateTime.UtcNow - idleGestureStarted).TotalMilliseconds / 1800.0));
            float gestureOpacity;
            if (t < 0.12)
            {
                gestureOpacity = (float)SmoothStep(t / 0.12);
            }
            else if (t > 0.88)
            {
                gestureOpacity = (float)SmoothStep((1.0 - t) / 0.12);
            }
            else
            {
                gestureOpacity = 1F;
            }

            if (t >= 0.25 && t < 0.45)
            {
                secondFrameOpacity = (float)SmoothStep((t - 0.25) / 0.20);
            }
            else if (t >= 0.45 && t < 0.64)
            {
                secondFrameOpacity = 1F;
            }
            else if (t >= 0.64 && t < 0.84)
            {
                secondFrameOpacity = (float)SmoothStep((0.84 - t) / 0.20);
            }
            return gestureOpacity;
        }

        private float GetSecondKeyframeOpacity()
        {
            if (interaction == InteractionKind.None)
            {
                return 0F;
            }

            double t = GetInteractionProgress();
            if (t < 0.36)
            {
                return 0F;
            }
            if (t < 0.48)
            {
                return (float)SmoothStep((t - 0.36) / 0.12);
            }
            if (t < 0.70)
            {
                return 1F;
            }
            if (t < 0.82)
            {
                return (float)SmoothStep((0.82 - t) / 0.12);
            }
            return 0F;
        }

        private float GetActionPoseOpacity()
        {
            if (interaction == InteractionKind.None)
            {
                return 0F;
            }

            double t = GetInteractionProgress();
            if (t < 0.10)
            {
                return (float)SmoothStep(t / 0.10);
            }
            if (t > 0.90)
            {
                return (float)SmoothStep((1.0 - t) / 0.10);
            }
            return 1F;
        }

        private double GetInteractionProgress()
        {
            if (interaction == InteractionKind.None)
            {
                return 0.0;
            }
            double duration = InteractionDuration(interaction);
            return Math.Max(0.0, Math.Min(1.0,
                (DateTime.UtcNow - interactionStarted).TotalMilliseconds / duration));
        }

        private static void DrawSprite(Graphics graphics, Bitmap image, int width, int height,
            bool centerPivot, float opacity)
        {
            if (opacity <= 0F)
            {
                return;
            }

            int left = -width / 2;
            int top = centerPivot ? -height / 2 : -height;
            Rectangle destination = new Rectangle(left, top, width, height);
            if (opacity >= 0.995F)
            {
                graphics.DrawImage(image, destination, 0, 0, image.Width, image.Height,
                    GraphicsUnit.Pixel);
                return;
            }

            ColorMatrix matrix = new ColorMatrix();
            matrix.Matrix33 = opacity;
            using (ImageAttributes attributes = new ImageAttributes())
            {
                attributes.SetColorMatrix(matrix, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
                graphics.DrawImage(image, destination, 0, 0, image.Width, image.Height,
                    GraphicsUnit.Pixel, attributes);
            }
        }

        private void CalculateAnimation(out float offsetX, out float offsetY,
            out float scaleX, out float scaleY, out float rotation)
        {
            offsetX = 0F;
            offsetY = 0F;
            scaleX = 1F;
            scaleY = 1F;
            rotation = 0F;

            if (interaction == InteractionKind.None)
            {
                double idleSeconds = (DateTime.UtcNow - idleStarted).TotalSeconds;
                double breath = Math.Sin(idleSeconds * Math.PI * 2.0 / 2.8);
                double sway = Math.Sin(idleSeconds * Math.PI * 2.0 / 6.4);
                scaleX = (float)(1.0 - breath * 0.006);
                scaleY = (float)(1.0 + breath * 0.012);
                offsetY = (float)(-1.8 - breath * 1.8);
                rotation = (float)(sway * 0.8);

                if (idleGestureActive)
                {
                    double gestureT = Math.Max(0.0, Math.Min(1.0,
                        (DateTime.UtcNow - idleGestureStarted).TotalMilliseconds / 1800.0));
                    double envelope = Math.Sin(Math.PI * gestureT);
                    switch (idleGesturePair)
                    {
                        case 0:
                            rotation += (float)(Math.Sin(gestureT * Math.PI * 4.0) * 4.5 * envelope);
                            offsetX += (float)(Math.Sin(gestureT * Math.PI * 4.0) * 4.0 * envelope);
                            break;
                        case 1:
                            offsetY -= (float)(Math.Abs(Math.Sin(gestureT * Math.PI * 3.0)) * 7.0 * envelope);
                            scaleY += (float)(0.035 * envelope);
                            scaleX -= (float)(0.015 * envelope);
                            break;
                        case 2:
                            scaleX += (float)(0.035 * envelope);
                            scaleY -= (float)(0.025 * envelope);
                            rotation += (float)(Math.Sin(gestureT * Math.PI * 2.0) * 2.5 * envelope);
                            break;
                        case 3:
                            offsetX += (float)(Math.Sin(gestureT * Math.PI * 2.0) * 9.0 * envelope);
                            rotation += (float)(Math.Sin(gestureT * Math.PI * 2.0) * 5.0 * envelope);
                            break;
                    }
                }
                return;
            }

            double duration = InteractionDuration(interaction);
            double elapsed = (DateTime.UtcNow - interactionStarted).TotalMilliseconds;
            double t = Math.Max(0.0, Math.Min(1.0, elapsed / duration));

            double arc = Math.Sin(Math.PI * t);
            double wave;
            double decay;

            switch (interaction)
            {
                case InteractionKind.Jump:
                    offsetY = (float)(-arc * Math.Min(46.0, petHeight * 0.15));
                    scaleX = (float)(1.0 - 0.035 * arc);
                    scaleY = (float)(1.0 + 0.055 * arc);
                    break;

                case InteractionKind.Squash:
                    if (t < 0.22)
                    {
                        double local = EaseOut(t / 0.22);
                        scaleY = (float)Lerp(1.0, 0.62, local);
                        scaleX = (float)Lerp(1.0, 1.20, local);
                    }
                    else if (t < 0.50)
                    {
                        double local = EaseOut((t - 0.22) / 0.28);
                        scaleY = (float)Lerp(0.62, 1.10, local);
                        scaleX = (float)Lerp(1.20, 0.95, local);
                    }
                    else
                    {
                        double local = (t - 0.50) / 0.50;
                        double wobble = Math.Sin(local * Math.PI * 3.0) * (1.0 - local);
                        scaleY = (float)(1.0 + wobble * 0.10);
                        scaleX = (float)(1.0 - wobble * 0.055);
                    }
                    break;

                case InteractionKind.Shake:
                    decay = 1.0 - t;
                    wave = Math.Sin(t * Math.PI * 12.0);
                    offsetX = (float)(wave * Math.Min(17.0, petWidth * 0.09) * decay);
                    rotation = (float)(wave * 5.5 * decay);
                    break;

                case InteractionKind.Bounce:
                    wave = Math.Abs(Math.Sin(t * Math.PI * 3.0));
                    offsetY = (float)(-wave * Math.Min(31.0, petHeight * 0.10) * (1.0 - t * 0.18));
                    scaleX = (float)(1.0 + wave * 0.045);
                    scaleY = (float)(1.0 - wave * 0.035);
                    break;

                case InteractionKind.Nod:
                    wave = Math.Sin(t * Math.PI * 5.0) * arc;
                    offsetY = (float)(Math.Abs(wave) * 7.0);
                    scaleY = (float)(1.0 - Math.Abs(wave) * 0.055);
                    scaleX = (float)(1.0 + Math.Abs(wave) * 0.025);
                    break;

                case InteractionKind.Sway:
                    rotation = (float)(Math.Sin(t * Math.PI * 3.0) * 11.0 * arc);
                    offsetX = (float)(Math.Sin(t * Math.PI * 3.0) * 8.0 * arc);
                    break;

                case InteractionKind.Spin:
                    wave = Math.Abs(Math.Cos(t * Math.PI * 2.0));
                    scaleX = (float)(0.08 + wave * 0.92);
                    scaleY = (float)(1.0 + (1.0 - wave) * 0.04);
                    offsetY = (float)(-arc * 9.0);
                    rotation = (float)(Math.Sin(t * Math.PI * 4.0) * 3.0);
                    break;

                case InteractionKind.ReverseSpin:
                    rotation = (float)(-360.0 * SmoothStep(t));
                    offsetY = (float)(-arc * Math.Min(24.0, petHeight * 0.08));
                    break;

                case InteractionKind.HopLeft:
                    offsetX = (float)(-arc * Math.Min(34.0, petWidth * 0.18));
                    offsetY = (float)(-Math.Abs(Math.Sin(t * Math.PI * 2.0)) * 21.0);
                    rotation = (float)(-arc * 7.0);
                    break;

                case InteractionKind.HopRight:
                    offsetX = (float)(arc * Math.Min(34.0, petWidth * 0.18));
                    offsetY = (float)(-Math.Abs(Math.Sin(t * Math.PI * 2.0)) * 21.0);
                    rotation = (float)(arc * 7.0);
                    break;

                case InteractionKind.Tiptoe:
                    wave = Math.Abs(Math.Sin(t * Math.PI * 3.0));
                    scaleY = (float)(1.0 + wave * 0.13);
                    scaleX = (float)(1.0 - wave * 0.055);
                    offsetY = (float)(-wave * 4.0);
                    break;

                case InteractionKind.Stretch:
                    scaleY = (float)(1.0 + arc * 0.25);
                    scaleX = (float)(1.0 - arc * 0.09);
                    break;

                case InteractionKind.Shrink:
                    scaleX = (float)(1.0 - arc * 0.24);
                    scaleY = (float)(1.0 - arc * 0.24);
                    break;

                case InteractionKind.PeekLeft:
                    offsetX = (float)(-arc * Math.Min(44.0, petWidth * 0.23));
                    rotation = (float)(-arc * 13.0);
                    scaleY = (float)(1.0 - arc * 0.04);
                    break;

                case InteractionKind.PeekRight:
                    offsetX = (float)(arc * Math.Min(44.0, petWidth * 0.23));
                    rotation = (float)(arc * 13.0);
                    scaleY = (float)(1.0 - arc * 0.04);
                    break;

                case InteractionKind.FigureEight:
                    offsetX = (float)(Math.Sin(t * Math.PI * 2.0) * Math.Min(26.0, petWidth * 0.14));
                    offsetY = (float)(-arc * 13.0 + Math.Sin(t * Math.PI * 4.0) * 9.0);
                    rotation = (float)(Math.Sin(t * Math.PI * 2.0) * 6.0);
                    break;

                case InteractionKind.Tremble:
                    decay = 1.0 - t;
                    wave = Math.Sin(t * Math.PI * 26.0);
                    offsetX = (float)(wave * 6.0 * decay);
                    offsetY = (float)(Math.Cos(t * Math.PI * 22.0) * 3.0 * decay);
                    rotation = (float)(wave * 2.2 * decay);
                    break;

                case InteractionKind.Proud:
                    scaleX = (float)(1.0 + arc * 0.10);
                    scaleY = (float)(1.0 + arc * 0.10);
                    offsetY = (float)(-arc * 9.0);
                    rotation = (float)(Math.Sin(t * Math.PI * 2.0) * arc * 3.0);
                    break;

                case InteractionKind.Bow:
                    scaleY = (float)(1.0 - arc * 0.16);
                    scaleX = (float)(1.0 + arc * 0.07);
                    rotation = (float)(arc * 8.0);
                    break;

                case InteractionKind.Backflip:
                    rotation = (float)(-Math.Sin(t * Math.PI * 2.0) * 24.0);
                    offsetY = (float)(-arc * Math.Min(43.0, petHeight * 0.14));
                    scaleX = (float)(1.0 - arc * 0.04);
                    scaleY = (float)(1.0 + arc * 0.04);
                    break;

                case InteractionKind.Frontflip:
                    rotation = (float)(Math.Sin(t * Math.PI * 2.0) * 24.0);
                    offsetY = (float)(-arc * Math.Min(39.0, petHeight * 0.13));
                    break;

                case InteractionKind.Dance:
                    wave = Math.Sin(t * Math.PI * 6.0);
                    offsetX = (float)(wave * Math.Min(18.0, petWidth * 0.10) * arc);
                    offsetY = (float)(-Math.Abs(Math.Sin(t * Math.PI * 6.0)) * 8.0);
                    rotation = (float)(wave * 12.0 * arc);
                    scaleY = (float)(1.0 + Math.Abs(wave) * 0.035);
                    break;

                case InteractionKind.Moonwalk:
                    offsetX = (float)(-arc * Math.Min(48.0, petWidth * 0.25));
                    offsetY = (float)(Math.Sin(t * Math.PI * 8.0) * 3.0 * arc);
                    rotation = (float)(-arc * 7.0);
                    scaleY = (float)(1.0 - arc * 0.045);
                    break;

                case InteractionKind.Heartbeat:
                    wave = Math.Pow(Math.Max(0.0, Math.Sin(t * Math.PI * 4.0)), 5.0);
                    scaleX = (float)(1.0 + wave * 0.13);
                    scaleY = (float)(1.0 + wave * 0.13);
                    offsetY = (float)(-wave * 5.0);
                    break;

                case InteractionKind.Dizzy:
                    offsetX = (float)(Math.Sin(t * Math.PI * 4.0) * Math.Min(18.0, petWidth * 0.10));
                    offsetY = (float)((Math.Cos(t * Math.PI * 4.0) - 1.0) * 8.0);
                    rotation = (float)(Math.Sin(t * Math.PI * 6.0) * 12.0 * arc);
                    break;

                case InteractionKind.Sneak:
                    offsetX = (float)(-arc * Math.Min(31.0, petWidth * 0.17));
                    offsetY = (float)(arc * 5.0);
                    scaleY = (float)(1.0 - arc * 0.19);
                    scaleX = (float)(1.0 + arc * 0.07);
                    rotation = (float)(-arc * 6.0);
                    break;

                case InteractionKind.Charge:
                    if (t < 0.28)
                    {
                        offsetX = (float)Lerp(0.0, -14.0, EaseOut(t / 0.28));
                        rotation = (float)Lerp(0.0, -10.0, EaseOut(t / 0.28));
                    }
                    else if (t < 0.66)
                    {
                        double local = EaseOut((t - 0.28) / 0.38);
                        offsetX = (float)Lerp(-14.0, Math.Min(48.0, petWidth * 0.25), local);
                        rotation = (float)Lerp(-10.0, 12.0, local);
                    }
                    else
                    {
                        double local = EaseOut((t - 0.66) / 0.34);
                        offsetX = (float)Lerp(Math.Min(48.0, petWidth * 0.25), 0.0, local);
                        rotation = (float)Lerp(12.0, 0.0, local);
                    }
                    scaleY = (float)(1.0 - arc * 0.055);
                    scaleX = (float)(1.0 + arc * 0.065);
                    break;

                case InteractionKind.Float:
                    offsetY = (float)(-arc * Math.Min(38.0, petHeight * 0.12));
                    offsetX = (float)(Math.Sin(t * Math.PI * 2.0) * 9.0 * arc);
                    rotation = (float)(Math.Sin(t * Math.PI * 2.0) * 5.0 * arc);
                    break;

                case InteractionKind.Stomp:
                    if (t < 0.32)
                    {
                        offsetY = (float)(-Math.Sin(Math.PI * t / 0.32) * Math.Min(36.0, petHeight * 0.12));
                    }
                    else if (t < 0.94)
                    {
                        double local = (t - 0.32) / 0.62;
                        double impact = Math.Sin(local * Math.PI * 5.0) * Math.Exp(-4.0 * local);
                        scaleY = (float)(1.0 - Math.Max(0.0, impact) * 0.16);
                        scaleX = (float)(1.0 + Math.Max(0.0, impact) * 0.09);
                    }
                    break;

                case InteractionKind.Laugh:
                    wave = Math.Sin(t * Math.PI * 8.0) * arc;
                    offsetY = (float)(-Math.Abs(wave) * 7.0);
                    rotation = (float)(wave * 5.0);
                    scaleX = (float)(1.0 + Math.Abs(wave) * 0.045);
                    scaleY = (float)(1.0 - Math.Abs(wave) * 0.025);
                    break;

                case InteractionKind.Surprise:
                    wave = Math.Sin(Math.PI * Math.Min(1.0, t * 1.35));
                    scaleX = (float)(1.0 + wave * 0.20 * (1.0 - t * 0.35));
                    scaleY = (float)(1.0 + wave * 0.24 * (1.0 - t * 0.35));
                    offsetY = (float)(-wave * 13.0);
                    break;

                case InteractionKind.Sleepy:
                    rotation = (float)(Math.Sin(t * Math.PI * 2.0) * arc * 8.0);
                    scaleY = (float)(1.0 - arc * 0.15);
                    scaleX = (float)(1.0 + arc * 0.055);
                    offsetY = (float)(arc * 5.0);
                    break;
            }
        }

        private static double EaseOut(double value)
        {
            double inverse = 1.0 - value;
            return 1.0 - inverse * inverse * inverse;
        }

        private static double Lerp(double start, double end, double amount)
        {
            return start + (end - start) * amount;
        }

        private static double SmoothStep(double value)
        {
            value = Math.Max(0.0, Math.Min(1.0, value));
            return value * value * (3.0 - 2.0 * value);
        }

        private Size MeasureSpeechBubble()
        {
            if (string.IsNullOrEmpty(bubbleText))
            {
                return Size.Empty;
            }

            using (Bitmap probe = new Bitmap(1, 1, PixelFormat.Format32bppArgb))
            using (Graphics graphics = Graphics.FromImage(probe))
            using (Font font = CreateBubbleFont())
            using (StringFormat format = CreateBubbleStringFormat())
            {
                graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                SizeF natural = graphics.MeasureString(bubbleText, font, 2000, format);
                float textWidth = Math.Min(MaxBubbleTextWidth,
                    Math.Max(118F, (float)Math.Ceiling(natural.Width) + 2F));
                SizeF wrapped = graphics.MeasureString(bubbleText, font,
                    new SizeF(textWidth, 1000F), format);
                int width = Math.Max(MinBubbleWidth,
                    (int)Math.Ceiling(Math.Min(textWidth, wrapped.Width)) + 38);
                int height = Math.Max(MinBubbleHeight,
                    (int)Math.Ceiling(wrapped.Height) + 34);
                return new Size(width, height);
            }
        }

        private static Font CreateBubbleFont()
        {
            return new Font("Microsoft YaHei UI", 11.5F, FontStyle.Bold, GraphicsUnit.Point);
        }

        private static StringFormat CreateBubbleStringFormat()
        {
            StringFormat format = new StringFormat(StringFormat.GenericDefault);
            format.Alignment = StringAlignment.Center;
            format.LineAlignment = StringAlignment.Center;
            format.Trimming = StringTrimming.None;
            return format;
        }

        private void DrawSpeechBubble(Graphics graphics, int characterX, int characterY, Size bubbleSize)
        {
            int x = bubbleOnLeft
                ? characterX - BubbleGap - bubbleSize.Width
                : characterX + petWidth + BubbleGap;
            int y = characterY + 10;
            Rectangle bubble = new Rectangle(x + 4, y, bubbleSize.Width - 8, bubbleSize.Height - 8);
            Rectangle shadow = new Rectangle(bubble.X + 3, bubble.Y + 4, bubble.Width, bubble.Height);

            using (GraphicsPath shadowPath = RoundedRectangle(shadow, 18))
            using (SolidBrush shadowBrush = new SolidBrush(Color.FromArgb(55, 4, 14, 29)))
            {
                graphics.FillPath(shadowBrush, shadowPath);
            }

            using (GraphicsPath bubblePath = RoundedRectangle(bubble, 18))
            using (SolidBrush fill = new SolidBrush(Color.FromArgb(255, 255, 253, 246)))
            using (Pen border = new Pen(Color.FromArgb(255, 17, 74, 142), 2F))
            {
                graphics.FillPath(fill, bubblePath);
                graphics.DrawPath(border, bubblePath);
            }

            PointF[] pointer;
            if (bubbleOnLeft)
            {
                pointer = new PointF[]
                {
                    new PointF(bubble.Right - 2, bubble.Top + 36),
                    new PointF(bubble.Right + 13, bubble.Top + 45),
                    new PointF(bubble.Right - 2, bubble.Top + 55)
                };
            }
            else
            {
                pointer = new PointF[]
                {
                    new PointF(bubble.Left + 2, bubble.Top + 36),
                    new PointF(bubble.Left - 13, bubble.Top + 45),
                    new PointF(bubble.Left + 2, bubble.Top + 55)
                };
            }

            using (SolidBrush fill = new SolidBrush(Color.FromArgb(255, 255, 253, 246)))
            using (Pen border = new Pen(Color.FromArgb(255, 17, 74, 142), 2F))
            {
                graphics.FillPolygon(fill, pointer);
                graphics.DrawLines(border, pointer);
            }

            RectangleF textBounds = new RectangleF(
                bubble.X + 15, bubble.Y + 10, bubble.Width - 30, bubble.Height - 20);
            using (Font font = CreateBubbleFont())
            using (SolidBrush textBrush = new SolidBrush(Color.FromArgb(255, 24, 39, 58)))
            using (StringFormat format = CreateBubbleStringFormat())
            {
                graphics.DrawString(bubbleText, font, textBrush, textBounds, format);
            }
        }

        private static GraphicsPath RoundedRectangle(Rectangle rectangle, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(rectangle.Left, rectangle.Top, diameter, diameter, 180, 90);
            path.AddArc(rectangle.Right - diameter, rectangle.Top, diameter, diameter, 270, 90);
            path.AddArc(rectangle.Right - diameter, rectangle.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rectangle.Left, rectangle.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void ApplyLayeredBitmap(Bitmap bitmap)
        {
            IntPtr screenDc = NativeMethods.GetDC(IntPtr.Zero);
            IntPtr memoryDc = NativeMethods.CreateCompatibleDC(screenDc);
            IntPtr hBitmap = IntPtr.Zero;
            IntPtr oldBitmap = IntPtr.Zero;

            try
            {
                hBitmap = bitmap.GetHbitmap(Color.FromArgb(0));
                oldBitmap = NativeMethods.SelectObject(memoryDc, hBitmap);

                NativeMethods.Point destination = new NativeMethods.Point(Left, Top);
                NativeMethods.Size size = new NativeMethods.Size(bitmap.Width, bitmap.Height);
                NativeMethods.Point source = new NativeMethods.Point(0, 0);
                NativeMethods.BlendFunction blend = new NativeMethods.BlendFunction();
                blend.BlendOp = NativeMethods.AcSrcOver;
                blend.BlendFlags = 0;
                blend.SourceConstantAlpha = 255;
                blend.AlphaFormat = NativeMethods.AcSrcAlpha;

                bool updated = NativeMethods.UpdateLayeredWindow(Handle, screenDc, ref destination, ref size,
                    memoryDc, ref source, 0, ref blend, NativeMethods.UlwAlpha);
                if (!updated)
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to update the desktop-pet layer.");
                }
            }
            finally
            {
                if (oldBitmap != IntPtr.Zero)
                {
                    NativeMethods.SelectObject(memoryDc, oldBitmap);
                }
                if (hBitmap != IntPtr.Zero)
                {
                    NativeMethods.DeleteObject(hBitmap);
                }
                if (memoryDc != IntPtr.Zero)
                {
                    NativeMethods.DeleteDC(memoryDc);
                }
                if (screenDc != IntPtr.Zero)
                {
                    NativeMethods.ReleaseDC(IntPtr.Zero, screenDc);
                }
            }
        }
    }

    internal sealed class CocoMenuRenderer : ToolStripProfessionalRenderer
    {
        internal CocoMenuRenderer()
            : base(new CocoColorTable())
        {
            RoundedEdges = true;
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = e.Item.Selected
                ? Color.FromArgb(255, 17, 46, 81)
                : Color.FromArgb(255, 29, 45, 65);
            base.OnRenderItemText(e);
        }
    }

    internal sealed class CocoColorTable : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground { get { return Color.FromArgb(255, 255, 252, 242); } }
        public override Color MenuBorder { get { return Color.FromArgb(255, 17, 74, 142); } }
        public override Color MenuItemBorder { get { return Color.FromArgb(255, 242, 193, 78); } }
        public override Color MenuItemSelected { get { return Color.FromArgb(255, 255, 224, 147); } }
        public override Color ImageMarginGradientBegin { get { return Color.FromArgb(255, 255, 252, 242); } }
        public override Color ImageMarginGradientMiddle { get { return Color.FromArgb(255, 255, 252, 242); } }
        public override Color ImageMarginGradientEnd { get { return Color.FromArgb(255, 255, 252, 242); } }
        public override Color SeparatorDark { get { return Color.FromArgb(255, 214, 189, 132); } }
        public override Color SeparatorLight { get { return Color.FromArgb(255, 255, 252, 242); } }
    }
}
