# Nansen Pulse

**Discover a signal. Inspect the evidence. Track what changes.**

Nansen Pulse is a desktop-first token research app powered by the Nansen API. It connects market activity with labelled wallet-group flows, then lets you save a group-flow hypothesis and compare later evidence with the original baseline.

Instead of bookmarking a ticker alone, keep the reason you wanted to watch it.

Built for the Nansen Meridian Buildathon. This README describes version 5.22.

## Run locally

Allow approximately 5–10 minutes with Node.js and a funded Nansen API account ready. No package installation, database or build step is required.

**Prerequisites**

- Node.js **22 or newer**: [download Node.js](https://nodejs.org/).
- A Nansen API key with access to the endpoints below and available credits: [Nansen API account](https://app.nansen.ai/api).
- Internet access and a desktop browser. Port **3000** must be available.

**Start**

1. Download this repository using **Code → Download ZIP**, then extract it. Open the folder containing `server.js`.
2. On Windows, double-click `Start.cmd`. Alternatively, on Windows, macOS or Linux, open a terminal in that folder and run:

   ```sh
   node server.js
   ```

3. Enter your Nansen API key at the terminal prompt. Input is hidden in supported interactive terminals. Do not put the key into source files or browser fields.
4. Open **http://localhost:3000** if the browser does not open automatically.
5. Wait for the initial token inventory to load. A token card, wallet planets and the data timestamp confirm the app is ready.

Keep the terminal open while using Pulse. Press **Ctrl+C** there to stop. The key stays in server memory; enter it again after restarting. Watchlist entries remain in this browser's local storage.

This is a local application. The server is not prepared as an authenticated, public multi-user deployment.

## Try the research loop

1. **Discover:** For You explores tokens outside the app's large-cap/major classification. Search finds loaded symbols or resolves a contract address on a selected chain. Large Cap is a separate view.
2. **Read:** inspect the headline, its available evidence and the selected wallet group. Planet size represents relative net-flow magnitude, not influence on price.
3. **Investigate:** open **Explore evidence & timeframes**. Compare eligible 1H, 6H, 1D and 7D windows. Missing observations stay distinct from reported zero activity.
4. **Track:** select a wallet group and review **Idea to track**, including its weakening conditions. **Track this idea** saves a baseline when fresh, meaningful evidence is available; otherwise it saves the token without inventing one.
5. **Revisit:** open **Watchlist → Check what changed**. Compare the original baseline with a later retrieval for the same group and rolling window.

Existing baselines are preserved when a saved token is revisited. **Research more at Nansen** opens the selected token and chain for further investigation.

**Signals** offers an optional, bounded scan for price/flow divergence or opposing Smart Trader and Top PnL flows. It scans six candidates per click, up to a volume-selected sample of 60. No matching result is a valid outcome.

**Sort** ranks the feed using 1H volume, signed net inflow, net outflow, or token age. The token analysis timeframe is independent of feed ranking.

## How Nansen data drives the app

| Source | Role in Pulse |
| --- | --- |
| Token Screener | Candidate inventory, market activity, prices and timeframe snapshots |
| Token Information | Selected-period buyer/seller participation |
| Flow Intelligence | Labelled group net flows and available wallet counts |

Wallet Lens interprets matching market and flow observations. A prominent flow meets a threshold of **max($1,000, 0.1% of the window's volume)**. A price/flow divergence requires a price change of at least 1% and a meaningful flow in the opposing direction. Opposing Smart Trader and Top PnL flows can produce a disagreement reading.

These are explicit Pulse rules, not Nansen ratings or forecasts. Signals requires matching recent market evidence; missing or incompatible data does not become a positive signal.

## What a saved hypothesis means

The current hypothesis tracks whether a selected group's net-flow direction persists. It does **not** track the entire price/flow headline or a user's free-text investment thesis.

The baseline records group, timeframe, net flow, available wallet count, price change, timestamps and the original threshold. Follow-up checks leave that baseline unchanged.

| Result | Meaning |
| --- | --- |
| Not checked yet | No follow-up has been requested |
| No newer observation | The retrieved observation has not advanced beyond the baseline |
| No evidence change | Net flow and wallet count match the baseline despite a newer retrieval time; upstream caching is possible |
| Still supported | Flow remains in the same direction and has not met the weakening rule |
| Weakening | Magnitude falls below the original threshold or below half the baseline magnitude |
| Contradicted | Opposite-direction flow meets the original threshold |
| Insufficient data | Matching, recent evidence is unavailable |

Checks are manual. There are no background alerts. Rolling windows may overlap; observations do not identify an unchanged set of individual wallets.

## Data and cost boundaries

- Initial inventory loading can request up to two Screener pages on each of seven supported chains.
- Token and timeframe exploration loads additional data on demand and reuses caches. A new market window can require Screener and Token Information requests, plus a flow request for wallet evidence.
- A six-token Signals batch can require up to 18 upstream requests before cache savings. Four-window flow comparison can require up to four flow requests.
- Typing a name or symbol in Search uses loaded data. Submitting an exact contract lookup can consume API calls.
- API calls and credits are different units. Check your account for actual consumption; the app's counter is not campaign eligibility evidence.
- Nansen may cache upstream observations. A retrieval timestamp is not a transaction timestamp.

## Limitations

- Transfers and net flows do not establish buys, sells or expected returns.
- Wallet cohorts may overlap. Their counts are not total token holders and must not be added as independent people.
- Unknown values are not zero. A reported zero does not establish that no large holders exist.
- Market Risk Check is a rule-based assessment of available market conditions, not a smart-contract audit or generative AI assessment.
- Search by name/symbol covers the loaded inventory; contract lookup depends on Nansen coverage.
- Watchlists are browser-local, without accounts or cross-device sync. Clearing browser storage removes them.
- Signals does not scan the whole market. Large-cap classification is an application filter, not verified asset identity.
- No trading execution, automatic monitoring or public hosted service is included.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `node` is not recognized | Install Node.js 22+, then open a new terminal |
| Port 3000 is occupied | Close the older server before starting this version; the launcher does not stop it for you |
| Authentication or credit error | Check your API key, endpoint access and balance in your Nansen account, then restart if you need to enter a different key |
| Empty search | Select the correct chain and try the exact contract address; coverage is not guaranteed |
| Disabled timeframe | The token is too young for that window |
| No baseline saved | Wait for matching recent market/flow evidence and select a group above the meaningful-flow threshold |
| No new evidence | Return later; repeatedly clicking does not force new upstream observations |

## Verification

From the application folder:

```sh
node qa-tests.cjs
node wallet-lens-tests.cjs
node timeframe-tests.cjs
node signals-tests.cjs
node orbit-tests.cjs
node thesis-tests.cjs
node search-tests.cjs
```

These tests use fixtures and mocks, not paid Nansen calls. They cover missing/zero values, formatting, timeframe isolation, search, sorting, bounded scans and hypothesis comparisons. All seven suites passed during local development; live browser checks additionally exercised save/check behavior and repeated cached observations. This is not a guarantee of error-free operation or a completed clean-machine installation test.

## Project structure

```text
server.js                 Local API proxy, normalization and caches
launcher.js / Start.cmd   Startup helpers
public/index.html         Desktop interface and interaction logic
public/wallet-lens.js      Evidence interpretation rules
public/thesis.js           Baseline capture and comparison rules
*-tests.cjs                Local verification suites
```

Data powered by [Nansen API](https://docs.nansen.ai/). Pulse's interpretations are provided for research, not trading instructions.

## Online demo and deployment

Try https://nansen-pulse.vercel.app/ . The shared demo has a 300-call daily Nansen limit. See HOSTING.md for the Vercel variant; local startup instructions above use your own key.
