(() => {
  "use strict";

  const ui = {
    launch: document.getElementById("aiSlotButton"),
    panel: document.getElementById("aiSlotPanel"),
    title: document.getElementById("aiSlotTitle"),
    close: document.getElementById("aiSlotClose"),
    status: document.getElementById("aiSlotStatus"),
    statusDot: document.getElementById("aiSlotStatusDot"),
    newChat: document.getElementById("aiChatNew"),
    history: document.getElementById("aiChatHistory"),
    historyPanel: document.getElementById("aiChatHistoryPanel"),
    historyTitle: document.getElementById("aiChatHistoryTitle"),
    historyNew: document.getElementById("aiChatHistoryNew"),
    historyList: document.getElementById("aiChatHistoryList"),
    messages: document.getElementById("aiSlotMessages"),
    trace: document.getElementById("aiSlotTrace"),
    traceTitle: document.getElementById("aiSlotTraceTitle"),
    traceList: document.getElementById("aiSlotTraceList"),
    traceProgress: document.getElementById("aiSlotTraceProgress"),
    form: document.getElementById("aiSlotForm"),
    inputLabel: document.getElementById("aiSlotInputLabel"),
    input: document.getElementById("aiSlotInput"),
    send: document.getElementById("aiSlotSend"),
    disclaimer: document.getElementById("aiSlotDisclaimer")
  };

  const copy = {
    en: {
      title: "Chat",
      panelAria: "Chat with Coco",
      close: "Close chat",
      waiting: "Coco is resting",
      connecting: "Coco is waking up…",
      connectedTest: "Coco is here",
      connectedReady: "Coco is listening",
      disconnected: "Coco is taking a nap",
      understanding: "Coco is understanding…",
      requestFailed: "Coco didn’t catch that",
      validation: "Coco is getting this game ready…",
      executeFailed: "This game didn’t start",
      stopped: "Coco stopped here",
      completed: "All done!",
      validationFailed: "This game didn’t go through",
      unknownError: "Coco got a little lost.",
      entryError: "Your game identity is missing. Please reopen Coco from the correct game entry.",
      gameUnavailable: "The game portal is unavailable right now. Please try again in a moment.",
      actionExpired: "That confirmation has expired. Ask Coco to prepare a new one.",
      send: "Send",
      inputLabel: "Message Coco",
      placeholder: "For example: play JetSet for 1 round, bet 10",
      disclaimer: "Coco starts only after you confirm the card.",
      newChat: "New conversation",
      history: "Conversation history",
      historyTitle: "Conversation history",
      noHistory: "No earlier conversations yet.",
      deleteHistory: "Delete conversation",
      deleteConfirm: "Delete this conversation?",
      historyReadOnly: "This is an earlier conversation. Start a new one to continue chatting.",
      viewingHistory: "Viewing an earlier conversation",
      traceTitle: "Coco’s game progress",
      rounds: "rounds",
      maxBet: "Total bet",
      confirm: "Confirm and play",
      roundCount: "Rounds",
      totalBet: "Total bet",
      totalWin: "Total win",
      balance: "Balance",
      games: "Games",
      playable: "playable",
      supportedGames: "Available",
      comingSoon: "Coming soon",
      comingSoonState: "coming soon",
      betLevel: "bet level",
      actualWager: "actual wager",
      betOptions: "Choose a bet level",
      actualPerRound: "actual/round"
    },
    zh: {
      title: "聊天",
      panelAria: "与 Coco 聊天",
      close: "关闭聊天",
      waiting: "Coco 正在休息",
      connecting: "Coco 正在醒来…",
      connectedTest: "Coco 来啦",
      connectedReady: "Coco 在听",
      disconnected: "Coco 暂时睡着了",
      understanding: "Coco 正在理解…",
      requestFailed: "Coco 没听清",
      validation: "Coco 正在准备这局…",
      executeFailed: "这局没有开始",
      stopped: "Coco 先停在这里",
      completed: "完成啦！",
      validationFailed: "这局没有顺利完成",
      unknownError: "Coco 刚才有点迷路了。",
      entryError: "没有找到游戏身份，请从正确的游戏入口重新打开页面。",
      gameUnavailable: "游戏传送门暂时没有回应，过一会儿再试吧。",
      actionExpired: "这张确认卡已经过期，请让 Coco 重新准备一张。",
      send: "发送",
      inputLabel: "给 Coco 发消息",
      placeholder: "例如：玩 JetSet 1 局，下注 10",
      disclaimer: "确认卡片前，Coco 不会开始游戏。",
      newChat: "新对话",
      history: "历史对话",
      historyTitle: "历史对话",
      noHistory: "还没有以前的对话。",
      deleteHistory: "删除对话",
      deleteConfirm: "确定删除这条对话吗？",
      historyReadOnly: "这里是以前的对话；开始新对话后可以继续聊天。",
      viewingHistory: "正在查看以前的对话",
      traceTitle: "Coco 的游戏进度",
      rounds: "局",
      maxBet: "总下注",
      confirm: "确认并开始",
      roundCount: "局数",
      totalBet: "总下注",
      totalWin: "总赢得",
      balance: "账号余额",
      games: "游戏列表",
      playable: "可以玩",
      supportedGames: "可以玩",
      comingSoon: "待上线",
      comingSoonState: "待上线",
      betLevel: "下注档位",
      actualWager: "实际下注",
      betOptions: "选择下注档位",
      actualPerRound: "实际/局"
    }
  };

  const HISTORY_KEY = "coco-chat-history-v1";
  class CocoRequestError extends Error {
    constructor(code = "REQUEST_FAILED", publicMessage = "") {
      super(publicMessage || code);
      this.name = "CocoRequestError";
      this.code = code;
      this.publicMessage = publicMessage;
    }
  }
  const state = {
    sessionId: "",
    booting: false,
    busy: false,
    viewingHistory: false,
    conversations: readHistory(),
    trace: new Map(),
    statusKey: "waiting",
    statusMode: "idle",
    statusVars: {}
  };

  ui.launch.addEventListener("click", () => setOpen(ui.panel.hidden));
  ui.close.addEventListener("click", () => setOpen(false));
  ui.newChat.addEventListener("click", () => bootstrap());
  ui.historyNew.addEventListener("click", () => bootstrap());
  ui.history.addEventListener("click", () => setHistoryOpen(ui.historyPanel.hidden));
  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(ui.input.value);
  });
  ui.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ui.form.requestSubmit();
    }
  });
  ui.input.addEventListener("input", resizeInput);
  window.addEventListener("coco:languagechange", localize);
  window.addEventListener("coco:settingspanelchange", (event) => {
    if (event.detail?.open) setOpen(false);
  });
  localize();

  function language() {
    if (window.CocoPet?.getLanguage) return window.CocoPet.getLanguage();
    const chineseSystem = (navigator.language || "en").toLowerCase().startsWith("zh");
    return chineseSystem ? "zh" : "en";
  }

  function t(key) {
    return copy[language()][key] ?? copy.en[key] ?? key;
  }

  function localize() {
    ui.title.textContent = t("title");
    ui.panel.setAttribute("aria-label", t("panelAria"));
    ui.close.setAttribute("aria-label", t("close"));
    ui.newChat.setAttribute("aria-label", t("newChat"));
    ui.newChat.title = t("newChat");
    ui.history.setAttribute("aria-label", t("history"));
    ui.history.title = t("history");
    ui.historyTitle.textContent = t("historyTitle");
    ui.historyNew.textContent = t("newChat");
    ui.trace.setAttribute("aria-label", t("traceTitle"));
    ui.traceTitle.textContent = t("traceTitle");
    ui.inputLabel.textContent = t("inputLabel");
    ui.input.placeholder = t("placeholder");
    ui.send.textContent = t("send");
    ui.disclaimer.textContent = state.viewingHistory ? t("historyReadOnly") : t("disclaimer");
    setStatus(state.statusKey, state.statusMode, state.statusVars);
    renderHistory();
  }

  function setOpen(open) {
    const wasHidden = ui.panel.hidden;
    if (open) {
      window.dispatchEvent(new CustomEvent("coco:chatpanelchange", { detail: { open: true } }));
    }
    ui.panel.hidden = !open;
    ui.launch.setAttribute("aria-expanded", String(open));
    if (!open) {
      setHistoryOpen(false);
      window.dispatchEvent(new CustomEvent("coco:chatpanelchange", { detail: { open: false } }));
      return;
    }
    if (wasHidden && !state.busy) bootstrap();
    window.setTimeout(() => ui.input.focus(), 50);
  }

  async function bootstrap() {
    if (state.booting || state.busy) return;
    state.booting = true;
    state.sessionId = "";
    state.viewingHistory = false;
    ui.form.hidden = false;
    ui.disclaimer.textContent = t("disclaimer");
    ui.messages.replaceChildren();
    state.trace.clear();
    ui.trace.hidden = true;
    renderTrace();
    setHistoryOpen(false);
    setStatus("connecting", "working");
    try {
      const response = await fetch("/api/slot/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ language: language(), launchParams: collectLaunchParams() })
      });
      const payload = await readJson(response);
      state.sessionId = payload.sessionId;
      createConversation(payload.sessionId);
      appendMessage(payload.greeting);
      setStatus("connectedTest", "ready");
      notifyPet("say", payload.greeting.message);
    } catch (error) {
      setStatus("disconnected", "error");
      appendSystemError(messageOf(error));
    } finally {
      state.booting = false;
    }
  }

  async function sendMessage(rawMessage) {
    const message = rawMessage.trim();
    if (!message || state.busy || state.viewingHistory) return;
    if (!state.sessionId) {
      await bootstrap();
      if (!state.sessionId) return;
    }

    appendMessage({ role: "user", message });
    ui.input.value = "";
    resizeInput();
    setBusy(true, "understanding");
    try {
      const response = await fetch("/api/slot/chat", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId, message, language: language() })
      });
      const reply = await readJson(response);
      appendMessage(reply);
      notifyPet("say", reply.message);
      setStatus("connectedReady", "ready");
    } catch (error) {
      appendSystemError(messageOf(error));
      setStatus("requestFailed", "error");
    } finally {
      setBusy(false);
    }
  }

  function appendMessage(item, options = {}) {
    const persist = options.persist !== false;
    const historical = options.historical === true;
    const normalized = {
      id: item.id || createLocalId(),
      createdAt: item.createdAt || new Date().toISOString(),
      ...item
    };
    if (normalized.cancelledActionIds?.length) {
      normalized.cancelledActionIds.forEach((actionId) => {
        const oldButton = ui.messages.querySelector(`button[data-action-id="${CSS.escape(actionId)}"]`);
        if (!oldButton) return;
        oldButton.closest(".ai-slot-proposal")?.querySelectorAll("button").forEach((button) => {
          button.disabled = true;
        });
        oldButton.textContent = language() === "zh" ? "已替换" : "Replaced";
      });
    }
    const article = document.createElement("article");
    article.className = `ai-slot-message ai-slot-message--${normalized.role === "user" ? "user" : "assistant"}`;
    if (normalized.games?.length) article.classList.add("ai-slot-message--with-games");

    const label = document.createElement("span");
    label.className = "ai-slot-message-label";
    label.textContent = normalized.role === "user" ? (language() === "zh" ? "你" : "YOU") : "COCO";
    article.append(label);

    const message = document.createElement("p");
    message.textContent = normalized.message;
    article.append(message);

    if (normalized.proposals?.length) normalized.proposals.forEach((proposal) => article.append(createProposal(proposal, !historical)));
    else if (normalized.proposal) article.append(createProposal(normalized.proposal, !historical));
    if (normalized.result) article.append(createResult(normalized.result));
    if (normalized.games?.length) article.append(createGameList(normalized.games, !historical));
    if (!historical && normalized.quickReplies?.length) article.append(createQuickReplies(normalized.quickReplies));

    ui.messages.append(article);
    if (persist) persistMessage(normalized);
    scrollMessages();
  }

  function createProposal(proposal, interactive = true) {
    const card = document.createElement("section");
    card.className = "ai-slot-proposal";
    const title = document.createElement("strong");
    title.textContent = proposal.game.name;
    const detail = document.createElement("span");
    detail.textContent = `${proposal.spins} ${t("rounds")} · ${t("betLevel")} ${format(proposal.betPerSpin)} · ${t("actualWager")} ${format(proposal.wagerPerSpin)} ${proposal.currency}/${t("rounds")}`;
    const total = document.createElement("b");
    total.textContent = `${t("maxBet")} ${format(proposal.totalBet)} ${proposal.currency}`;
    const options = Array.isArray(proposal.game.betOptions) ? proposal.game.betOptions : [];
    const optionGroup = document.createElement("div");
    optionGroup.className = "ai-slot-bet-options";
    if (options.length) {
      const optionLabel = document.createElement("span");
      optionLabel.textContent = t("betOptions");
      const buttons = document.createElement("div");
      buttons.className = "ai-slot-bet-option-buttons";
      const multiplier = Number(proposal.game.wagerMultiplier) || 1;
      options.forEach((bet) => {
        const button = document.createElement("button");
        const actual = bet * multiplier;
        const selected = Number(bet) === Number(proposal.betPerSpin);
        button.type = "button";
        button.className = selected ? "selected" : "";
        button.textContent = multiplier === 1
          ? format(bet)
          : `${format(bet)} → ${format(actual)} ${t("actualPerRound")}`;
        button.disabled = !interactive || selected;
        button.setAttribute("aria-pressed", String(selected));
        if (interactive && !selected) {
          button.addEventListener("click", () => sendMessage(
            language() === "zh" ? `改成 ${bet}` : `Change the bet to ${bet}`
          ));
        }
        buttons.append(button);
      });
      optionGroup.append(optionLabel, buttons);
    }
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "primary";
    confirm.dataset.actionId = proposal.actionId;
    confirm.textContent = interactive ? t("confirm") : t("history");
    confirm.disabled = !interactive;
    if (interactive) confirm.addEventListener("click", () => executeProposal(proposal, confirm));
    card.append(title, detail);
    if (options.length) card.append(optionGroup);
    card.append(total, confirm);
    return card;
  }

  async function executeProposal(proposal, button) {
    if (state.busy) return;
    button.disabled = true;
    state.trace.clear();
    ui.trace.hidden = false;
    renderTrace();
    setBusy(true, "validation");
    try {
      const response = await fetch(`/api/slot/actions/${encodeURIComponent(proposal.actionId)}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ sessionId: state.sessionId, language: language() })
      });
      if (!response.ok || !response.body) throw new CocoRequestError("GAME_UNAVAILABLE");
      await consumeStream(response.body);
    } catch (error) {
      appendSystemError(messageOf(error));
      setStatus("stopped", "error");
      button.disabled = false;
    } finally {
      setBusy(false);
    }
  }

  async function consumeStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) handleStreamEvent(JSON.parse(line));
      }
      if (done) break;
    }
    if (buffer.trim()) handleStreamEvent(JSON.parse(buffer));
  }

  function handleStreamEvent(event) {
    if (event.type === "step") {
      state.trace.set(event.step.id, event.step);
      ui.trace.hidden = false;
      renderTrace();
      return;
    }
    if (event.type === "progress") {
      const message = progressMessage(event.progress);
      appendMessage({ role: "assistant", message, mood: "excited" });
      notifyPet("say", message, 3600);
      return;
    }
    if (event.type === "error") throw new CocoRequestError(event.error?.code, event.error?.message);
    if (event.type === "final") {
      appendMessage(event.reply);
      const result = event.reply.result;
      if (result) notifyPet("reactToSlot", result, event.reply.message);
      setStatus("completed", "ready");
    }
  }

  function renderTrace() {
    ui.traceList.replaceChildren();
    const items = Array.from(state.trace.values());
    const passed = items.filter((step) => step.status === "passed").length;
    ui.traceProgress.textContent = `${passed} / 8`;
    for (const step of items) {
      const row = document.createElement("li");
      row.dataset.status = step.status;
      const marker = document.createElement("i");
      marker.textContent = step.status === "passed" ? "✓" : step.status === "failed" ? "!" : "·";
      const content = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = step.label;
      const detail = document.createElement("small");
      detail.textContent = step.detail;
      content.append(title, detail);
      row.append(marker, content);
      ui.traceList.append(row);
    }
    scrollMessages();
  }

  function createResult(result) {
    const card = document.createElement("section");
    card.className = "ai-slot-result";
    const netClass = result.net > 0 ? "win" : result.net < 0 ? "loss" : "even";
    const heading = document.createElement("div");
    heading.className = `ai-slot-result-net ${netClass}`;
    const identity = document.createElement("div");
    identity.className = "ai-slot-result-game";
    if (result.gameIconUrl) {
      const icon = document.createElement("img");
      icon.src = result.gameIconUrl;
      icon.alt = "";
      icon.loading = "lazy";
      icon.referrerPolicy = "no-referrer";
      icon.addEventListener("error", () => { icon.hidden = true; });
      identity.append(icon);
    }
    const name = document.createElement("strong");
    name.textContent = result.gameName;
    identity.append(name);
    const net = document.createElement("b");
    net.textContent = `${result.net > 0 ? "+" : ""}${format(result.net)} ${result.currency}`;
    heading.append(identity, net);
    card.append(heading);

    const stats = document.createElement("dl");
    [
      [t("roundCount"), result.spins.length],
      [t("totalBet"), `${format(result.totalBet)} ${result.currency}`],
      [t("totalWin"), `${format(result.totalWin)} ${result.currency}`],
      [t("balance"), `${format(result.balanceAfter)} ${result.currency}`]
    ].forEach(([term, value]) => {
      const box = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = String(term);
      dd.textContent = String(value);
      box.append(dt, dd);
      stats.append(box);
    });
    card.append(stats);

    const reels = document.createElement("div");
    reels.className = "ai-slot-reels";
    result.spins.forEach((spin) => {
      const row = document.createElement("span");
      row.textContent = language() === "zh"
        ? `第 ${spin.index} 局 · ${spin.win > 0 ? `赢得 ${format(spin.win)} ${result.currency}` : "未中奖"}`
        : `Round ${spin.index} · ${spin.win > 0 ? `Won ${format(spin.win)} ${result.currency}` : "No win"}`;
      reels.append(row);
    });
    card.append(reels);
    return card;
  }

  function createQuickReplies(replies) {
    const group = document.createElement("div");
    group.className = "ai-slot-quick-replies";
    replies.forEach((reply) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = reply.label;
      button.addEventListener("click", () => sendMessage(reply.message));
      group.append(button);
    });
    return group;
  }

  function createGameList(games, interactive = true) {
    const section = document.createElement("section");
    section.className = "ai-message-game-list";
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = t("games");
    const tabs = document.createElement("div");
    tabs.className = "ai-game-tabs";
    const grid = document.createElement("div");
    grid.className = "ai-message-game-grid";

    const supported = games.filter((game) => game.playable !== false);
    const upcoming = games.filter((game) => game.playable === false);
    const supportedTab = makeTab(t("supportedGames"), true);
    const upcomingTab = makeTab(t("comingSoon"), false);
    upcomingTab.disabled = upcoming.length === 0;
    tabs.append(supportedTab, upcomingTab);
    heading.append(title, tabs);

    supportedTab.addEventListener("click", () => selectTab(false));
    upcomingTab.addEventListener("click", () => selectTab(true));
    selectTab(false);

    function makeTab(label, selected) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.selected = String(selected);
      return button;
    }

    function selectTab(showUpcoming) {
      supportedTab.dataset.selected = String(!showUpcoming);
      upcomingTab.dataset.selected = String(showUpcoming);
      renderGames(showUpcoming ? upcoming : supported, showUpcoming);
    }

    function renderGames(items, showUpcoming) {
      grid.replaceChildren();
      for (const game of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-game-card";
        button.dataset.playable = String(!showUpcoming);
        button.disabled = showUpcoming || !interactive;
        button.title = game.name;
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        if (game.iconUrl) image.src = game.iconUrl;
        const label = document.createElement("span");
        label.textContent = game.name;
        const stateLabel = document.createElement("small");
        stateLabel.textContent = showUpcoming ? t("comingSoonState") : t("playable");
        button.append(image, label, stateLabel);
        if (!button.disabled) {
          button.addEventListener("click", () => sendMessage(
            language() === "zh"
              ? `玩 ${game.name} 1 局，下注档位 ${preferredGameBet(game)}`
              : `Play ${game.name} for 1 round, bet level ${preferredGameBet(game)}`
          ));
        }
        grid.append(button);
      }
    }
    section.append(heading, grid);
    return section;
  }

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(value) ? value.slice(0, 30) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    state.conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    state.conversations = state.conversations.slice(0, 30);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.conversations)); }
    catch { /* History remains available for the current page if storage is full. */ }
    renderHistory();
  }

  function createConversation(id) {
    const now = new Date().toISOString();
    state.conversations = state.conversations.filter((conversation) => conversation.id !== id);
    state.conversations.unshift({
      id,
      title: t("newChat"),
      createdAt: now,
      updatedAt: now,
      messages: []
    });
    saveHistory();
  }

  function persistMessage(item) {
    const conversation = state.conversations.find((candidate) => candidate.id === state.sessionId);
    if (!conversation) return;
    const firstUserMessage = item.role === "user" && !conversation.messages.some((message) => message.role === "user");
    conversation.messages.push(item);
    conversation.messages = conversation.messages.slice(-80);
    if (firstUserMessage) {
      conversation.title = String(item.message).replace(/\s+/g, " ").trim().slice(0, 36) || t("newChat");
    }
    conversation.updatedAt = new Date().toISOString();
    saveHistory();
  }

  function setHistoryOpen(open) {
    ui.historyPanel.hidden = !open;
    ui.history.setAttribute("aria-expanded", String(open));
    if (open) renderHistory();
  }

  function renderHistory() {
    ui.historyList.replaceChildren();
    if (!state.conversations.length) {
      const empty = document.createElement("p");
      empty.className = "ai-chat-history-empty";
      empty.textContent = t("noHistory");
      ui.historyList.append(empty);
      return;
    }
    for (const conversation of state.conversations) {
      const item = document.createElement("article");
      item.className = "ai-chat-history-item";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "ai-chat-history-open";
      const title = document.createElement("strong");
      title.textContent = conversation.title || t("newChat");
      const time = document.createElement("small");
      time.textContent = formatHistoryTime(conversation.updatedAt);
      open.append(title, time);
      open.addEventListener("click", () => showConversation(conversation.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ai-chat-history-delete";
      remove.textContent = "×";
      remove.title = t("deleteHistory");
      remove.setAttribute("aria-label", `${t("deleteHistory")}: ${conversation.title || t("newChat")}`);
      remove.addEventListener("click", () => deleteConversation(conversation.id));
      item.append(open, remove);
      ui.historyList.append(item);
    }
  }

  function showConversation(id) {
    const conversation = state.conversations.find((candidate) => candidate.id === id);
    if (!conversation) return;
    state.sessionId = id;
    state.viewingHistory = true;
    ui.form.hidden = true;
    ui.disclaimer.textContent = t("historyReadOnly");
    ui.messages.replaceChildren();
    state.trace.clear();
    ui.trace.hidden = true;
    renderTrace();
    conversation.messages.forEach((item) => appendMessage(item, { persist: false, historical: true }));
    setHistoryOpen(false);
    setStatus("viewingHistory", "ready");
  }

  function deleteConversation(id) {
    const conversation = state.conversations.find((candidate) => candidate.id === id);
    if (!conversation || !window.confirm(t("deleteConfirm"))) return;
    const deletedCurrent = id === state.sessionId;
    state.conversations = state.conversations.filter((candidate) => candidate.id !== id);
    saveHistory();
    if (deletedCurrent) bootstrap();
  }

  function formatHistoryTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(language() === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function createLocalId() {
    return globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function collectLaunchParams() {
    const values = {};
    new URLSearchParams(location.search).forEach((value, key) => {
      if (key !== "ai" && key.length <= 64 && value.length <= 512) values[key] = value;
    });
    return values;
  }

  function appendSystemError(message) {
    const item = document.createElement("p");
    item.className = "ai-slot-error";
    item.textContent = message;
    ui.messages.append(item);
    scrollMessages();
  }

  async function readJson(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new CocoRequestError(payload.error?.code, payload.error?.message);
    return payload;
  }

  function setBusy(busy, statusKey) {
    state.busy = busy;
    ui.input.disabled = busy;
    ui.send.disabled = busy;
    if (statusKey) setStatus(statusKey, "working");
  }

  function setStatus(key, mode, vars = {}) {
    state.statusKey = key;
    state.statusMode = mode;
    state.statusVars = vars;
    ui.status.textContent = t(key);
    ui.statusDot.dataset.mode = mode;
  }

  function resizeInput() {
    ui.input.style.height = "auto";
    ui.input.style.height = `${Math.min(ui.input.scrollHeight, 110)}px`;
  }

  function scrollMessages() {
    window.requestAnimationFrame(() => {
      ui.messages.scrollTop = ui.messages.scrollHeight;
    });
  }

  function format(value) {
    return new Intl.NumberFormat(language() === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 }).format(value);
  }

  function messageOf(error) {
    if (!(error instanceof CocoRequestError)) return t("unknownError");
    if (["GAME_ACCOUNT_REQUIRED", "LOBBY_IG_REQUIRED", "LOBBY_IG_MISMATCH"].includes(error.code)) {
      return t("entryError");
    }
    if (["ACTION_EXPIRED", "ACTION_NOT_FOUND", "ACTION_ALREADY_USED"].includes(error.code)) {
      return t("actionExpired");
    }
    if (
      ["BET_LIMIT", "SPIN_LIMIT", "TOTAL_BET_LIMIT"].includes(error.code)
      || error.code.endsWith("_BET_NOT_ALLOWED")
    ) {
      return error.publicMessage || t("gameUnavailable");
    }
    if (
      error.code.startsWith("LOBBY_")
      || error.code.startsWith("COCONUT_")
      || error.code.startsWith("PLAY_")
      || error.code === "GAME_UNAVAILABLE"
    ) {
      return t("gameUnavailable");
    }
    return t("unknownError");
  }

  function preferredGameBet(game) {
    const firstOption = Array.isArray(game.betOptions) ? game.betOptions[0] : undefined;
    return Number.isFinite(firstOption) ? firstOption : game.minBet;
  }

  function progressMessage(progress) {
    const signedNet = `${progress.net > 0 ? "+" : ""}${format(progress.net)} ${progress.currency}`;
    return language() === "zh"
      ? `已经完成 ${progress.completedSpins}/${progress.totalSpins} 局：累计下注 ${format(progress.totalBet)} ${progress.currency}，累计赢得 ${format(progress.totalWin)} ${progress.currency}，当前净结果 ${signedNet}，余额 ${format(progress.balanceAfter)} ${progress.currency}。`
      : `${progress.completedSpins}/${progress.totalSpins} rounds complete: ${format(progress.totalBet)} ${progress.currency} bet, ${format(progress.totalWin)} ${progress.currency} won, current net ${signedNet}, balance ${format(progress.balanceAfter)} ${progress.currency}.`;
  }

  function notifyPet(method, ...args) {
    try {
      const callback = window.CocoPet?.[method];
      if (typeof callback === "function") callback(...args);
    } catch {
      // Chat must remain usable while the pet canvas is still waking up.
    }
  }

})();
