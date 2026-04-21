# Helius API Reference

## Authentication
- RPC: POST to `https://mainnet.helius-rpc.com/?api-key=HELIUS_API_KEY`
- Wallet API: GET/POST to `https://api.helius.xyz/v1/wallet/...?api-key=HELIUS_API_KEY` (or header `X-Api-Key`)
- Enhanced Transactions: POST to `https://api.helius.xyz/v0/transactions?api-key=HELIUS_API_KEY`
- Webhooks: `https://api-mainnet.helius-rpc.com/v0/webhooks` with `Authorization: Bearer HELIUS_API_KEY`
- WebSocket: `wss://mainnet.helius-rpc.com?api-key=HELIUS_API_KEY`
- Developer plan ($24.50/mo, was $49): RPC 50 req/sec, Wallet API / Enhanced APIs 10 req/sec, 10M credits/month, Standard + Enhanced WebSockets included, LaserStream Devnet only

---

## Credit Costs (verified from billing page)

### Standard RPC: 1 credit
getBalance, getAccountInfo, getSlot, getBlockHeight, getLatestBlockhash, etc.

### Historical Data RPC: 10 credits
getSignaturesForAddress, getTransaction, getBlock, getBlocks, getBlockTime, getInflationReward

### Helius-Enhanced RPC: 100 credits
getTransactionsForAddress (Developer plan+ only)

### Wallet API: 100 credits per call (all endpoints)
funded-by, identity, batch-identity, balances, transfers, history

### Enhanced Transactions API: 100 credits per call

### DAS API: 10 credits per call

### Webhooks: 1 credit per event received, 100 credits to create/edit/delete

### Data Streaming: 3 credits per 0.1 MB (Enhanced WebSockets, LaserStream)

### Budget Math (Developer plan: 10M credits/month)
- 10,000,000 getBalance calls, OR
- 1,000,000 getSignaturesForAddress calls, OR
- 100,000 Wallet API calls (funded-by, identity, etc.), OR
- 10,000,000 webhook events

---

## Wallet API (REST - api.helius.xyz) - 100 credits per call

### GET /v1/wallet/{address}/funded-by (100 credits, cacheable permanently)
Identifies who originally funded a wallet (first incoming SOL transfer).
Response: `{ funder, funderName, funderType, amount, amountRaw, decimals, date, signature, timestamp, slot, explorerUrl }`
- `funderType` examples: "Centralized Exchange", "DeFi", "Market Maker", "Trading App/Bot", "Scammer", etc.
- `funderName` examples: "Coinbase 1", "Binance 1", etc. Null if unknown.
- Returns 404 if wallet never received SOL.
- Only tracks FIRST SOL transfer. Not the ultimate source.
- Funding source never changes. ALWAYS cache result to avoid repeat 100-credit calls.

### GET /v1/wallet/{address}/identity (100 credits, cacheable)
Returns entity name/category for known wallets. 5100+ accounts, 1900+ programs.
Response: `{ address, type, name, category, tags }`
- Example: `{ name: "Binance 1", category: "Centralized Exchange", tags: ["Centralized Exchange"] }`
- Returns 404 if unknown wallet.
- Cache results aggressively. Identity changes infrequently.

### POST /v1/wallet/batch-identity (100 credits for up to 100 addresses)
Batch lookup up to 100 addresses in one request.
Body: `{ "addresses": ["addr1", "addr2", ...] }`
Unknown wallets omitted from results.
Most efficient way to identify wallets: 1 credit per address effectively vs 100 credits for individual lookups.

### GET /v1/wallet/{address}/transfers (100 credits)
All token transfers with direction and counterparty.
Params: `limit` (1-100, default 50), `cursor` (pagination)
Response: `{ data: [{ signature, timestamp, direction, counterparty, mint, symbol, amount, amountRaw, decimals }], pagination: { hasMore, nextCursor } }`
- `direction`: "in" (received) or "out" (sent), relative to queried wallet
- `counterparty`: sender (for "in") or recipient (for "out")
- Amounts are human-readable (1.5 = 1.5 SOL, not lamports)

### GET /v1/wallet/{address}/balances (100 credits)
All token + NFT balances with USD values, sorted by value descending.
Params: `page` (1-indexed), `limit` (1-100), `showZeroBalance` (false), `showNative` (true), `showNfts` (false)
Response: `{ balances: [{ mint, symbol, name, balance, decimals, pricePerToken, usdValue, logoUri, tokenProgram }], nfts: [...], totalUsdValue, pagination: { page, limit, hasMore } }`
- USD prices from DAS, update hourly, top 10k tokens only. May be null.
- Amounts are human-readable. No lamport conversion needed.
- Supports spl-token and token-2022.

### GET /v1/wallet/{address}/history (100 credits)
Complete parsed transaction history with balance changes per transaction.
Params: `limit` (1-100), `before` (signature cursor), `after` (signature), `type` (filter), `tokenAccounts` ("balanceChanged" recommended, "none", "all")
Response: `{ data: [{ signature, timestamp, slot, fee, feePayer, error, balanceChanges: [{ mint, amount, decimals }] }], pagination: { hasMore, nextCursor } }`
- Newest first by default.
- `type` filter values: SWAP, TRANSFER, TOKEN_MINT, NFT_SALE, NFT_MINT, BURN, and more.
- `tokenAccounts=balanceChanged` filters spam (recommended).
- Balance changes: positive = received, negative = sent. Human-readable amounts.

