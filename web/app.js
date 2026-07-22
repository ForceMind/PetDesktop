(() => {
  "use strict";

  const ASSET_ROOT = "./assets/frame_animation_v2";
  const RUNTIME_ROOT = "./frames";
  const FRAME_LAYOUT = document.querySelector('meta[name="coco-frame-layout"]')?.content || "source";
  const SETTINGS_KEY = "coco-web-pet-v1";
  const FRAME_SIZE = 512;
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    stage: $("#stage"), pet: $("#pet"), canvas: $("#petCanvas"), bubble: $("#speechBubble"),
    loading: $("#loadingBadge"), status: $("#statusText"), frame: $("#frameText"),
    panel: $("#controlPanel"), panelButton: $("#panelButton"), closePanel: $("#closePanelButton"),
    auto: $("#autoToggle"), idle: $("#idleToggle"), dialogue: $("#dialogueToggle"),
    language: $("#languageSelect"), outfit: $("#outfitSelect"), background: $("#backgroundSelect"),
    size: $("#sizeRange"), sizeOutput: $("#sizeOutput"), action: $("#actionSelect"),
    play: $("#playButton"), random: $("#randomButton"), reset: $("#resetButton"),
    pause: $("#pauseButton"), fullscreen: $("#fullscreenButton"), install: $("#installButton"),
    installPanel: $("#installPanelButton"), installTip: $("#installTip"),
    installTipText: $("#installTipText"), installTipButton: $("#installTipButton"),
    installTipClose: $("#installTipClose")
  };
  const context = ui.canvas.getContext("2d", { alpha: true });
  const imageCache = new Map();

  const messages = {
    en: {
      subtitle: "Interactive web companion", install: "Install", fullscreen: "Fullscreen", controls: "Controls",
      hint: "Drag Coco · click or tap different areas · wheel or pinch to resize", loading: "Loading move…",
      playLab: "PLAY LAB", panelTitle: "Make Coco your own", behavior: "Behavior",
      autoShow: "Auto performances", autoShowHelp: "Coco occasionally performs on its own",
      idleMotion: "Idle gestures", idleMotionHelp: "Subtle movement between quiet stands",
      dialogue: "Dialogue", dialogueHelp: "Show adaptive speech bubbles", language: "Language",
      outfit: "Idle outfit", background: "Background", size: "Pet size", bgDesk: "Midnight desk",
      bgSky: "Soft sky", bgPaper: "Warm paper", bgChecker: "Transparent grid", actionStudio: "Action studio",
      play: "Play", queueHelp: "Fast clicks queue one move. Coco always finishes and returns to standing before the next begins.",
      randomMove: "Random move", resetPosition: "Reset position", pause: "Pause", resume: "Resume",
      shortcuts: "Shortcuts: Space random · R reset · P pause", idleStatus: "Idle", pausedStatus: "Paused",
      queued: "Let me finish this move. Yours is next!", queueFull: "One move is already queued. Easy does it!",
      outfitReady: "New idle outfit ready!", loadingFailed: "That move could not be loaded. Please try again.",
      installPrompt: "Install Coco for a faster, full-screen app experience.",
      installIos: "On iPhone or iPad, tap Share, then choose Add to Home Screen.",
      installManual: "Open your browser menu and choose Install app or Add to Home screen.",
      installed: "Coco is installed and ready!",
      dialogueHead: "Careful with my blue feathers!", dialogueFaceLeft: "That cheek is ticklish!",
      dialogueFaceRight: "You found my playful side!", dialogueLeftPaw: "Left-paw high five!",
      dialogueRightPaw: "Right paw ready!", dialogueBody: "My belly is very ticklish!",
      dialogueFeet: "My feet want to jump!"
    },
    zh: {
      subtitle: "可以互动的网页版桌宠", install: "安装应用", fullscreen: "全屏", controls: "控制台",
      hint: "拖动 Coco · 点击不同部位 · 滚轮或双指调整大小", loading: "动作加载中…",
      playLab: "互动实验室", panelTitle: "打造你的 Coco", behavior: "行为",
      autoShow: "自动表演", autoShowHelp: "Coco 偶尔会自己表演动作",
      idleMotion: "待机小动作", idleMotionHelp: "安静站立之间偶尔活动一下",
      dialogue: "对白", dialogueHelp: "显示自适应对白气泡", language: "语言",
      outfit: "待机换装", background: "场景背景", size: "宠物大小", bgDesk: "午夜桌面",
      bgSky: "柔和天空", bgPaper: "暖色纸张", bgChecker: "透明网格", actionStudio: "动作工作室",
      play: "播放", queueHelp: "快速点击只排队一个动作；Coco 会先完整演完并站稳，再开始下一个。",
      randomMove: "随机动作", resetPosition: "复位", pause: "暂停", resume: "继续",
      shortcuts: "快捷键：空格随机 · R 复位 · P 暂停", idleStatus: "待机", pausedStatus: "已暂停",
      queued: "等我演完这个，下一个马上来～", queueFull: "已经排好一个动作啦，慢慢来～",
      outfitReady: "新的待机造型准备好啦！", loadingFailed: "这个动作没有加载成功，请再试一次。",
      installPrompt: "安装 Coco，获得更快、更完整的全屏体验。",
      installIos: "在 iPhone 或 iPad 上点击“分享”，再选择“添加到主屏幕”。",
      installManual: "请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。",
      installed: "Coco 已安装完成！",
      dialogueHead: "摸摸头，羽毛可别弄乱啦～", dialogueFaceLeft: "左脸有一点怕痒！",
      dialogueFaceRight: "右边被你发现啦！", dialogueLeftPaw: "左手击掌，High five！",
      dialogueRightPaw: "右手已经准备好啦！", dialogueBody: "哈哈，肚皮最怕痒了！",
      dialogueFeet: "脚底痒痒，要跳起来啦！"
    }
  };

  let data;
  let deferredInstallPrompt;
  let hiddenAt = 0;
  const saved = readSettings();
  const compactViewport = window.matchMedia("(max-width: 850px)");
  const hasSavedPanelState = Object.prototype.hasOwnProperty.call(saved, "panelOpen");
  const state = {
    languageMode: saved.languageMode || "auto",
    outfit: saved.outfit || "default",
    background: saved.background || "desk",
    size: Number(saved.size) || (compactViewport.matches ? 280 : 320),
    auto: saved.auto !== false,
    idle: saved.idle !== false,
    dialogue: saved.dialogue !== false,
    panelOpen: hasSavedPanelState ? saved.panelOpen !== false : !compactViewport.matches,
    x: Number.isFinite(saved.x) ? saved.x : null,
    y: Number.isFinite(saved.y) ? saved.y : null,
    active: null,
    queued: null,
    preparing: false,
    paused: false,
    pauseStarted: 0,
    idleFrames: [],
    idleGesture: null,
    nextIdle: performance.now() + randomBetween(3000, 8000),
    nextAuto: performance.now() + randomBetween(12000, 28000),
    neutralUntil: 0,
    bubbleUntil: 0,
    lastDrawnImage: null,
    drag: null,
    pointers: new Map(),
    pinch: null,
    gazeX: 0,
    gazeY: 0
  };

  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch { return {}; }
  }

  function saveSettings() {
    const persistent = {
      languageMode: state.languageMode, outfit: state.outfit, background: state.background,
      size: state.size, auto: state.auto, idle: state.idle, dialogue: state.dialogue,
      panelOpen: state.panelOpen, x: state.x, y: state.y
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistent));
  }

  function currentLanguage() {
    if (state.languageMode !== "auto") return state.languageMode;
    return (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function t(key) { return messages[currentLanguage()][key] || messages.en[key] || key; }
  function randomBetween(min, max) { return min + Math.random() * (max - min); }
  function pick(items) { return items[Math.floor(Math.random() * items.length)]; }
  function findAction(id) { return data.actions.find((action) => action.id === id); }

  function image(path) {
    if (!imageCache.has(path)) {
      imageCache.set(path, new Promise((resolve, reject) => {
        const item = new Image();
        item.decoding = "async";
        item.onload = () => resolve(item);
        item.onerror = () => reject(new Error(`Unable to load ${path}`));
        item.src = path;
      }));
    }
    return imageCache.get(path);
  }

  function framePaths(folder, count) {
    return Array.from({ length: count }, (_, index) => `${ASSET_ROOT}/${folder}/frame_${String(index + 1).padStart(2, "0")}.png`);
  }

  function idleFramePaths(outfitId) {
    if (FRAME_LAYOUT === "source") return framePaths(`idle/${outfitId}`, 7);
    const outfitIndex = data.outfits.findIndex((item) => item.id === outfitId);
    const prefix = RUNTIME_ROOT;
    if (outfitIndex === 0) {
      return [
        `${prefix}/frame_neutral.png`,
        ...Array.from({ length: 5 }, (_, index) => `${prefix}/frame_idle_00_${String(index + 2).padStart(2, "0")}.png`),
        `${prefix}/frame_neutral.png`
      ];
    }
    const firstSix = Array.from({ length: 6 }, (_, index) =>
      `${prefix}/frame_idle_${String(outfitIndex).padStart(2, "0")}_${String(index + 1).padStart(2, "0")}.png`);
    return [...firstSix, firstSix[0]];
  }

  function actionFramePaths(action) {
    if (FRAME_LAYOUT === "source") return framePaths(`actions/${action.dir}`, 8);
    const actionIndex = data.actions.findIndex((item) => item.id === action.id) + 1;
    const prefix = RUNTIME_ROOT;
    return [
      `${prefix}/frame_neutral.png`,
      ...Array.from({ length: 6 }, (_, index) =>
        `${prefix}/frame_action_${String(actionIndex).padStart(2, "0")}_${String(index + 2).padStart(2, "0")}.png`),
      `${prefix}/frame_neutral.png`
    ];
  }

  async function loadIdle(outfitId) {
    const requested = outfitId;
    const frames = await Promise.all(idleFramePaths(requested).map(image));
    if (state.outfit === requested) {
      state.idleFrames = frames;
      if (!state.active) drawFrame(frames[0], 1, 7);
    }
  }

  async function loadAction(action) {
    return Promise.all(actionFramePaths(action).map(image));
  }

  function drawFrame(item, frameNumber, frameCount) {
    if (!item || item === state.lastDrawnImage) {
      ui.frame.textContent = `${frameNumber} / ${frameCount}`;
      return;
    }
    context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    context.drawImage(item, 0, 0, FRAME_SIZE, FRAME_SIZE);
    state.lastDrawnImage = item;
    ui.frame.textContent = `${frameNumber} / ${frameCount}`;
  }

  function localizePage() {
    document.documentElement.lang = currentLanguage() === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n;
      if (messages[currentLanguage()][key]) node.textContent = t(key);
    });
    document.title = currentLanguage() === "zh" ? "Coco 网页桌宠" : "Coco Web Pet";
    populateSelects();
    ui.pause.textContent = state.paused ? t("resume") : t("pause");
    if (!state.active) ui.status.textContent = state.paused ? t("pausedStatus") : t("idleStatus");
  }

  function populateSelects() {
    const selectedAction = ui.action.value || "jump";
    ui.outfit.replaceChildren(...data.outfits.map((outfit) => new Option(outfit[currentLanguage()], outfit.id)));
    ui.outfit.value = state.outfit;
    ui.action.replaceChildren(...data.actions.map((action) => new Option(action[currentLanguage()], action.id)));
    ui.action.value = findAction(selectedAction) ? selectedAction : "jump";
  }

  function applyGeometry() {
    state.size = Math.max(160, Math.min(520, state.size));
    ui.pet.style.width = `${state.size}px`;
    ui.pet.style.height = `${state.size}px`;
    ui.size.value = String(state.size);
    ui.sizeOutput.textContent = `${state.size} px`;
    if (state.x === null || state.y === null) resetPosition(false);
    clampPosition();
    ui.pet.style.left = `${state.x}px`;
    ui.pet.style.top = `${state.y}px`;
    updateBubblePosition();
  }

  function clampPosition() {
    const width = ui.stage.clientWidth;
    const height = ui.stage.clientHeight;
    state.x = Math.max(-state.size * .55, Math.min(width - state.size * .45, state.x));
    state.y = Math.max(0, Math.min(height - state.size * .35, state.y));
  }

  function resetPosition(persist = true) {
    state.x = Math.max(10, ui.stage.clientWidth - state.size - 55);
    state.y = Math.max(45, ui.stage.clientHeight - state.size - 24);
    applyGeometryWithoutReset();
    if (persist) saveSettings();
  }

  function applyGeometryWithoutReset() {
    clampPosition();
    ui.pet.style.left = `${state.x}px`;
    ui.pet.style.top = `${state.y}px`;
    updateBubblePosition();
  }

  function updateBubblePosition() {
    if (ui.bubble.hidden) return;
    const stage = ui.stage.getBoundingClientRect();
    const pet = ui.pet.getBoundingClientRect();
    const needed = Math.min(310, Math.max(180, ui.bubble.scrollWidth)) + 20;
    if (stage.right - pet.right >= needed) ui.bubble.dataset.side = "right";
    else if (pet.left - stage.left >= needed) ui.bubble.dataset.side = "left";
    else ui.bubble.dataset.side = "above";
  }

  function showBubble(text, milliseconds = 2400, force = false) {
    if (!state.dialogue && !force) return;
    ui.bubble.textContent = text;
    ui.bubble.hidden = false;
    state.bubbleUntil = performance.now() + milliseconds;
    requestAnimationFrame(updateBubblePosition);
  }

  function hideBubble() {
    ui.bubble.hidden = true;
    ui.bubble.textContent = "";
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isAppleMobile() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function showInstallTip(force = false) {
    if (isStandalone()) return;
    if (!force && sessionStorage.getItem("coco-install-tip-dismissed") === "1") return;
    const apple = isAppleMobile();
    ui.installTipText.textContent = apple ? t("installIos") : deferredInstallPrompt ? t("installPrompt") : t("installManual");
    ui.installTipButton.hidden = apple || !deferredInstallPrompt;
    ui.installTip.hidden = false;
  }

  function hideInstallTip() {
    ui.installTip.hidden = true;
    sessionStorage.setItem("coco-install-tip-dismissed", "1");
  }

  async function requestInstall() {
    if (!deferredInstallPrompt) {
      showInstallTip(true);
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    ui.install.hidden = true;
    ui.installTip.hidden = true;
  }

  function regionAt(x, y) {
    const nx = x / state.size;
    const ny = y / state.size;
    if (ny < .20) return "head";
    if (ny < .46) return nx < .5 ? "faceLeft" : "faceRight";
    if (ny < .76) {
      if (nx < .31) return "leftPaw";
      if (nx > .69) return "rightPaw";
      return "body";
    }
    return "feet";
  }

  function dialogueFor(action, region) {
    if (Math.random() < .34) return t(`dialogue${region[0].toUpperCase()}${region.slice(1)}`);
    return currentLanguage() === "zh" ? action.lineZh : action.lineEn;
  }

  function requestAction(action, region = "body", showDialogue = true) {
    if (!action || state.paused) return;
    const busy = state.active || state.preparing || state.queued || performance.now() < state.neutralUntil;
    if (busy) {
      if (!state.queued) {
        state.queued = { action, region, showDialogue };
        showBubble(t("queued"), 1900, true);
      } else {
        showBubble(t("queueFull"), 1800, true);
      }
      return;
    }
    startAction(action, region, showDialogue);
  }

  async function startAction(action, region, showDialogue) {
    state.preparing = true;
    ui.loading.hidden = false;
    try {
      const frames = await loadAction(action);
      state.active = { action, region, frames, started: performance.now() };
      state.idleGesture = null;
      state.nextAuto = performance.now() + randomBetween(18000, 36000);
      state.lastDrawnImage = null;
      ui.status.textContent = action[currentLanguage()];
      if (showDialogue) showBubble(dialogueFor(action, region), 2600);
    } catch (error) {
      console.error(error);
      showBubble(t("loadingFailed"), 2600, true);
    } finally {
      state.preparing = false;
      ui.loading.hidden = true;
    }
  }

  function finishAction(now) {
    state.active = null;
    state.neutralUntil = now + 100;
    state.nextIdle = now + randomBetween(3000, 8000);
    state.nextAuto = now + randomBetween(18000, 36000);
    state.lastDrawnImage = null;
    ui.status.textContent = t("idleStatus");
    if (state.idleFrames[0]) drawFrame(state.idleFrames[0], 1, 7);
  }

  function render(now) {
    if (!state.paused) {
      if (!ui.bubble.hidden && now >= state.bubbleUntil) hideBubble();

      if (state.active) {
        const elapsed = now - state.active.started;
        const progress = Math.min(1, elapsed / state.active.action.duration);
        const frameIndex = Math.min(7, Math.floor(progress * 8));
        drawFrame(state.active.frames[frameIndex], frameIndex + 1, 8);
        if (progress >= 1) finishAction(now);
      } else if (!state.preparing) {
        if (state.queued && now >= state.neutralUntil) {
          const queued = state.queued;
          state.queued = null;
          startAction(queued.action, queued.region, queued.showDialogue);
        } else if (now >= state.neutralUntil) {
          renderIdle(now);
          if (state.auto && now >= state.nextAuto) {
            requestAction(findAction(pick(data.automatic)), "body", Math.random() < .5);
          }
        }
      }
    }
    requestAnimationFrame(render);
  }

  function renderIdle(now) {
    if (!state.idleFrames.length) return;
    if (state.idleGesture) {
      const progress = Math.min(1, (now - state.idleGesture.started) / 950);
      const index = Math.min(6, Math.floor(progress * 7));
      drawFrame(state.idleFrames[index], index + 1, 7);
      if (progress >= 1) {
        state.idleGesture = null;
        state.nextIdle = now + randomBetween(3000, 8000);
      }
    } else {
      drawFrame(state.idleFrames[0], 1, 7);
      if (state.idle && now >= state.nextIdle) state.idleGesture = { started: now };
    }
  }

  function randomAction() { requestAction(pick(data.actions), "body", true); }

  function setPaused(paused) {
    if (state.paused === paused) return;
    const now = performance.now();
    if (paused) {
      state.paused = true;
      state.pauseStarted = now;
      ui.status.textContent = t("pausedStatus");
    } else {
      const delta = now - state.pauseStarted;
      shiftClocks(delta);
      state.paused = false;
      ui.status.textContent = state.active ? state.active.action[currentLanguage()] : t("idleStatus");
    }
    ui.pause.textContent = state.paused ? t("resume") : t("pause");
  }

  function shiftClocks(delta) {
    if (state.active) state.active.started += delta;
    if (state.idleGesture) state.idleGesture.started += delta;
    state.nextIdle += delta;
    state.nextAuto += delta;
    state.neutralUntil += delta;
    state.bubbleUntil += delta;
  }

  function bindEvents() {
    ui.pet.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      ui.pet.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pointers.size === 1) {
        state.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, petX: state.x, petY: state.y, moved: false };
      } else if (state.pointers.size === 2) {
        const points = [...state.pointers.values()];
        state.pinch = {
          distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
          size: state.size,
          centerX: state.x + state.size / 2,
          bottom: state.y + state.size
        };
        state.drag = null;
      }
      ui.pet.classList.add("dragging");
    });
    ui.pet.addEventListener("pointermove", (event) => {
      if (state.pointers.has(event.pointerId)) {
        state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (state.pinch && state.pointers.size >= 2) {
        const points = [...state.pointers.values()].slice(0, 2);
        const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
        state.size = Math.round(Math.max(160, Math.min(520, state.pinch.size * distance / state.pinch.distance)) / 10) * 10;
        state.x = state.pinch.centerX - state.size / 2;
        state.y = state.pinch.bottom - state.size;
        applyGeometry();
        return;
      }
      if (!state.drag || event.pointerId !== state.drag.pointerId) return;
      const dx = event.clientX - state.drag.startX;
      const dy = event.clientY - state.drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 5) state.drag.moved = true;
      if (state.drag.moved) {
        state.x = state.drag.petX + dx;
        state.y = state.drag.petY + dy;
        applyGeometryWithoutReset();
      }
    });
    ui.pet.addEventListener("pointerup", (event) => {
      if (!state.pointers.has(event.pointerId)) return;
      const wasPinching = state.pinch !== null || state.pointers.size > 1;
      state.pointers.delete(event.pointerId);
      if (wasPinching) {
        if (state.pointers.size < 2) state.pinch = null;
        state.drag = null;
        if (state.pointers.size === 0) ui.pet.classList.remove("dragging");
        saveSettings();
        return;
      }
      if (!state.drag || event.pointerId !== state.drag.pointerId) {
        ui.pet.classList.remove("dragging");
        return;
      }
      const moved = state.drag.moved;
      state.drag = null;
      ui.pet.classList.remove("dragging");
      if (moved) { saveSettings(); return; }
      const rect = ui.pet.getBoundingClientRect();
      const region = regionAt(event.clientX - rect.left, event.clientY - rect.top);
      requestAction(findAction(pick(data.regions[region])), region, true);
    });
    ui.pet.addEventListener("pointercancel", (event) => {
      state.pointers.delete(event.pointerId);
      state.drag = null;
      state.pinch = null;
      ui.pet.classList.remove("dragging");
    });
    ui.stage.addEventListener("pointermove", (event) => {
      if (state.drag || state.pinch || event.pointerType === "touch") return;
      const rect = ui.pet.getBoundingClientRect();
      const targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      const targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      state.gazeX += (targetX - state.gazeX) * .16;
      state.gazeY += (targetY - state.gazeY) * .16;
      ui.pet.style.transform = `translate(${state.gazeX * 2}px, ${state.gazeY * 1.2}px) rotate(${state.gazeX * .35}deg)`;
    });
    ui.stage.addEventListener("pointerleave", () => { state.gazeX = 0; state.gazeY = 0; ui.pet.style.transform = ""; });
    ui.pet.addEventListener("wheel", (event) => {
      event.preventDefault();
      const oldSize = state.size;
      state.size = Math.max(160, Math.min(520, state.size + (event.deltaY < 0 ? 20 : -20)));
      state.x -= (state.size - oldSize) / 2;
      state.y -= state.size - oldSize;
      applyGeometry();
      saveSettings();
    }, { passive: false });

    ui.auto.addEventListener("change", () => { state.auto = ui.auto.checked; state.nextAuto = performance.now() + randomBetween(12000, 28000); saveSettings(); });
    ui.idle.addEventListener("change", () => { state.idle = ui.idle.checked; state.idleGesture = null; saveSettings(); });
    ui.dialogue.addEventListener("change", () => { state.dialogue = ui.dialogue.checked; if (!state.dialogue) hideBubble(); saveSettings(); });
    ui.language.addEventListener("change", () => { state.languageMode = ui.language.value; localizePage(); saveSettings(); });
    ui.outfit.addEventListener("change", async () => { state.outfit = ui.outfit.value; saveSettings(); await loadIdle(state.outfit); showBubble(t("outfitReady"), 1800); });
    ui.background.addEventListener("change", () => setBackground(ui.background.value));
    ui.size.addEventListener("input", () => { state.size = Number(ui.size.value); applyGeometry(); });
    ui.size.addEventListener("change", saveSettings);
    ui.play.addEventListener("click", () => requestAction(findAction(ui.action.value), "body", true));
    ui.random.addEventListener("click", randomAction);
    ui.reset.addEventListener("click", () => resetPosition(true));
    ui.pause.addEventListener("click", () => setPaused(!state.paused));
    ui.panelButton.addEventListener("click", () => setPanel(!state.panelOpen));
    ui.closePanel.addEventListener("click", () => setPanel(false));
    ui.fullscreen.addEventListener("click", () => {
      if (!document.fullscreenEnabled) return;
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    });
    ui.install.addEventListener("click", requestInstall);
    ui.installPanel.addEventListener("click", requestInstall);
    ui.installTipButton.addEventListener("click", requestInstall);
    ui.installTipClose.addEventListener("click", hideInstallTip);
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      ui.install.hidden = false;
      if (!ui.installTip.hidden) showInstallTip(true);
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      ui.install.hidden = true;
      ui.installPanel.hidden = true;
      ui.installTipText.textContent = t("installed");
      ui.installTipButton.hidden = true;
      ui.installTip.hidden = false;
      setTimeout(() => { ui.installTip.hidden = true; }, 2200);
    });
    window.addEventListener("resize", () => { applyGeometryWithoutReset(); });
    window.addEventListener("keydown", (event) => {
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.code === "Space") { event.preventDefault(); randomAction(); }
      else if (event.key.toLowerCase() === "r") resetPosition(true);
      else if (event.key.toLowerCase() === "p") setPaused(!state.paused);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt) { shiftClocks(performance.now() - hiddenAt); hiddenAt = 0; }
    });
  }

  function setBackground(name) {
    state.background = name;
    ui.stage.className = `stage background-${name}`;
    ui.background.value = name;
    saveSettings();
  }

  function setPanel(open) {
    state.panelOpen = open;
    document.querySelector(".workspace").classList.toggle("panel-closed", !open);
    ui.panelButton.setAttribute("aria-expanded", String(open));
    saveSettings();
    requestAnimationFrame(applyGeometryWithoutReset);
  }

  async function boot() {
    try {
      const response = await fetch("./data.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      ui.auto.checked = state.auto;
      ui.idle.checked = state.idle;
      ui.dialogue.checked = state.dialogue;
      ui.language.value = state.languageMode;
      ui.background.value = state.background;
      localizePage();
      setBackground(state.background);
      setPanel(state.panelOpen);
      applyGeometry();
      bindEvents();
      if (isStandalone()) {
        ui.install.hidden = true;
        ui.installPanel.hidden = true;
      }
      else setTimeout(showInstallTip, 2600);
      if (!document.fullscreenEnabled) ui.fullscreen.hidden = true;
      await loadIdle(state.outfit);
      requestAnimationFrame(render);
      if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.error(error);
      ui.loading.hidden = false;
      ui.loading.textContent = "Unable to start Coco / Coco 启动失败";
    }
  }

  boot();
})();
