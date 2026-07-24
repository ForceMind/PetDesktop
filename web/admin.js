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
      saveFailed: "保存失败", invalidCatalog: "游戏白名单必须是有效的 JSON 数组。"
    },
    en: {
      controlPlane: "Safety policies & configuration", connecting: "Connecting", backToCoco: "Back to Coco", title: "Settings",
      intro: "Configure model, game APIs, account adapter, URL parameters and hard execution limits. Secrets are write-only.",
      policyActive: "Policy gateway active", policyInput: "Input scope and prompt-injection checks", policyTool: "Server-side tool authorization and confirmation",
      policyOutput: "Output leakage and execution-claim review", authRequired: "Settings access token required",
      authHelp: "Enter the settings access token. It stays in this browser tab and is never placed in the URL.", connect: "Connect",
      runtime: "Runtime", runtimeHelp: "Changes apply immediately and reset in-memory chat sessions.", demoMode: "Demo safety mode",
      demoModeHelp: "Play is blocked when this switch is off.", aiProvider: "AI provider", secretHelp: "Configured secrets are never returned to this page.",
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
      saveFailed: "Save failed", invalidCatalog: "Game allowlist must be a valid JSON array."
    }
  }[zh ? "zh" : "en"];

  const form = $("configForm");
  const authPanel = $("authPanel");
  const tokenInput = $("adminToken");
  const saveButton = $("saveButton");
  const saveStatus = $("saveStatus");
  let token = sessionStorage.getItem("coco-admin-token") || "";
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
  loadConfig();

  async function loadConfig() {
    setConnection("working", text.loading);
    try {
      const payload = await request("/api/admin/config");
      fill(payload.config);
      authPanel.hidden = true;
      form.hidden = false;
      setConnection("ready", text.connected);
    } catch (error) {
      form.hidden = true;
      authPanel.hidden = false;
      setConnection("error", error.status === 401 ? text.unauthorized : error.message);
      tokenInput.focus();
    }
  }

  function fill(config) {
    $("demoMode").checked = config.demoMode;
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