### Identity Categories (complete list)
Centralized Exchange, Cross-chain Bridge, DeFi, Key Opinion Leader, Market Maker, Trading Firm, Validator, Treasury, DAO, NFT, Stake Pool, Multisig, Oracle, Game, Payments, Tools, Airdrop, Governance, Authority, Jito, Memecoin, Casino & Gambling, DePIN, Proprietary AMM, Restaking, Vault, Fees, Fundraise, Genesis Block Distribution, Non-Circulating Supply, Transaction Sending, System, X402, Other.
Malicious: Exploiter/Hackers & Scams, Hacker, Rugger, Scammer, Spam.

---

## Solana RPC (JSON-RPC - mainnet.helius-rpc.com)

All calls: POST `{ "jsonrpc": "2.0", "id": 1, "method": "...", "params": [...] }`

### getBalance (1 credit)
Params: `[address]`
Returns SOL in lamports (divide by 1e9). Cheapest way to check a wallet's SOL balance.

### getSignaturesForAddress (10 credits)
Params: `[address, { limit: number }]`
Max 1000. Returns signatures with blockTime. Use for freshness checks, but note 10x cost vs getBalance.

### getTransaction (10 credits)
Params: `[signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]`
Full parsed tx with meta (pre/postBalances, pre/postTokenBalances, logMessages).

### getTokenAccountsByOwner (1 credit)
Params: `[owner, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]`
All SPL token accounts. Use to check if wallet holds any tokens.

### getTransactionsForAddress (100 credits, Helius-enhanced, Developer+ only)
POST to: `https://api.helius.xyz/v0/addresses/{address}/transactions?api-key=KEY`
Better than getSignaturesForAddress: includes token account transfers.
Params: `type` (optional), `before` (signature cursor), `limit` (max 100)
Returns 100 full transactions or 1,000 signatures per call.

---

## Enhanced Transactions API (100 credits per call)

POST `https://api.helius.xyz/v0/transactions?api-key=KEY`
Body: `{ "transactions": ["sig1", "sig2", ...] }` (max 100)
Returns parsed data: type (TRANSFER, SWAP, TOKEN_MINT), source (SYSTEM_PROGRAM, PUMP_FUN), description, tokenTransfers.

---

## Webhooks (available on Developer plan)

### Create: POST https://api-mainnet.helius-rpc.com/v0/webhooks (100 credits)
Headers: `Authorization: Bearer KEY`, `Content-Type: application/json`
Body: `{ "webhookURL": "https://...", "transactionTypes": ["Any"], "accountAddresses": ["addr1", ...], "webhookType": "raw" }`
Types: "raw" (fastest), "enhanced" (parsed), "discord"
Events: 1 credit per event received. Management: 100 credits to create/edit/delete.

### List: GET /v0/webhooks
### Update: PUT /v0/webhooks/{id} (100 credits)
### Delete: DELETE /v0/webhooks/{id} (100 credits)

---

## Standard WebSockets (available on Developer plan)

Connect: `wss://mainnet.helius-rpc.com?api-key=KEY`

### accountSubscribe
`{ "jsonrpc":"2.0", "id":1, "method":"accountSubscribe", "params":["ADDRESS", { "encoding":"jsonParsed", "commitment":"confirmed" }] }`
Notifies on any account data change.

### logsSubscribe
`{ "jsonrpc":"2.0", "id":1, "method":"logsSubscribe", "params":[{ "mentions":["ADDRESS"] }, { "commitment":"confirmed" }] }`
Notifies on transaction logs mentioning address.

### Keep-alive: ping every 30s. Implement reconnection with backoff.

---

## Enhanced WebSockets (Included on Developer plan and above)

Connect: `wss://atlas-mainnet.helius-rpc.com/?api-key=KEY`

### transactionSubscribe
`{ "jsonrpc":"2.0", "id":1, "method":"transactionSubscribe", "params":[{ "accountInclude":["addr1","addr2"], "vote":false, "failed":false }, { "commitment":"confirmed", "encoding":"jsonParsed", "transactionDetails":"full", "maxSupportedTransactionVersion":0 }] }`
Up to 50,000 addresses in accountInclude filter. 3 credits per 0.1 MB. Returns full parsed transaction payloads on each event — no follow-up `getTransaction` call needed.

**Payload shape (empirically confirmed 2026-04-17 against `wss://atlas-mainnet.helius-rpc.com`):**
- Subscription confirmation: `{jsonrpc:"2.0", id:<our req id>, result:<subscription_id:number>}`
- Live notifications: `{jsonrpc:"2.0", method:"transactionNotification", params:{subscription:<id>, result:{signature, slot, transaction}}}`
- `signature` and `slot` live at `params.result` level, NOT nested inside `transaction`. Notification parsing must reach for `params.result.signature`, not `params.result.transaction.signature`.

---

## LaserStream gRPC (Devnet on Developer, Devnet+Mainnet on Business+)

Higher-throughput streaming alternative to Enhanced WebSockets. 3 credits per 0.1 MB. Developer plan is Devnet only — for mainnet streaming on Developer, use Enhanced WebSockets `transactionSubscribe`.

---

## Cost Strategy
- Bulk screening: getBalance at 1 credit is the cheapest check. Use it first.
- Freshness check: getSignaturesForAddress at 10 credits. Only call after getBalance confirms amount is in range.
- Entity identification: batch-identity at 100 credits for 100 addresses (effectively 1 credit/addr). Most efficient.
- Funding source: funded-by at 100 credits. Cache permanently since it never changes.
- Deep investigation: Wallet API history/transfers/balances at 100 credits each. Use only on confirmed targets.
- Real-time monitoring: Standard WebSockets (included) or Webhooks (1 credit/event).
- Avoid: calling funded-by or identity on every candidate without caching. 100 credits adds up fast.
