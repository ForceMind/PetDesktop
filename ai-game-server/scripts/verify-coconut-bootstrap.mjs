import "dotenv/config";

const accountId = required("GAME_TEST_ACCOUNT_ID");
const lobbyIg = required("GAME_LOBBY_IG");
const port = process.env.PORT || "8787";
const response = await fetch(`http://127.0.0.1:${port}/api/slot/bootstrap`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    language: "zh",
    launchParams: { userId: accountId, ig: lobbyIg }
  })
});
const payload = await response.json();
if (!response.ok) {
  throw new Error(payload?.error?.message || `Bootstrap returned HTTP ${response.status}.`);
}
const selected = (payload.games ?? [])
  .filter((game) => (
    game.id === "6001"
    || game.id === "6007"
    || game.id === "6014"
    || game.id === "6036"
    || game.id === "6037"
  ))
  .map(({ id, name, playable, minBet, maxBet, wagerMultiplier }) => ({
    id,
    name,
    playable,
    minBet,
    maxBet,
    wagerMultiplier
  }));
if (
  selected.length !== 5
  || selected.some((game) => game.playable !== true)
  || !payload.launchContext?.keys?.includes("userId")
) {
  throw new Error("Coconut bootstrap did not expose all verified games for the URL userId.");
}
const missingAccountResponse = await fetch(`http://127.0.0.1:${port}/api/slot/bootstrap`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    language: "zh",
    launchParams: { ig: lobbyIg }
  })
});
if (missingAccountResponse.status !== 503) {
  throw new Error(`Missing URL userId should return HTTP 503, got ${missingAccountResponse.status}.`);
}
process.stdout.write(`${JSON.stringify({
  status: response.status,
  missingUserIdStatus: missingAccountResponse.status,
  launchKeys: payload.launchContext.keys,
  selected,
  totalGames: payload.games.length
}, null, 2)}\n`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
