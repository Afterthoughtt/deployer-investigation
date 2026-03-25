# Nansen API Documentation

## Quick Reference
- **Base URL:** `https://api.nansen.ai/api/v1`
- **Method:** All endpoints use `POST`
- **Auth Header:** `apiKey: YOUR_API_KEY`
- **Get API Key:** https://app.nansen.ai/api

## Rate Limits & Pricing
| Metric | Value |
|--------|-------|
| Rate Limit | 20 req/sec, 500 req/min (currently 300/min during incident) |
| Exceeded Response | 429 Too Many Requests |
| Free Plan | 100 one-time credits, limited endpoints |
| Pro Plan | $49/mo annual, $69/mo monthly, 1000 starter credits |

### Credit Costs by Endpoint Type
- **1 credit:** Most profiler endpoints, token screener, basic TGM endpoints
- **5 credits:** All Smart Money endpoints, counterparties, holders, leaderboards
- **500 credits:** Label lookups

---

## Supported Chains
```
arbitrum, avalanche, base, bitcoin, bnb, ethereum, hyperevm, iotaevm, 
linea, mantle, monad, optimism, plasma, polygon, ronin, scroll, sei, 
solana, sonic, starknet, ton, tron, unichain, zksync
```

---

## Smart Money API
**Purpose:** Track the top 5,000 highest-performing wallets ranked by realized profit, winrate, and performance across market cycles.

**Smart Money Labels:** `30D Smart Trader`, `90D Smart Trader`, `180D Smart Trader`, `Fund`, `Smart Trader`

### POST /smart-money/netflow (5 credits)
**Use Case:** Identify which tokens smart money is accumulating or distributing by analyzing net capital flows (inflows vs outflows) across different time periods.

**When to use:** Token discovery, identifying accumulation trends, spotting distribution before price drops.

**Key Parameters:**
- `chains`: Array of chains or `"all"`
- `filters.include_smart_money_labels`: Filter by trader type
- `filters.include_stablecoins`, `filters.include_native_tokens`: Boolean toggles
- `order_by`: Sort by `net_flow_1h_usd`, `net_flow_24h_usd`, `net_flow_7d_usd`, `net_flow_30d_usd`

**Response Fields:** `token_address`, `token_symbol`, `net_flow_1h/24h/7d/30d_usd`, `chain`, `trader_count`, `market_cap_usd`, `token_sectors`

---

### POST /smart-money/holdings (5 credits)
**Use Case:** Discover what tokens top traders and funds are currently holding, with 24h balance change tracking.

**When to use:** Follow institutional investment trends, identify trending tokens, portfolio analysis.

**Key Parameters:**
- `chains`: Array of chains
- `filters.value_usd`: Min/max USD value filter
- `filters.balance_24h_percent_change`: Track accumulation rate
- `filters.token_age_days`: Find new token positions

**Response Fields:** `chain`, `token_address`, `token_symbol`, `value_usd`, `balance_24h_percent_change`, `holders_count`, `share_of_holdings_percent`, `market_cap_usd`

---

### POST /smart-money/historical-holdings (5 credits)
**Use Case:** Track how smart money rotates between assets over time for trend analysis, backtesting, and performance attribution.

**When to use:** Historical analysis, strategy backtesting, identifying rotation patterns.

**Key Parameters:**
- `date_range`: `{from: "YYYY-MM-DD", to: "YYYY-MM-DD"}` (max 4 year lookback)
- `chains`: Supports `ethereum`, `base`, `bnb`, `monad`, `solana`

**Response Fields:** Same as holdings plus `date`, `smart_money_labels`

---

### POST /smart-money/dex-trades (5 credits)
**Use Case:** Access real-time DEX trading activity from smart traders over the last 24 hours - see exactly what they're buying and selling.

**When to use:** Real-time trade alerts, copy trading signals, market sentiment.

**Key Parameters:**
- `chains`: Array of chains
- `filters.trade_value_usd`: Min/max trade size
- `filters.token_bought_age_days`: Filter by token age

