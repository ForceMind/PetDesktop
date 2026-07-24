export type Mood = "idle" | "thinking" | "excited" | "careful" | "celebrate" | "comfort";
export type Language = "zh" | "en";

export type Game = {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  playable?: boolean;
  minBet: number;
  maxBet: number;
  betOptions?: number[];
  maxSpinsPerRequest?: number;
  wagerMultiplier?: number;
  iconUrl?: string;
  type?: number;
  category?: number;
  players?: number;
  version?: number;
  theme: "fortune" | "candy" | "space" | "jungle";
};

export type QuickReply = { label: string; message: string };

export type AgentStep = {
  id: string;
  label: string;
  detail: string;
  status: "waiting" | "running" | "passed" | "failed";
  durationMs?: number;
};

export type PlayProposal = {
  actionId: string;
  game: Game;
  spins: number;
  betPerSpin: number;
  wagerPerSpin: number;
  totalBet: number;
  currency: string;
  expiresAt: string;
};

export type SpinOutcome = {
  index: number;
  symbols: string[];
  bet: number;
  win: number;
};

export type PlayResult = {
  transactionId: string;
  gameId: string;
  gameName: string;
  gameIconUrl?: string;
  spins: SpinOutcome[];
  totalBet: number;
  totalWin: number;
  net: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
};

export type PlayProgress = {
  gameId: string;
  gameName: string;
  completedSpins: number;
  totalSpins: number;
  totalBet: number;
  totalWin: number;
  net: number;
  balanceAfter: number;
  currency: string;
};

export type AssistantReply = {
  id: string;
  role: "assistant";
  message: string;
  mood: Mood;
  createdAt: string;
  quickReplies?: QuickReply[];
  games?: Game[];
  proposal?: PlayProposal;
  proposals?: PlayProposal[];
  cancelledActionIds?: string[];
  result?: PlayResult;
  trace?: AgentStep[];
};

export type UserMessage = {
  id: string;
  role: "user";
  message: string;
  createdAt: string;
};

export type ChatMessage = AssistantReply | UserMessage;

export type BootstrapResponse = {
  sessionId: string;
  petName: string;
  language: Language;
  demoMode: boolean;
  aiMode: "live" | "mock";
  gameMode: "live" | "mock";
  currency: string;
  games: Game[];
  limits: { maxSpins: number; maxTotalBet: number };
  launchContext: { keys: string[] };
  greeting: AssistantReply;
};
