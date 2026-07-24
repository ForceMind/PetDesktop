import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import {
  mapLobbyGames,
  reconcileBingoRound,
  reconcileCharmedRound,
  reconcileCoconutRound,
  reconcileFruitRound,
  reconcileJetSetRound
} from "./coconut";

const losingRound = {
  token: 1_028_015,
  location: [16, 2, 5, 7, 10],
  score: 0,
  item: null,
  itemScore: 0,
  itemUUID: null,
  winStateList: [],
  responseId: "HdO3DP00",
  slotType: 3,
  table: [
    "2   ,7   ,7   ,2   ,2   ",
    "3   ,9   ,10  ,10  ,7   ",
    "7   ,10  ,8   ,8   ,9   "
  ]
};

describe("Coconut protocol adapter", () => {
  it("maps lobby games and only authorizes configured Play IDs", () => {
    const games = mapLobbyGames({
      gameList: [
        {
          id: 6001,
          name: "GameSlots",
          icon: "https://games-web.coconut.tv/icon/slots.png",
          legacyUrl: "https://example.invalid/per-user",
          type: 0,
          category: 1,
          players: 9,
          v: 2
        },
        {
          id: 1006,
          name: "Mines",
          icon: "https://games-web.coconut.tv/icon/mines.png",
          legacyUrl: "",
          type: 0,
          category: 2,
          players: 3,
          v: 1
        }
      ]
    }, ["6001"], 12);

    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({
      id: "6001",
      playable: true,
      iconUrl: "https://games-web.coconut.tv/icon/slots.png",
      wagerMultiplier: 12
    });
    expect(games[1]).toMatchObject({ id: "1006", playable: false });
    expect(JSON.stringify(games)).not.toContain("per-user");
  });

  it("computes the real wager and reconciles the observed balance equation", () => {
    const result = reconcileCoconutRound({
      balanceBefore: 1_028_027,
      apiToken: 1,
      wagerMultiplier: 12,
      data: losingRound,
      index: 1
    });

    expect(result.balanceAfter).toBe(1_028_015);
    expect(result.spin).toEqual({
      index: 1,
      symbols: ["2·7·7·2·2", "3·9·10·10·7", "7·10·8·8·9"],
      bet: 12,
      win: 0
    });
  });

  it("maps only verified game adapters as playable", () => {
    const games = mapLobbyGames({
      gameList: [
        {
          id: 6036,
          name: "Bingo",
          icon: "https://games-web.coconut.tv/icon/bingo.png",
          legacyUrl: "",
          type: 0,
          category: 0,
          players: 1,
          v: 0
        },
        {
          id: 6007,
          name: "FruitSpin",
          icon: "https://games-web.coconut.tv/icon/fruit.png",
          legacyUrl: "",
          type: 0,
          category: 0,
          players: 1,
          v: 0
        },
        {
          id: 6014,
          name: "JetSet",
          icon: "https://games-web.coconut.tv/icon/jetset.png",
          legacyUrl: "",
          type: 0,
          category: 0,
          players: 1,
          v: 0
        },
        {
          id: 6037,
          name: "Charmed",
          icon: "https://games-web.coconut.tv/icon/charmed.png",
          legacyUrl: "",
          type: 0,
          category: 0,
          players: 1,
          v: 0
        },
        {
          id: 1006,
          name: "Mines",
          icon: "https://games-web.coconut.tv/icon/mines.png",
          legacyUrl: "",
          type: 0,
          category: 0,
          players: 1,
          v: 0
        }
      ]
    }, ["6007", "6014", "6036", "6037", "1006"], 12);

    expect(games[0]).toMatchObject({
      id: "6036",
      playable: true,
      minBet: 10,
      maxBet: 1000,
      wagerMultiplier: 4
    });
    expect(games[1]).toMatchObject({
      id: "6007",
      playable: true,
      minBet: 10,
      maxBet: 5000,
      wagerMultiplier: 1
    });
    expect(games[2]).toMatchObject({
      id: "6014",
      playable: true,
      minBet: 10,
      maxBet: 1000,
      wagerMultiplier: 1
    });
    expect(games[3]).toMatchObject({
      id: "6037",
      playable: true,
      minBet: 10,
      maxBet: 1000,
      maxSpinsPerRequest: 1,
      wagerMultiplier: 1
    });
    expect(games[4]).toMatchObject({ id: "1006", playable: false });
  });

  it("reconciles Bingo wager, per-card wins, total win, and balance", () => {
    const result = reconcileBingoRound({
      balanceBefore: 1_028_105,
      apiToken: 10,
      cardCount: 4,
      index: 1,
      data: {
        token: 1_028_105,
        totalWin: 40,
        balls: Array.from({ length: 32 }, (_, index) => index + 1),
        cards: [
          { cards: Array.from({ length: 15 }, (_, index) => index + 1), win: 10 },
          { cards: Array.from({ length: 15 }, (_, index) => index + 16), win: 10 },
          { cards: Array.from({ length: 15 }, (_, index) => index + 31), win: 0 },
          { cards: Array.from({ length: 15 }, (_, index) => index + 46), win: 20 }
        ],
        slotType: 1,
        uuid: "test0001"
      }
    });

    expect(result.balanceAfter).toBe(1_028_105);
    expect(result.spin).toEqual({
      index: 1,
      symbols: ["Card 1: 10", "Card 2: 10", "Card 3: 0", "Card 4: 20"],
      bet: 40,
      win: 40
    });
  });

  it("rejects a Bingo response whose card wins do not match totalWin", () => {
    expect(() => reconcileBingoRound({
      balanceBefore: 100,
      apiToken: 10,
      cardCount: 4,
      index: 1,
      data: {
        token: 100,
        totalWin: 40,
        balls: [1],
        cards: [
          { cards: Array.from({ length: 15 }, (_, index) => index + 1), win: 10 },
          { cards: Array.from({ length: 15 }, (_, index) => index + 16), win: 10 },
          { cards: Array.from({ length: 15 }, (_, index) => index + 31), win: 0 },
          { cards: Array.from({ length: 15 }, (_, index) => index + 46), win: 10 }
        ],
        slotType: 1,
        uuid: "test0002"
      }
    })).toThrowError(AppError);
  });

  it("reconciles Charmed step totals, wager, and balance", () => {
    const firstGrid = Array.from({ length: 6 }, () => [1, 2, 3, 4, 5, 6]);
    const finalGrid = Array.from({ length: 6 }, () => [6, 5, 4, 3, 2, 1]);
    const result = reconcileCharmedRound({
      balanceBefore: 100,
      apiToken: 10,
      index: 1,
      data: {
        token: 110,
        freeCount: 0,
        totalFree: 0,
        totalWin: 20,
        step: [
          { grid: firstGrid, payOut: 2, clear: { gp: [] }, win: 5 },
          { grid: finalGrid, payOut: 3, clear: { gp: [] }, win: 15 }
        ],
        slotType: 1,
        uuid: "test0003",
        totalPayOut: 5
      }
    });

    expect(result.balanceAfter).toBe(110);
    expect(result.spin).toEqual({
      index: 1,
      symbols: Array.from({ length: 6 }, () => "6·5·4·3·2·1"),
      bet: 10,
      win: 20
    });
  });

  it("rejects Charmed when step wins do not match totalWin", () => {
    expect(() => reconcileCharmedRound({
      balanceBefore: 100,
      apiToken: 10,
      index: 1,
      data: {
        token: 90,
        freeCount: 0,
        totalFree: 0,
        totalWin: 0,
        step: [{
          grid: Array.from({ length: 6 }, () => [1, 2, 3, 4, 5, 6]),
          payOut: 0,
          clear: { gp: [] },
          win: 1
        }],
        slotType: 1,
        uuid: "test0004",
        totalPayOut: 0
      }
    })).toThrowError(AppError);
  });

  it("reconciles FruitSpin mode, wager, win, and balance", () => {
    const result = reconcileFruitRound({
      balanceBefore: 100,
      apiToken: 10,
      requestedType: 1,
      index: 1,
      data: {
        win: 20,
        sel: [1, 11, 15],
        token: 110,
        pool: 14_252,
        responseId: "test0005",
        slotType: 1,
        table: [[1, 1, 1]],
        isBig: false
      }
    });

    expect(result).toMatchObject({
      balanceAfter: 110,
      poolAfter: 14_252,
      spin: {
        index: 1,
        symbols: ["Stop 1", "Stop 11", "Stop 15"],
        bet: 10,
        win: 20
      }
    });
  });

  it("rejects FruitSpin when the returned mode differs from the request", () => {
    expect(() => reconcileFruitRound({
      balanceBefore: 100,
      apiToken: 10,
      requestedType: 1,
      index: 1,
      data: {
        win: 0,
        sel: [1, 2, 3],
        token: 90,
        pool: 100,
        responseId: "test0006",
        slotType: 2,
        table: [],
        isBig: false
      }
    })).toThrowError(AppError);
  });

  it("reconciles JetSet reels, wager, score, and balance", () => {
    const result = reconcileJetSetRound({
      balanceBefore: 100,
      apiToken: 10,
      requestedType: 1,
      index: 1,
      data: {
        token: 105,
        location: [9, 11, 9, 15, 15],
        score: 15,
        winStateList: [{ index: 8, line: 3, id: 5 }],
        responseId: "test0007",
        slotType: 1,
        table: [
          "1,2,3,4,5",
          "5,4,3,2,1",
          "2,3,4,5,6"
        ]
      }
    });

    expect(result).toMatchObject({
      balanceAfter: 105,
      spin: {
        index: 1,
        symbols: ["1·2·3·4·5", "5·4·3·2·1", "2·3·4·5·6"],
        bet: 10,
        win: 15
      }
    });
  });

  it("rejects JetSet when the claimed balance does not reconcile", () => {
    expect(() => reconcileJetSetRound({
      balanceBefore: 100,
      apiToken: 10,
      requestedType: 1,
      index: 1,
      data: {
        token: 91,
        location: [1, 2, 3, 4, 5],
        score: 0,
        winStateList: [],
        responseId: "test0008",
        slotType: 1,
        table: ["1,2,3,4,5", "1,2,3,4,5", "1,2,3,4,5"]
      }
    })).toThrowError(AppError);
  });

  it("rejects a provider result whose claimed balance does not reconcile", () => {
    expect(() => reconcileCoconutRound({
      balanceBefore: 1_028_027,
      apiToken: 1,
      wagerMultiplier: 12,
      data: { ...losingRound, token: 1_028_016 },
      index: 1
    })).toThrowError(AppError);
  });
});