**Response Fields:** `trader_address`, `trader_address_label`, `token_bought/sold_address`, `token_bought/sold_symbol`, `token_bought/sold_amount`, `trade_value_usd`, `block_timestamp`, `transaction_hash`

---

### POST /smart-money/perp-trades (5 credits)
**Use Case:** Track what smart money wallets are trading on Hyperliquid perpetuals.

**When to use:** Perp copy trading, understanding smart money leverage positions.

**Key Parameters:**
- No chain field needed (Hyperliquid only)
- `filters.action`: `Buy - Add Long`, etc.
- `filters.side`: `Long` or `Short`
- `filters.token_symbol`: e.g., `"BTC"`
- `only_new_positions`: Boolean to filter only position opens

**Response Fields:** `trader_address`, `trader_address_label`, `token_symbol`, `side`, `action`, `token_amount`, `price_usd`, `value_usd`, `type` (Market/Limit), `block_timestamp`

---

### POST /smart-money/dcas (5 credits)
**Use Case:** Monitor DCA (Dollar Cost Average) strategies used by smart money on Solana via Jupiter.

**When to use:** Identify systematic accumulation strategies, find tokens being DCA'd into.

**Key Parameters:**
- Solana only (no chain parameter needed)
- `filters.include/exclude_smart_money_labels`

**Response Fields:** `trader_address`, `dca_vault_address`, `input/output_token_address`, `deposit_token_amount`, `token_spent_amount`, `dca_status`, `deposit_value_usd`

---

## Profiler API
**Purpose:** Deep dive into any wallet or entity - analyze balances, transactions, PnL, and relationships.

### POST /profiler/address/current-balance (1 credit)
**Use Case:** Get real-time token holdings for any address or entity across chains.

**When to use:** Portfolio tracking, checking exchange holdings, wallet analysis.

**Key Parameters:**
- `address` OR `entity_name` (use `/search/entity-name` to find exact names)
- `chain`: Single chain or `"all"`
- `hide_spam_token`: Boolean (default true)
- `filters.token_symbol`, `filters.value_usd`

**Response Fields:** `chain`, `address`, `token_address`, `token_symbol`, `token_name`, `token_amount`, `price_usd`, `value_usd`

---

### POST /profiler/address/historical-balances (1 credit)
**Use Case:** Track balance changes over time to analyze holding patterns and portfolio evolution.

**When to use:** Performance tracking, identifying accumulation/distribution patterns.

**Key Parameters:**
- `address` OR `entity_name`
- `chain`
- `date`: `{from: "ISO8601", to: "ISO8601"}`
- `filters.hide_spam_tokens`, `filters.token_symbol`

**Response Fields:** `block_timestamp`, `token_address`, `chain`, `token_amount`, `value_usd`, `token_symbol`

---

### POST /profiler/address/transactions (1 credit)
**Use Case:** Get recent blockchain transactions including token transfers, native currency movements, and contract interactions.

**When to use:** Transaction monitoring, activity analysis, audit trails.

**Key Parameters:**
- `address` (required, not entity_name)
- `chain`
- `date`: Required date range
- `filters.volume_usd`

**Response Fields:** `chain`, `method`, `tokens_sent[]`, `tokens_received[]`, `volume_usd`, `block_timestamp`, `transaction_hash`, `source_type`

---

### POST /profiler/address/counterparties (5 credits)
**Use Case:** Identify top addresses/entities a wallet has interacted with - find funding sources, exchange patterns, and relationships.

**When to use:** Wallet clustering, identifying related wallets, exchange flow analysis.

**Key Parameters:**
- `address` OR `entity_name`
- `chain`
- `date`: Required date range
- `group_by`: `"wallet"` or `"entity"`
- `source_input`: `"Combined"`, `"Tokens"`, or `"ETH"`

**Response Fields:** `counterparty_address`, `counterparty_address_label`, `interaction_count`, `total_volume_usd`, `volume_in_usd`, `volume_out_usd`, `tokens_info[]`

