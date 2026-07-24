(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const zh = (navigator.language || "en").toLowerCase().startsWith("zh");
  const text = {
    zh: {
      controlPlane: "安全策略与配置", connecting: "正在连接", backToCoco: "返回 Coco", title: "设置",
      intro: "配置模型、游戏接口、账号适配、地址栏参数和硬执行限制。所有密钥只写不读。",
      policyActive: "策略网关已启用", policyInput: "输入范围与提示注入检查", policyTool: "服务端工具授权与二次确认",
      policyOutput: "输出泄漏与虚假执行声明审查", authRequired: "需要设置访问 Token",
      authHelp: "输入设置访问 Token。它只保留在当前标签页，不会进入地址栏。", connect: "连接",
      runtime: "运行模式", runtimeHelp: "配置立即生效，并会重置内存中的聊天会话。", demoMode: "Demo 安全模式",
      demoModeHelp: "关闭时将拒绝所有 play 调用。", aiProvider: "AI 模型服务", secretHelp: "已配置的密钥永远不会返回到此页面。",
      chatControl: "聊天与游戏总开关", chatControlHelp: "关闭后，服务器会阻止新的聊天、AI 和游戏请求；设置页仍可使用。",
      chatEnabled: "聊天已开启", chatDisabled: "聊天已关闭", disableChat: "一键关闭聊天", enableChat: "重新开启聊天",
      chatStateChanging: "正在切换…", chatStateOn: "聊天已开启，新的聊天和游戏请求可以继续。",
      chatStateOff: "聊天已关闭，前端无法再请求聊天、AI 或游戏。",
      apiStyle: "API 类型", model: "模型", baseUrl: "基础地址", timeout: "超时（毫秒）", reasoning: "推理强度",
      clearSecret: "清除已配置密钥", gameApi: "游戏接口与账号", gameHelp: "基础地址留空时使用可重复的本地 Mock。",
      gameProvider: "游戏适配器", listPath: "游戏列表路径", initPath: "初始化路径", playPath: "Play 路径",
      lobbyBaseUrl: "Lobby 基础地址", lobbyLoginPath: "Lobby 登录路径", lobbyIg: "允许的 Lobby IG",
      slotIg: "服务端 GameSlots IG", bingoIg: "服务端 Bingo IG", bingoInitPath: "Bingo 初始化路径", bingoPlayPath: "Bingo Play 路径",
      charmedIg: "服务端 Charmed IG", charmedInitPath: "Charmed 初始化路径", charmedPlayPath: "Charmed Play 路径",
      fruitIg: "服务端 FruitSpin IG", fruitInitPath: "FruitSpin 初始化路径", fruitPlayPath: "FruitSpin Play 路径",
      jetsetIg: "服务端 JetSet IG", jetsetInitPath: "JetSet 初始化路径", jetsetPlayPath: "JetSet Play 路径",
      playableIds: "已接通 Play 的游戏 ID", wagerMultiplier: "GameSlots 实际下注倍数",
      gameOrigin: "游戏 Web Origin", accountId: "默认游戏账号 ID（地址栏未提供 userId 时使用）", currency: "币种",
      urlParams: "地址栏参数", urlHelp: "只有白名单字段会进入服务端会话；参数值不会在这里显示，也不会发送给模型。",
      allowedParams: "允许的参数名（逗号分隔）", accountParam: "账号参数名", catalog: "游戏白名单",
      catalogHelp: "JSON 数组；空数组表示从游戏接口加载列表。", limits: "硬执行限制",
      limitsHelp: "这些检查在服务端执行，模型无法覆盖。下注档位以每款游戏当前返回的可用金额为准。", maxSpins: "单次最大局数",
      maxTotal: "单次最大总注", rate: "每分钟执行次数", ttl: "确认卡有效期（秒）", readyToSave: "保存前请检查配置。",
      saveNote: "密钥输入框留空时保持原值。", saveApply: "保存并应用", connected: "设置服务已连接", unauthorized: "等待设置授权",
      configured: "已配置", notConfigured: "未配置", loading: "正在读取配置…", saved: "配置已保存并立即生效；已有聊天会话已重置。",
      saveFailed: "保存失败", invalidCatalog: "游戏白名单必须是有效的 JSON 数组。",
      configurationTab: "配置", testDataTab: "测试数据",
      operations: "浏览器活动与日志", operationsHelp: "运行日志不记录聊天正文；对话内容只保存在受保护的“测试数据”页签。", refresh: "刷新",
      knownBrowsers: "最近打开过的浏览器", activeBrowsers: "5 分钟内活跃", recentEvents: "最近事件",
      browserList: "打开过 Coco 的浏览器", browser: "浏览器", maskedIp: "脱敏 IP", lastActive: "最后活动",
      visits: "打开次数", lastPath: "最后页面", eventLog: "运行日志", noBrowsers: "还没有浏览器访问记录。",
      noEvents: "还没有运行日志。", operationsFailed: "暂时无法读取运行日志。",
      outcomeOk: "成功", outcomeBlocked: "已阻止", outcomeFailed: "失败",
      pageOpen: "打开页面", chatBootstrap: "开始新对话", chatRequest: "聊天请求", gameExecute: "进行游戏",
      settingsSaved: "保存设置", chatStateChanged: "切换聊天开关", adminAuth: "设置授权失败", chatBlocked: "请求被总开关阻止",
      conversationSettings: "修改对话记录设置", conversationDeleted: "删除测试数据",
      archiveTitle: "对话测试数据", archiveHelp: "按匿名浏览器分组；不会保存 Key、IG、地址栏参数或内部提示词。",
      recordConversations: "记录测试对话", recordConversationsHelp: "关闭后不再保存新消息；已有记录会保留到过期或手动删除。",
      retentionDays: "保存天数", saveArchiveSettings: "保存记录设置", clearAllTestData: "清空全部测试数据",
      testUsers: "测试用户", testConversations: "对话", testMessages: "消息", archiveStorage: "私有存储",
      testUserList: "测试用户", conversationList: "对话列表", conversationDetail: "对话详情",
      storageHealthy: "正常", storageFailed: "异常", archiveSaved: "记录设置已保存。",
      archiveLoadFailed: "暂时无法读取测试数据。", noTestUsers: "服务器更新后产生的新对话会显示在这里。",
      noConversations: "这个浏览器还没有对话。", selectConversation: "选择一条对话查看完整内容。",
      deleteUserData: "删除该用户数据", deleteConversationData: "删除", messagesCount: "条消息",
      conversationsCount: "次对话", archiveDeleted: "测试数据已删除。", recordingOn: "正在记录", recordingOff: "已停止记录",
      clearAllConfirm: "确定清空全部测试对话吗？此操作无法恢复。", deleteUserConfirm: "确定删除这个浏览器的全部测试对话吗？",
      deleteConversationConfirm: "确定删除这次对话吗？", roleUser: "用户", roleCoco: "Coco", roleSystem: "系统",
      metaGame: "游戏", metaGames: "游戏", metaRounds: "局数", metaBetLevel: "下注档位", metaWager: "每局实际下注",
      metaTotalBet: "总下注", metaTotalWin: "总赢得", metaNet: "净结果", metaBalance: "余额", metaCurrency: "币种",
      round: "局", bet: "下注", win: "赢得"
    },
    en: {
      controlPlane: "Safety policies & configuration", connecting: "Connecting", backToCoco: "Back to Coco", title: "Settings",
      intro: "Configure model, game APIs, account adapter, URL parameters and hard execution limits. Secrets are write-only.",
      policyActive: "Policy gateway active", policyInput: "Input scope and prompt-injection checks", policyTool: "Server-side tool authorization and confirmation",
      policyOutput: "Output leakage and execution-claim review", authRequired: "Settings access token required",
      authHelp: "Enter the settings access token. It stays in this browser tab and is never placed in the URL.", connect: "Connect",
      runtime: "Runtime", runtimeHelp: "Changes apply immediately and reset in-memory chat sessions.", demoMode: "Demo safety mode",
      demoModeHelp: "Play is blocked when this switch is off.", aiProvider: "AI provider", secretHelp: "Configured secrets are never returned to this page.",
      chatControl: "Chat and game master switch", chatControlHelp: "Turning it off blocks new chat, AI and game requests on the server. Settings remain available.",
      chatEnabled: "Chat is on", chatDisabled: "Chat is off", disableChat: "Turn off chat", enableChat: "Turn chat back on",
      chatStateChanging: "Changing…", chatStateOn: "Chat is on. New chat and game requests can continue.",
      chatStateOff: "Chat is off. The frontend can no longer request chat, AI or games.",
      apiStyle: "API style", model: "Model", baseUrl: "Base URL", timeout: "Timeout (ms)", reasoning: "Reasoning effort",
      clearSecret: "Clear configured secret", gameApi: "Game API & account", gameHelp: "Leave Base URL empty to use the deterministic local mock.",
      gameProvider: "Provider adapter", listPath: "Game list path", initPath: "Init path", playPath: "Play path",
      lobbyBaseUrl: "Lobby Base URL", lobbyLoginPath: "Lobby login path", lobbyIg: "Allowed Lobby IG",
      slotIg: "Server-side GameSlots IG", bingoIg: "Server-side Bingo IG", bingoInitPath: "Bingo init path", bingoPlayPath: "Bingo Play path",
      charmedIg: "Server-side Charmed IG", charmedInitPath: "Charmed init path", charmedPlayPath: "Charmed Play path",
      fruitIg: "Server-side FruitSpin IG", fruitInitPath: "FruitSpin init path", fruitPlayPath: "FruitSpin Play path",
      jetsetIg: "Server-side JetSet IG", jetsetInitPath: "JetSet init path", jetsetPlayPath: "JetSet Play path",
      playableIds: "Playable game IDs", wagerMultiplier: "GameSlots wager multiplier",
      gameOrigin: "Game web origin", accountId: "Default game account ID (used when the URL has no userId)", currency: "Currency",
      urlParams: "Address-bar parameters", urlHelp: "Only allowlisted names enter the server session. Values are never shown here or sent to the model.",
      allowedParams: "Allowed parameter names (comma separated)", accountParam: "Account parameter name", catalog: "Game allowlist",
      catalogHelp: "JSON array. An empty array loads the list from the configured Game API.", limits: "Hard execution limits",
      limitsHelp: "These checks run on the server and cannot be overridden by the model. Bet levels follow the amounts currently offered by each game.", maxSpins: "Max rounds/request",
      maxTotal: "Max total bet", rate: "Executions/minute", ttl: "Confirmation TTL (seconds)", readyToSave: "Review values before saving.",
      saveNote: "Keys remain unchanged when their fields are blank.", saveApply: "Save & apply", connected: "Settings connected", unauthorized: "Waiting for settings authorization",
      configured: "configured", notConfigured: "not configured", loading: "Loading configuration…", saved: "Configuration saved and applied. Existing chat sessions were reset.",
      saveFailed: "Save failed", invalidCatalog: "Game allowlist must be a valid JSON array.",
      configurationTab: "Configuration", testDataTab: "Test data",
      operations: "Browser activity and logs", operationsHelp: "Operation logs contain no chat text. Conversation content is isolated in the protected Test data tab.", refresh: "Refresh",
      knownBrowsers: "Recent browsers", activeBrowsers: "Active in 5 minutes", recentEvents: "Recent events",
      browserList: "Browsers that opened Coco", browser: "Browser", maskedIp: "Masked IP", lastActive: "Last active",
      visits: "Opens", lastPath: "Last page", eventLog: "Operation log", noBrowsers: "No browser visits yet.",
      noEvents: "No operation events yet.", operationsFailed: "Operation logs are temporarily unavailable.",
      outcomeOk: "Success", outcomeBlocked: "Blocked", outcomeFailed: "Failed",
      pageOpen: "Page opened", chatBootstrap: "New conversation", chatRequest: "Chat request", gameExecute: "Game played",
      settingsSaved: "Settings saved", chatStateChanged: "Chat switch changed", adminAuth: "Settings authorization failed", chatBlocked: "Request blocked by master switch",
      conversationSettings: "Conversation recording changed", conversationDeleted: "Test data deleted",
      archiveTitle: "Conversation test data", archiveHelp: "Grouped by anonymous browser. Keys, IG values, URL parameters and internal prompts are never stored.",
      recordConversations: "Record test conversations", recordConversationsHelp: "When disabled, new messages stop being stored. Existing records remain until they expire or are deleted.",
      retentionDays: "Keep for days", saveArchiveSettings: "Save recording settings", clearAllTestData: "Clear all test data",
      testUsers: "Test users", testConversations: "Conversations", testMessages: "Messages", archiveStorage: "Private storage",
      testUserList: "Test users", conversationList: "Conversations", conversationDetail: "Conversation details",
      storageHealthy: "Healthy", storageFailed: "Error", archiveSaved: "Recording settings saved.",
      archiveLoadFailed: "Test data is temporarily unavailable.", noTestUsers: "New conversations created after the server update will appear here.",
      noConversations: "This browser has no conversations.", selectConversation: "Select a conversation to view the full content.",
      deleteUserData: "Delete user data", deleteConversationData: "Delete", messagesCount: "messages",
      conversationsCount: "conversations", archiveDeleted: "Test data deleted.", recordingOn: "Recording", recordingOff: "Not recording",
      clearAllConfirm: "Clear every test conversation? This cannot be undone.", deleteUserConfirm: "Delete every test conversation for this browser?",
      deleteConversationConfirm: "Delete this conversation?", roleUser: "User", roleCoco: "Coco", roleSystem: "System",
      metaGame: "Game", metaGames: "Games", metaRounds: "Rounds", metaBetLevel: "Bet level", metaWager: "Actual/round",
      metaTotalBet: "Total bet", metaTotalWin: "Total win", metaNet: "Net", metaBalance: "Balance", metaCurrency: "Currency",
      round: "Round", bet: "Bet", win: "Win"
    }
  }[zh ? "zh" : "en"];

  const form = $("configForm");
  const authPanel = $("authPanel");
  const tokenInput = $("adminToken");
  const saveButton = $("saveButton");
  const saveStatus = $("saveStatus");
  let token = sessionStorage.getItem("coco-admin-token") || "";
  let chatEnabled = true;
  let operationsTimer = 0;
  let currentAdminTab = window.location.hash === "#test-data" ? "test-data" : "config";
  let archiveOverview;
  let selectedBrowserId = "";
  let selectedConversationId = "";
  tokenInput.placeholder = zh ? "设置访问 Token" : "Settings access token";

  document.documentElement.lang = zh ? "zh-CN" : "en";
  document.title = text.title;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const value = text[node.dataset.i18n];
    if (value) node.textContent = value;
  });
  $("connectButton").addEventListener("click", () => {
    token = tokenInput.value;
    sessionStorage.setItem("coco-admin-token", token);
    loadConfig();
  });
  form.addEventListener("submit", saveConfig);
  $("gameProvider").addEventListener("change", applyProviderDefaults);
  $("chatStateButton").addEventListener("click", toggleChatState);
  $("operationsRefresh").addEventListener("click", loadOperations);
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => switchAdminTab(button.dataset.adminTab));
  });
  window.addEventListener("hashchange", () => {
    switchAdminTab(window.location.hash === "#test-data" ? "test-data" : "config", false);
  });
  $("archiveRefresh").addEventListener("click", loadConversationArchive);
  $("historySettingsSave").addEventListener("click", saveConversationSettings);
  $("archiveClearAll").addEventListener("click", clearAllConversations);
  loadConfig();

  async function loadConfig() {
    setConnection("working", text.loading);
    try {
      const payload = await request("/api/admin/config");
      fill(payload.config);
      authPanel.hidden = true;
      $("settingsTabs").hidden = false;
      switchAdminTab(currentAdminTab);
      setConnection("ready", text.connected);
      await loadOperations();
      if (!operationsTimer) {
        operationsTimer = window.setInterval(() => {
          loadOperations();
          if (currentAdminTab === "test-data") loadConversationArchive();
        }, 15_000);
      }
    } catch (error) {
      if (operationsTimer) window.clearInterval(operationsTimer);
      operationsTimer = 0;
      form.hidden = true;
      $("testDataPanel").hidden = true;
      $("settingsTabs").hidden = true;
      authPanel.hidden = false;
      setConnection("error", error.status === 401 ? text.unauthorized : error.message);
      tokenInput.focus();
    }
  }

  function fill(config) {
    $("demoMode").checked = config.demoMode;
    renderChatState(config.chatEnabled);
    $("historyEnabled").checked = config.chatHistory?.enabled !== false;
    $("historyRetentionDays").value = String(config.chatHistory?.retentionDays || 7);
    $("aiApiStyle").value = config.ai.apiStyle;
    $("aiBaseUrl").value = config.ai.baseUrl;
    $("aiModel").value = config.ai.model;
    $("aiChatPath").value = config.ai.chatPath;
    $("aiResponsesPath").value = config.ai.responsesPath;
    $("aiJsonMode").checked = config.ai.jsonMode;
    $("aiTimeout").value = config.ai.timeoutMs;
    $("aiReasoning").value = config.ai.reasoningEffort;
    $("aiKeyState").textContent = config.ai.apiKeyConfigured ? text.configured : text.notConfigured;
    $("gameProvider").value = config.game.provider;
    $("gameBaseUrl").value = config.game.baseUrl;
    $("gameListPath").value = config.game.listPath;
    $("gameInitPath").value = config.game.initPath;
    $("gamePlayPath").value = config.game.playPath;
    $("lobbyBaseUrl").value = config.game.lobbyBaseUrl;
    $("lobbyLoginPath").value = config.game.lobbyLoginPath;
    $("lobbyIg").value = config.game.lobbyIg;
    $("slotIg").value = config.game.slotIg;
    $("bingoIg").value = config.game.bingoIg;
    $("bingoInitPath").value = config.game.bingoInitPath;
    $("bingoPlayPath").value = config.game.bingoPlayPath;
    $("charmedIg").value = config.game.charmedIg;
    $("charmedInitPath").value = config.game.charmedInitPath;
    $("charmedPlayPath").value = config.game.charmedPlayPath;
    $("fruitIg").value = config.game.fruitIg;
    $("fruitInitPath").value = config.game.fruitInitPath;
    $("fruitPlayPath").value = config.game.fruitPlayPath;
    $("jetsetIg").value = config.game.jetsetIg;
    $("jetsetInitPath").value = config.game.jetsetInitPath;
    $("jetsetPlayPath").value = config.game.jetsetPlayPath;
    $("playableIds").value = config.game.playableIds.join(",");
    $("wagerMultiplier").value = config.game.wagerMultiplier;
    $("gameOrigin").value = config.game.origin;
    $("gameAccountId").value = config.game.accountId;
    $("gameCurrency").value = config.game.currency;
    $("gameTimeout").value = config.game.timeoutMs;
    $("gameKeyState").textContent = config.game.apiKeyConfigured ? text.configured : text.notConfigured;
    $("accountTokenState").textContent = config.game.accountTokenConfigured ? text.configured : text.notConfigured;
    $("launchParamKeys").value = config.game.launchParamKeys.join(",");
    $("accountParam").value = config.game.accountParam;
    $("gameCatalog").value = JSON.stringify(config.game.catalog, null, 2);
    $("maxSpins").value = config.limits.maxSpins;
    $("maxTotalBet").value = config.limits.maxTotalBet;
    $("ratePerMinute").value = config.limits.ratePerMinute;
    $("actionTtl").value = config.limits.actionTtlSeconds;
    clearSecretInputs();
  }

  async function toggleChatState() {
    const button = $("chatStateButton");
    button.disabled = true;
    button.textContent = text.chatStateChanging;
    try {
      const result = await request("/api/admin/chat-state", {
        method: "POST",
        body: JSON.stringify({ enabled: !chatEnabled })
      });
      renderChatState(result.chatEnabled);
      saveStatus.textContent = result.chatEnabled ? text.chatStateOn : text.chatStateOff;
      await loadOperations();
    } catch (error) {
      saveStatus.textContent = `${text.saveFailed}: ${error.message}`;
    } finally {
      button.disabled = false;
      renderChatState(chatEnabled);
    }
  }

  function renderChatState(enabled) {
    chatEnabled = enabled !== false;
    const badge = $("chatStateBadge");
    const button = $("chatStateButton");
    badge.textContent = chatEnabled ? text.chatEnabled : text.chatDisabled;
    badge.classList.toggle("off", !chatEnabled);
    button.textContent = chatEnabled ? text.disableChat : text.enableChat;
    button.classList.toggle("danger", chatEnabled);
    button.classList.toggle("success", !chatEnabled);
  }

  function switchAdminTab(tab, updateHash = true) {
    currentAdminTab = tab === "test-data" ? "test-data" : "config";
    if (updateHash) {
      window.history.replaceState(null, "", currentAdminTab === "test-data" ? "#test-data" : "#config");
    }
    form.hidden = currentAdminTab !== "config";
    $("testDataPanel").hidden = currentAdminTab !== "test-data";
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.adminTab === currentAdminTab);
      button.setAttribute("aria-selected", String(button.dataset.adminTab === currentAdminTab));
    });
    if (currentAdminTab === "test-data") loadConversationArchive();
  }

  async function loadOperations() {
    try {
      const payload = await request("/api/admin/operations");
      const operations = payload.operations;
      renderChatState(operations.chatEnabled);
      $("browserTotal").textContent = String(operations.browsers.length);
      $("browserActive").textContent = String(operations.browsers.filter((browser) => browser.active).length);
      $("eventTotal").textContent = String(operations.events.length);
      renderBrowsers(operations.browsers);
      renderEvents(operations.events);
    } catch (error) {
      renderOperationsError();
      if (error.status === 401) {
        if (operationsTimer) window.clearInterval(operationsTimer);
        operationsTimer = 0;
        form.hidden = true;
        $("testDataPanel").hidden = true;
        $("settingsTabs").hidden = true;
        authPanel.hidden = false;
        setConnection("error", text.unauthorized);
      }
    }
  }

  function renderBrowsers(browsers) {
    const body = $("browserRows");
    body.replaceChildren();
    if (!browsers.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "operations-empty";
      cell.textContent = text.noBrowsers;
      row.append(cell);
      body.append(row);
      return;
    }
    for (const browser of browsers) {
      const row = document.createElement("tr");
      const identity = document.createElement("td");
      const name = document.createElement("span");
      const dot = document.createElement("i");
      const meta = document.createElement("small");
      name.className = "browser-name";
      dot.className = `active-dot${browser.active ? "" : " off"}`;
      name.append(dot, document.createTextNode(browser.browser));
      meta.textContent = `${browser.platform} · ${browser.id}`;
      identity.append(name, meta);
      row.append(
        identity,
        tableCell(browser.ip),
        tableCell(formatTime(browser.lastSeen)),
        tableCell(String(browser.visits)),
        tableCell(browser.lastPath)
      );
      body.append(row);
    }
  }

  function renderEvents(events) {
    const container = $("operationEvents");
    container.replaceChildren();
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "operations-empty";
      empty.textContent = text.noEvents;
      container.append(empty);
      return;
    }
    for (const event of events) {
      const item = document.createElement("div");
      const time = document.createElement("time");
      const description = document.createElement("div");
      const label = document.createElement("b");
      const details = document.createElement("small");
      const outcome = document.createElement("b");
      item.className = "operation-event";
      time.dateTime = event.at;
      time.textContent = formatTime(event.at);
      label.textContent = eventLabel(event.type);
      details.textContent = eventDetails(event);
      description.append(label, details);
      outcome.dataset.outcome = event.outcome;
      outcome.textContent = outcomeLabel(event.outcome);
      item.append(time, description, outcome);
      container.append(item);
    }
  }

  function renderOperationsError() {
    $("browserRows").replaceChildren();
    $("operationEvents").replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "operations-empty";
    cell.textContent = text.operationsFailed;
    row.append(cell);
    $("browserRows").append(row);
    const eventError = document.createElement("div");
    eventError.className = "operations-empty";
    eventError.textContent = text.operationsFailed;
    $("operationEvents").append(eventError);
  }

  function tableCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    return cell;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(zh ? "zh-CN" : "en", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(date);
  }

  function eventLabel(type) {
    return {
      page_open: text.pageOpen,
      chat_bootstrap: text.chatBootstrap,
      chat_request: text.chatRequest,
      game_execute: text.gameExecute,
      settings_saved: text.settingsSaved,
      chat_state_changed: text.chatStateChanged,
      admin_auth: text.adminAuth,
      chat_blocked: text.chatBlocked,
      conversation_settings: text.conversationSettings,
      conversation_deleted: text.conversationDeleted
    }[type] || type;
  }

  function outcomeLabel(outcome) {
    return {
      ok: text.outcomeOk,
      blocked: text.outcomeBlocked,
      failed: text.outcomeFailed
    }[outcome] || outcome;
  }

  function eventDetails(event) {
    const details = Object.entries(event.details || {}).map(([key, value]) => `${key}: ${value}`);
    if (event.browserId) details.unshift(`#${event.browserId}`);
    return details.join(" · ");
  }

  async function loadConversationArchive() {
    try {
      const payload = await request("/api/admin/conversations");
      archiveOverview = payload.archive;
      $("historyEnabled").checked = archiveOverview.settings.enabled;
      $("historyRetentionDays").value = String(archiveOverview.settings.retentionDays);
      $("archiveUserTotal").textContent = String(archiveOverview.totals.users);
      $("archiveConversationTotal").textContent = String(archiveOverview.totals.conversations);
      $("archiveMessageTotal").textContent = String(archiveOverview.totals.messages);
      $("archiveStorageState").textContent = archiveOverview.persistenceHealthy ? text.storageHealthy : text.storageFailed;
      $("archiveStorageState").dataset.state = archiveOverview.persistenceHealthy ? "ready" : "error";
      ensureArchiveSelection();
      renderArchiveUsers();
      renderArchiveConversations();
      if (selectedConversationId) {
        await loadConversationDetail(selectedConversationId);
      } else {
        renderArchiveMessagePlaceholder(text.selectConversation);
      }
    } catch (error) {
      renderArchiveError(error);
    }
  }

  function ensureArchiveSelection() {
    const users = archiveOverview?.users || [];
    if (!users.some((user) => user.browserId === selectedBrowserId)) {
      selectedBrowserId = users[0]?.browserId || "";
    }
    const conversations = archiveConversationsForSelectedUser();
    if (!conversations.some((conversation) => conversation.id === selectedConversationId)) {
      selectedConversationId = conversations[0]?.id || "";
    }
  }

  function archiveConversationsForSelectedUser() {
    return (archiveOverview?.conversations || [])
      .filter((conversation) => conversation.browserId === selectedBrowserId);
  }

  function renderArchiveUsers() {
    const container = $("archiveUserList");
    container.replaceChildren();
    const users = archiveOverview?.users || [];
    if (!users.length) {
      container.append(archiveEmpty(text.noTestUsers));
      return;
    }
    for (const user of users) {
      const item = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("small");
      const actions = document.createElement("div");
      const count = document.createElement("span");
      const remove = document.createElement("button");
      item.className = `archive-list-item${user.browserId === selectedBrowserId ? " active" : ""}`;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      title.textContent = `${user.browser} · ${user.platform}`;
      meta.textContent = `#${user.browserId} · ${user.ip} · ${formatTime(user.lastSeen)}`;
      actions.className = "item-actions";
      count.textContent = `${user.conversationCount} ${text.conversationsCount} · ${user.messageCount} ${text.messagesCount}`;
      remove.type = "button";
      remove.className = "archive-delete";
      remove.textContent = text.deleteUserData;
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteBrowserConversations(user.browserId);
      });
      actions.append(count, remove);
      item.append(title, meta, actions);
      item.addEventListener("click", () => selectArchiveUser(user.browserId));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectArchiveUser(user.browserId);
      });
      container.append(item);
    }
  }

  function selectArchiveUser(browserId) {
    selectedBrowserId = browserId;
    selectedConversationId = archiveConversationsForSelectedUser()[0]?.id || "";
    renderArchiveUsers();
    renderArchiveConversations();
    if (selectedConversationId) loadConversationDetail(selectedConversationId);
    else renderArchiveMessagePlaceholder(text.noConversations);
  }

  function renderArchiveConversations() {
    const container = $("archiveConversationList");
    container.replaceChildren();
    const conversations = archiveConversationsForSelectedUser();
    if (!conversations.length) {
      container.append(archiveEmpty(selectedBrowserId ? text.noConversations : text.selectConversation));
      return;
    }
    for (const conversation of conversations) {
      const item = document.createElement("div");
      const title = document.createElement("strong");
      const preview = document.createElement("small");
      const actions = document.createElement("div");
      const count = document.createElement("span");
      const remove = document.createElement("button");
      item.className = `archive-list-item${conversation.id === selectedConversationId ? " active" : ""}`;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      title.textContent = formatTime(conversation.startedAt);
      preview.textContent = conversation.preview || `#${conversation.id}`;
      actions.className = "item-actions";
      count.textContent = `${conversation.messageCount} ${text.messagesCount}`;
      remove.type = "button";
      remove.className = "archive-delete";
      remove.textContent = text.deleteConversationData;
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteOneConversation(conversation.id);
      });
      actions.append(count, remove);
      item.append(title, preview, actions);
      item.addEventListener("click", () => selectArchiveConversation(conversation.id));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectArchiveConversation(conversation.id);
      });
      container.append(item);
    }
  }

  function selectArchiveConversation(id) {
    selectedConversationId = id;
    renderArchiveConversations();
    loadConversationDetail(id);
  }

  async function loadConversationDetail(id) {
    try {
      const payload = await request(`/api/admin/conversations/${encodeURIComponent(id)}`);
      renderConversationDetail(payload.conversation);
    } catch (error) {
      if (error.status === 404) {
        selectedConversationId = "";
        await loadConversationArchive();
        return;
      }
      renderArchiveMessagePlaceholder(text.archiveLoadFailed);
    }
  }

  function renderConversationDetail(conversation) {
    const heading = $("archiveConversationHeading");
    heading.replaceChildren();
    const title = document.createElement("h3");
    const meta = document.createElement("small");
    title.textContent = text.conversationDetail;
    meta.textContent = `#${conversation.id} · ${formatTime(conversation.startedAt)}`;
    heading.append(title, meta);
    const container = $("archiveMessages");
    container.replaceChildren();
    for (const message of conversation.messages) container.append(renderArchivedMessage(message));
  }

  function renderArchivedMessage(message) {
    const item = document.createElement("section");
    const header = document.createElement("header");
    const role = document.createElement("strong");
    const time = document.createElement("time");
    const body = document.createElement("p");
    item.className = `archive-message ${message.role}`;
    role.textContent = {
      user: text.roleUser,
      coco: text.roleCoco,
      system: text.roleSystem
    }[message.role] || message.role;
    time.dateTime = message.at;
    time.textContent = formatTime(message.at);
    body.textContent = message.message;
    header.append(role, time);
    item.append(header, body);
    if (message.metadata) item.append(renderArchiveMetadata(message.metadata));
    return item;
  }

  function renderArchiveMetadata(metadata) {
    const wrapper = document.createElement("div");
    wrapper.className = "archive-metadata";
    const values = [
      [text.metaGames, metadata.games?.join(", ")],
      [text.metaGame, metadata.game],
      [text.metaRounds, metadata.rounds],
      [text.metaBetLevel, metadata.betLevel],
      [text.metaWager, metadata.wagerPerRound],
      [text.metaTotalBet, metadata.totalBet],
      [text.metaTotalWin, metadata.totalWin],
      [text.metaNet, metadata.net],
      [text.metaBalance, metadata.balanceAfter],
      [text.metaCurrency, metadata.currency]
    ];
    for (const [label, value] of values) {
      if (value === undefined || value === "") continue;
      const chip = document.createElement("span");
      chip.textContent = `${label}: ${typeof value === "number" ? formatNumber(value) : value}`;
      wrapper.append(chip);
    }
    if (metadata.roundResults?.length) wrapper.append(renderRoundResults(metadata.roundResults));
    return wrapper;
  }

  function renderRoundResults(rounds) {
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const body = document.createElement("tbody");
    table.className = "round-results";
    [text.round, text.bet, text.win].forEach((label) => {
      const cell = document.createElement("th");
      cell.textContent = label;
      headerRow.append(cell);
    });
    head.append(headerRow);
    for (const round of rounds) {
      const row = document.createElement("tr");
      [round.round, formatNumber(round.bet), formatNumber(round.win)].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      });
      body.append(row);
    }
    table.append(head, body);
    return table;
  }

  function renderArchiveMessagePlaceholder(message) {
    $("archiveConversationHeading").replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = text.conversationDetail;
    $("archiveConversationHeading").append(heading);
    $("archiveMessages").replaceChildren(archiveEmpty(message));
  }

  function renderArchiveError(error) {
    $("archiveUserList").replaceChildren(archiveEmpty(text.archiveLoadFailed));
    $("archiveConversationList").replaceChildren(archiveEmpty(text.archiveLoadFailed));
    renderArchiveMessagePlaceholder(text.archiveLoadFailed);
    if (error.status === 401) {
      $("settingsTabs").hidden = true;
      form.hidden = true;
      $("testDataPanel").hidden = true;
      authPanel.hidden = false;
      setConnection("error", text.unauthorized);
    }
  }

  function archiveEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "archive-list-empty";
    empty.textContent = message;
    return empty;
  }

  async function saveConversationSettings() {
    const button = $("historySettingsSave");
    const retentionDays = Number($("historyRetentionDays").value);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) {
      $("historyRetentionDays").focus();
      return;
    }
    button.disabled = true;
    $("historySaveStatus").textContent = text.loading;
    try {
      await request("/api/admin/conversation-settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled: $("historyEnabled").checked,
          retentionDays
        })
      });
      $("historySaveStatus").textContent = text.archiveSaved;
      await loadConversationArchive();
      await loadOperations();
    } catch (error) {
      $("historySaveStatus").textContent = `${text.saveFailed}: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  async function clearAllConversations() {
    if (!window.confirm(text.clearAllConfirm)) return;
    await deleteArchiveRequest("/api/admin/conversations", { clearSelection: true });
  }

  async function deleteBrowserConversations(browserId) {
    if (!window.confirm(text.deleteUserConfirm)) return;
    await deleteArchiveRequest(`/api/admin/conversation-users/${encodeURIComponent(browserId)}`, { clearSelection: true });
  }

  async function deleteOneConversation(id) {
    if (!window.confirm(text.deleteConversationConfirm)) return;
    await deleteArchiveRequest(`/api/admin/conversations/${encodeURIComponent(id)}`, { clearConversation: true });
  }

  async function deleteArchiveRequest(url, options) {
    try {
      await request(url, { method: "DELETE" });
      if (options.clearSelection) {
        selectedBrowserId = "";
        selectedConversationId = "";
      } else if (options.clearConversation) {
        selectedConversationId = "";
      }
      $("historySaveStatus").textContent = text.archiveDeleted;
      await loadConversationArchive();
      await loadOperations();
    } catch (error) {
      $("historySaveStatus").textContent = `${text.saveFailed}: ${error.message}`;
    }
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(zh ? "zh-CN" : "en-US", { maximumFractionDigits: 2 }).format(value);
  }

  async function saveConfig(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    let catalog;
    try {
      catalog = JSON.parse($("gameCatalog").value || "[]");
      if (!Array.isArray(catalog)) throw new Error();
    } catch {
      saveStatus.textContent = text.invalidCatalog;
      $("gameCatalog").focus();
      return;
    }

    saveButton.disabled = true;
    saveStatus.textContent = text.loading;
    const payload = {
      demoMode: $("demoMode").checked,
      ai: {
        apiStyle: $("aiApiStyle").value,
        baseUrl: $("aiBaseUrl").value.trim(),
        model: $("aiModel").value.trim(),
        chatPath: $("aiChatPath").value.trim(),
        responsesPath: $("aiResponsesPath").value.trim(),
        jsonMode: $("aiJsonMode").checked,
        timeoutMs: Number($("aiTimeout").value),
        reasoningEffort: $("aiReasoning").value,
        ...secretPayload("aiApiKey", "clearAiKey")
      },
      game: {
        provider: $("gameProvider").value,
        baseUrl: $("gameBaseUrl").value.trim(),
        listPath: $("gameListPath").value.trim(),
        initPath: $("gameInitPath").value.trim(),
        playPath: $("gamePlayPath").value.trim(),
        lobbyBaseUrl: $("lobbyBaseUrl").value.trim(),
        lobbyLoginPath: $("lobbyLoginPath").value.trim(),
        lobbyIg: $("lobbyIg").value.trim(),
        slotIg: $("slotIg").value.trim(),
        bingoIg: $("bingoIg").value.trim(),
        bingoInitPath: $("bingoInitPath").value.trim(),
        bingoPlayPath: $("bingoPlayPath").value.trim(),
        charmedIg: $("charmedIg").value.trim(),
        charmedInitPath: $("charmedInitPath").value.trim(),
        charmedPlayPath: $("charmedPlayPath").value.trim(),
        fruitIg: $("fruitIg").value.trim(),
        fruitInitPath: $("fruitInitPath").value.trim(),
        fruitPlayPath: $("fruitPlayPath").value.trim(),
        jetsetIg: $("jetsetIg").value.trim(),
        jetsetInitPath: $("jetsetInitPath").value.trim(),
        jetsetPlayPath: $("jetsetPlayPath").value.trim(),
        playableIds: $("playableIds").value.split(",").map((id) => id.trim()).filter(Boolean),
        origin: $("gameOrigin").value.trim(),
        wagerMultiplier: Number($("wagerMultiplier").value),
        accountId: $("gameAccountId").value.trim(),
        currency: $("gameCurrency").value.trim(),
        timeoutMs: Number($("gameTimeout").value),
        launchParamKeys: $("launchParamKeys").value.split(",").map((key) => key.trim()).filter(Boolean),
        accountParam: $("accountParam").value.trim(),
        catalog,
        ...renameSecret(secretPayload("gameApiKey", "clearGameKey"), "apiKey"),
        ...renameSecret(secretPayload("gameAccountToken", "clearAccountToken"), "accountToken")
      },
      limits: {
        maxSpins: Number($("maxSpins").value),
        maxTotalBet: Number($("maxTotalBet").value),
        ratePerMinute: Number($("ratePerMinute").value),
        actionTtlSeconds: Number($("actionTtl").value)
      }
    };

    try {
      const result = await request("/api/admin/config", { method: "PUT", body: JSON.stringify(payload) });
      fill(result.config);
      saveStatus.textContent = text.saved;
      setConnection("ready", text.connected);
    } catch (error) {
      saveStatus.textContent = `${text.saveFailed}: ${error.message}`;
      if (error.status === 401) authPanel.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  }

  function secretPayload(inputId, clearId) {
    const value = $(inputId).value.trim();
    if ($(clearId).checked) return { apiKeyAction: "clear" };
    if (value) return { apiKeyAction: "set", apiKey: value };
    return { apiKeyAction: "keep" };
  }

  function renameSecret(value, name) {
    return {
      [`${name}Action`]: value.apiKeyAction,
      ...(value.apiKey ? { [name]: value.apiKey } : {})
    };
  }

  function clearSecretInputs() {
    ["aiApiKey", "gameApiKey", "gameAccountToken"].forEach((id) => { $(id).value = ""; });
    ["clearAiKey", "clearGameKey", "clearAccountToken"].forEach((id) => { $(id).checked = false; });
  }

  function applyProviderDefaults() {
    if ($("gameProvider").value !== "coconut") return;
    if (!$("gameBaseUrl").value) $("gameBaseUrl").value = "https://games-api.coconut.tv:14000";
    $("gameInitPath").value = "/game3/slot/initReq";
    $("gamePlayPath").value = "/game3/slot/playReq";
    $("bingoInitPath").value = "/game3/bingo/init";
    $("bingoPlayPath").value = "/game3/bingo/play";
    $("charmedInitPath").value = "/game3/charmed/init";
    $("charmedPlayPath").value = "/game3/charmed/play";
    $("fruitInitPath").value = "/game3/fruit/init";
    $("fruitPlayPath").value = "/game3/fruit/play";
    $("jetsetInitPath").value = "/game3/jetset/initReq";
    $("jetsetPlayPath").value = "/game3/jetset/playReq";
    $("lobbyBaseUrl").value = "https://games-api.coconut.tv";
    $("lobbyLoginPath").value = "/game/lobby/login";
    if (!$("playableIds").value) $("playableIds").value = "6001,6007,6014,6036,6037";
    $("wagerMultiplier").value = "12";
    $("gameOrigin").value = "https://games-web.coconut.tv:4000";
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function setConnection(state, label) {
    $("connectionState").dataset.state = state;
    $("connectionState").querySelector("b").textContent = label;
  }
})();