---

### POST /profiler/address/related-wallets (1 credit)
**Use Case:** Find wallets connected through funding, signing, contract deployment, or multisig relationships.

**When to use:** Wallet clustering, identifying sybil networks, tracing funds.

**Key Parameters:**
- `address` (required)
- `chain`

**Response Fields:** `address`, `address_label`, `relation`, `transaction_hash`, `block_timestamp`, `order`, `chain`

---

### POST /profiler/address/pnl-summary (1 credit)
**Use Case:** Get aggregate PnL statistics including win rate and top 5 most profitable tokens for a wallet.

**When to use:** Evaluating trader quality for copy trading, performance assessment.

**Key Parameters:**
- `address` OR `entity_name`
- `chain`
- `date`: Required date range

**Response Fields:** `realized_pnl_usd`, `realized_pnl_percent`, `win_rate`, `traded_token_count`, `traded_times`, `top5_tokens[]`

---

### POST /profiler/address/pnl (1 credit)
**Use Case:** Get detailed per-token PnL including realized/unrealized gains, buy/sell history, and ROI.

**When to use:** Detailed trade analysis, position tracking.

**Key Parameters:**
- `address` OR `entity_name`
- `chain`
- `date`: Optional date range
- `filters.show_realized`: Boolean to toggle realized vs unrealized focus

**Response Fields:** `token_address`, `token_symbol`, `roi_percent_realised/unrealised`, `pnl_usd_realised/unrealised`, `bought_amount/usd`, `sold_amount/usd`, `holding_amount/usd`, `nof_buys`, `nof_sells`

---

### POST /profiler/address/labels (500 credits)
**Use Case:** Get all entity and behavioral labels for an address (smart money status, exchange associations, behavioral patterns).

**When to use:** Identifying wallet ownership, smart money classification.

**Key Parameters:**
- `chain`
- `address`

**Label Categories:** `behavioral`, `defi`, `social`, `smart_money`, `others`

**Response Fields:** `label`, `category`, `definition`, `smEarnedDate`, `fullname`

---

### POST /search/entity-name (0 credits - FREE)
**Use Case:** Search for exact entity names to use in other profiler endpoints.

**When to use:** Before querying by entity_name to get the correct format.

**Key Parameters:**
- `search_query`: Min 2 characters, case-insensitive

**Response:** Array of `{entity_name: "string"}`

---

### POST /profiler/perp-positions (1 credit)
**Use Case:** Get real-time Hyperliquid perpetual positions for a wallet including PnL, leverage, and liquidation prices.

**When to use:** Monitoring trader positions, risk assessment.

**Key Parameters:**
- `address`: 42-character hex address
- `filters.position_value_usd`, `filters.unrealized_pnl_usd`

**Response Fields:** `asset_positions[]` with `token_symbol`, `size`, `entry_price_usd`, `mark_price_usd`, `unrealized_pnl_usd`, `leverage_value`, `liquidation_price_usd`, `margin_used_usd`

---

### POST /profiler/perp-trades (1 credit)
**Use Case:** Get Hyperliquid trade history for a wallet with entry/exit prices, fees, and PnL.

**When to use:** Trade-by-trade analysis, copy trading verification.

**Key Parameters:**
- `address`: 42-character hex
- `date`: Required `{from, to}`
- `filters.size`

**Response Fields:** `timestamp`, `token_symbol`, `side`, `action` (Open/Add/Close/Reduce), `price`, `size`, `value_usd`, `closed_pnl`, `fee_usd`

---

### POST /perp-leaderboard (5 credits)
**Use Case:** Find the most profitable Hyperliquid traders over a given period.

**When to use:** Discovering wallets to copy trade, market research.

**Key Parameters:**
- `date`: `{from: "YYYY-MM-DD", to: "YYYY-MM-DD"}`
- `filters.total_pnl`, `filters.account_value`, `filters.roi`

**Response Fields:** `trader_address`, `trader_address_label`, `total_pnl`, `roi`, `account_value`

---

## Token God Mode (TGM) API
**Purpose:** Comprehensive analytics for any token - holders, flows, trades, and smart money activity.

### POST /token-screener (1 credit)
**Use Case:** Discover and screen tokens across multiple chains with advanced filtering for market cap, volume, age, and smart money activity.

**When to use:** Token discovery, finding trending tokens, new launch monitoring.

**Data Retention:** 5m-1h (last 2 hours), 6h-24h (last 2 days), 7d-30d (last 2 months)

**Key Parameters:**
- `chains`: Array (max 5)
- `timeframe`: `5m`, `10m`, `1h`, `6h`, `24h`, `7d`, `30d` (recommended)
- `filters.only_smart_money`, `filters.token_age_days`, `filters.market_cap_usd`, `filters.liquidity`

**Response Fields:** `chain`, `token_address`, `token_symbol`, `market_cap_usd`, `liquidity`, `price_usd`, `price_change`, `buy_volume`, `sell_volume`, `volume`, `netflow`, `token_age_days`

---

### POST /tgm/flow-intelligence (1 credit)
**Use Case:** Get a summary of token flows broken down by holder segment (Smart Money, Whales, Exchanges, Public Figures, Fresh Wallets).

**When to use:** Quick snapshot of who's accumulating/distributing a token.

**Key Parameters:**
- `chain`
- `token_address`
- `timeframe`: `5m`, `1h`, `6h`, `12h`, `1d`, `7d`

**Response Fields:** `smart_trader_net_flow_usd`, `whale_net_flow_usd`, `exchange_net_flow_usd`, `public_figure_net_flow_usd`, `fresh_wallets_net_flow_usd`, plus `_avg_flow_usd` and `_wallet_count` for each

---

### POST /tgm/holders (5 credits)
**Use Case:** Get top token holders with balances, types (whale/smart money/exchange), and balance changes.

**When to use:** Token distribution analysis, identifying major stakeholders, governance research.

**Key Parameters:**
- `chain`
- `token_address`
- `label_type`: `all_holders`, `smart_money`, `whale`, `exchange`, `public_figure`
- `aggregate_by_entity`: Boolean
- `filters.include_smart_money_labels`, `filters.ownership_percentage`, `filters.value_usd`

**Response Fields:** `address`, `address_label`, `token_amount`, `value_usd`, `ownership_percentage`, `balance_change_24h/7d/30d`, `total_inflow`, `total_outflow`

---

### POST /tgm/flows (1 credit)
**Use Case:** Track hourly/daily aggregated token flows for specific holder segments over time.

**When to use:** Trend analysis, identifying accumulation patterns over time.

**Key Parameters:**
- `chain`
- `token_address`
- `date`: Required `{from, to}`
- `label`: `top_100_holders`, `smart_money`, `whale`, `exchange`, `public_figure`

**Response Fields:** `date`, `price_usd`, `token_amount`, `value_usd`, `holders_count`, `total_inflows_count`, `total_outflows_count`

---

### POST /tgm/who-bought-sold (1 credit)
**Use Case:** Get aggregated buy/sell volumes by address for a token - identify net buyers vs sellers.

**When to use:** Finding major accumulators or distributors.

**Key Parameters:**
- `chain`
- `token_address`
- `buy_or_sell`: `"BUY"` or `"SELL"`
- `date`: Required date range
- `filters.include_smart_money_labels`, `filters.trade_volume_usd`

**Response Fields:** `address`, `address_label`, `bought_volume_usd`, `sold_volume_usd`, `trade_volume_usd`, `bought_token_volume`, `sold_token_volume`

---

### POST /tgm/dex-trades (1 credit)
**Use Case:** Get individual DEX trades for a specific token with trader details.

**When to use:** Trade-level analysis, identifying specific buyers/sellers.

**Key Parameters:**
- `chain`
- `token_address`
- `date`: Required date range
- `only_smart_money`: Boolean
- `filters.action`: `"BUY"` or `"SELL"`
- `filters.estimated_value_usd`

**Response Fields:** `block_timestamp`, `transaction_hash`, `trader_address`, `trader_address_label`, `action`, `token_amount`, `estimated_value_usd`, `estimated_swap_price_usd`

---

### POST /tgm/transfers (1 credit)
**Use Case:** Track all token transfers including DEX trades, CEX deposits/withdrawals.

**When to use:** Exchange flow monitoring, identifying large transfers.

**Key Parameters:**
- `chain`
- `token_address`
- `date`: Required (max 1 year range)
- `filters.include_cex`, `filters.include_dex`, `filters.non_exchange_transfers`, `filters.only_smart_money`

**Response Fields:** `block_timestamp`, `transaction_hash`, `from/to_address`, `from/to_address_label`, `transaction_type`, `transfer_amount`, `transfer_value_usd`

---

### POST /tgm/jup-dca (1 credit)
**Use Case:** Get Jupiter DCA orders for a specific token on Solana.

**When to use:** Finding systematic accumulation into a token.

**Key Parameters:**
- `token_address` (Solana only)
- `filters.status`: `"Active"`, `"Closed"`
- `filters.deposit_usd_value`

**Response Fields:** `trader_address`, `dca_vault_address`, `input/output_token`, `deposit_amount`, `deposit_spent`, `status`, `deposit_usd_value`

---

### POST /tgm/pnl-leaderboard (5 credits)
**Use Case:** Rank traders by PnL performance for a specific token - find the best traders of any token.

**When to use:** Identifying successful traders to follow, performance analysis.

**Key Parameters:**
- `chain`
- `token_address`
- `date`: Required date range
- `filters.pnl_usd_realised`, `filters.holding_usd`

**Response Fields:** `trader_address`, `trader_address_label`, `pnl_usd_realised/unrealised`, `roi_percent_realised/unrealised`, `holding_amount/usd`, `nof_trades`, `netflow_amount_usd`

---

### POST /perp-screener (1 credit)
**Use Case:** Screen Hyperliquid perpetual contracts by volume, open interest, funding rates, and smart money activity.

**When to use:** Finding trending perps, market discovery.

**Key Parameters:**
- `date`: Required date range
- `filters.token_symbol`, `filters.volume`

**Response Fields:** `token_symbol`, `volume`, `buy_volume`, `sell_volume`, `buy_sell_pressure`, `open_interest`, `funding`, `mark_price`, `trader_count`

---

### POST /tgm/perp-pnl-leaderboard (5 credits)
**Use Case:** Rank traders by PnL for a specific perpetual contract on Hyperliquid.

**When to use:** Finding best perp traders for a specific token.

**Key Parameters:**
- `token_symbol`: e.g., `"BTC"` (NOT address)
- `date`: Required date range
- `filters.pnl_usd_realised`, `filters.position_value_usd`

**Response Fields:** Same as tgm/pnl-leaderboard

---

### POST /tgm/perp-positions (5 credits)
**Use Case:** Get all current perpetual positions for a specific token on Hyperliquid.

**When to use:** Seeing who's long/short on a token, position concentration.

**Key Parameters:**
- `token_symbol`: e.g., `"BTC"`
- `label_type`: `all_traders`, `smart_money`, `whale`, `public_figure`
- `filters.side`: `["Long"]` or `["Short"]`
- `filters.position_value_usd`, `filters.upnl_usd`

**Response Fields:** `address`, `address_label`, `side`, `position_value_usd`, `position_size`, `leverage`, `entry_price`, `mark_price`, `liquidation_price`, `upnl_usd`

---

### POST /tgm/perp-trades (1 credit)
**Use Case:** Get all perpetual trades for a specific token on Hyperliquid.

**When to use:** Trade-level perp analysis for a token.

**Key Parameters:**
- `token_symbol`
- `date`: Required date range
- `filters.side`, `filters.order_type` (`["MARKET"]`, `["LIMIT"]`)

**Response Fields:** `trader_address`, `trader_address_label`, `token_symbol`, `side`, `action`, `token_amount`, `price_usd`, `value_usd`, `type`, `block_timestamp`

---

## Portfolio API

### POST /portfolio/defi-holdings (1 credit)
**Use Case:** Get a wallet's DeFi positions across protocols (lending, staking, LPs, farming).

**When to use:** Complete portfolio overview, DeFi position tracking.

**Key Parameters:**
- `wallet_address`

**Response Fields:** `summary` (total values, counts), `protocols[]` with `protocol_name`, `chain`, `total_value_usd`, `tokens[]`

---

## Transaction Lookup

### POST /transaction-with-token-transfer-lookup (1 credit)
**Use Case:** Get comprehensive transaction details including all token and NFT transfers.

**When to use:** Transaction investigation, detailed transfer analysis.

**Key Parameters:**
- `chain`
- `transaction_hash`
- `block_timestamp`: Required

**Response Fields:** `chain`, `transaction_hash`, `from/to_address`, `native_value`, `token_transfer_array[]`, `nft_transfer_array[]`

---

## Points API (Public - No Auth)

### GET /api/points-leaderboard
**Use Case:** Fetch Nansen Points leaderboard for permissionless rewards.

**URL:** `https://app.nansen.ai/api/points-leaderboard`

**Query Params:** `tier` (green/ice/north/star), `isEligible` (true/false)

---

## Common Request Patterns

### Standard Request Structure
```json
{
  "chains": ["ethereum", "solana"],
  "pagination": {"page": 1, "per_page": 10},
  "filters": {
    "value_usd": {"min": 1000, "max": 100000},
    "token_age_days": {"min": 1, "max": 30},
    "include_smart_money_labels": ["Fund", "30D Smart Trader"],
    "include_stablecoins": false,
    "include_native_tokens": false
  },
  "order_by": [{"field": "value_usd", "direction": "DESC"}]
}
```

### Date Formats
- ISO 8601: `"2025-01-01T00:00:00Z"`
- Date only: `"2025-01-01"`

### Error Codes
| Code | Meaning |
|------|---------|
| 400 | Bad Request - check syntax/parameters |
| 401 | Unauthorized - invalid API key |
| 403 | Forbidden - no permission for resource |
| 404 | Not Found - wrong endpoint/resource |
| 422 | Unprocessable - invalid parameter values |
| 429 | Rate Limited - slow down |
| 500/504 | Server Error - retry later |

---

## Free Tier Endpoints
Available without Pro subscription:
- `/profiler/address/transactions`
- `/profiler/address/current-balance`
- `/profiler/address/historical-balances`
- `/profiler/address/counterparties`
- `/profiler/address/related-wallets`
- `/tgm/flows`
- `/tgm/who-bought-sold`
- `/tgm/dex-trades`
- `/tgm/transfers`
- `/tgm/holders`
- `/portfolio/defi-holdings`
- `/token-screener`

---

## Nansen MCP (AI Integration)
Connect AI tools (Claude, Cursor) to Nansen data via Model Context Protocol.

**Server:** `https://mcp.nansen.ai/ra/mcp`
**Header:** `NANSEN-API-KEY: your_key`

### Claude Code Setup
```bash
claude mcp add --transport http nansen https://mcp.nansen.ai/ra/mcp --header "NANSEN-API-KEY: YOUR_KEY"
```

### MCP-Only Tools
- `general_search`: Free lookup for tokens, entities, addresses
- `token_ohlcv`: OHLCV price data
- `growth_chain_rank`: Chain growth rankings
- `transaction_lookup`: EVM transaction details

---

## Hyperliquid-Specific Notes
1. **Use `token_symbol` not `token_address`** for perp endpoints (e.g., `"BTC"` not an address)
2. No `chain` parameter needed - Hyperliquid is implied
3. Negative `size` = Short position, Positive = Long
4. Actions: `Open`, `Add`, `Close`, `Reduce`