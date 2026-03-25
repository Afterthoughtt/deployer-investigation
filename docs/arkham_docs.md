# Arkham Intel API v1.1.0

> Production-grade blockchain intelligence API. Entity attribution, address labels, transfer tracking, and on-chain analytics across 20+ chains.

- Base URL: `https://api.arkm.com`
- API Docs: https://intel.arkm.com/api/docs
- OpenAPI Spec: https://intel.arkm.com/openapi.json
- Full docs (single file): https://intel.arkm.com/llms-full.txt
- Schemas: https://intel.arkm.com/llms/schemas/
- Endpoint doc pattern: https://intel.arkm.com/llms/<method>-<path>.md (e.g. `POST /intelligence/address/batch/all` → https://intel.arkm.com/llms/post-intelligence-address-batch-all.md)

## API Guide

- [Overview](https://intel.arkm.com/llms/guides/overview.md): Overview guide
- [Design Principles](https://intel.arkm.com/llms/guides/design-principles.md): Design Principles guide
- [Who This API Is For](https://intel.arkm.com/llms/guides/who-this-api-is-for.md): Who This API Is For guide
- [Getting Access](https://intel.arkm.com/llms/guides/getting-access.md): Getting Access guide
- [API Keys & Authentication](https://intel.arkm.com/llms/guides/api-keys-authentication.md): API Keys & Authentication guide
- [Addresses, Entities, Labels](https://intel.arkm.com/llms/guides/addresses-entities-labels.md): Addresses, Entities, Labels guide
- [How Arkham Labels Wallets](https://intel.arkm.com/llms/guides/how-arkham-labels-wallets.md): How Arkham Labels Wallets guide
- [Rate Limits](https://intel.arkm.com/llms/guides/rate-limits.md): Rate Limits guide
- [Credit Pricing](https://intel.arkm.com/llms/guides/credit-pricing.md): Credit Pricing guide
- [Pagination](https://intel.arkm.com/llms/guides/pagination.md): Pagination guide
- [Timestamps & Sorting](https://intel.arkm.com/llms/guides/timestamps-sorting.md): Timestamps & Sorting guide
- [Errors & HTTP Codes](https://intel.arkm.com/llms/guides/errors-http-codes.md): Errors & HTTP Codes guide
- [Security & Best Practices](https://intel.arkm.com/llms/guides/security-best-practices.md): Security & Best Practices guide
- [Cookbook & Starter Kits](https://intel.arkm.com/llms/guides/cookbook-starter-kits.md): Cookbook & Starter Kits guide
- [Support & Contact](https://intel.arkm.com/llms/guides/support-contact.md): Support & Contact guide

## Endpoints

- [GET /arkm/circulating](https://intel.arkm.com/llms/get-arkm-circulating.md): Get ARKM circulating supply
- [GET /balances/address/{address}](https://intel.arkm.com/llms/get-balances-address-address.md): Get token balances for an address
- [GET /balances/entity/{entity}](https://intel.arkm.com/llms/get-balances-entity-entity.md): Get token balances for an entity
- [GET /balances/solana/subaccounts/address/{addresses}](https://intel.arkm.com/llms/get-balances-solana-subaccounts-address-addresses.md): Get Solana subaccount balances for addresses
- [GET /balances/solana/subaccounts/entity/{entities}](https://intel.arkm.com/llms/get-balances-solana-subaccounts-entity-entities.md): Get Solana subaccount balances for entities
- [GET /chains](https://intel.arkm.com/llms/get-chains.md): Get supported chains list
- [GET /cluster/{id}/summary](https://intel.arkm.com/llms/get-cluster-id-summary.md): Get cluster summary statistics
- [GET /counterparties/address/{address}](https://intel.arkm.com/llms/get-counterparties-address-address.md): Get top counterparties for an address
- [GET /counterparties/entity/{entity}](https://intel.arkm.com/llms/get-counterparties-entity-entity.md): Get top counterparties for an entity
- [GET /flow/address/{address}](https://intel.arkm.com/llms/get-flow-address-address.md): Get historical USD flows for an address
- [GET /flow/entity/{entity}](https://intel.arkm.com/llms/get-flow-entity-entity.md): Get historical USD flows for an entity
- [GET /history/address/{address}](https://intel.arkm.com/llms/get-history-address-address.md): Get historical data for an address
- [GET /history/entity/{entity}](https://intel.arkm.com/llms/get-history-entity-entity.md): Get historical data for an entity
- [POST /intelligence/address/batch](https://intel.arkm.com/llms/post-intelligence-address-batch.md): Batch lookup address intelligence
- [POST /intelligence/address/batch/all](https://intel.arkm.com/llms/post-intelligence-address-batch-all.md): Batch lookup address intelligence across all chains
- [GET /intelligence/address/{address}](https://intel.arkm.com/llms/get-intelligence-address-address.md): Get intelligence about an address
- [GET /intelligence/address/{address}/all](https://intel.arkm.com/llms/get-intelligence-address-address-all.md): Get all intelligence about an address across chains
- [POST /intelligence/address_enriched/batch](https://intel.arkm.com/llms/post-intelligence-address_enriched-batch.md): Batch lookup enriched address intelligence
- [POST /intelligence/address_enriched/batch/all](https://intel.arkm.com/llms/post-intelligence-address_enriched-batch-all.md): Batch lookup enriched address intelligence across all chains
- [GET /intelligence/address_enriched/{address}](https://intel.arkm.com/llms/get-intelligence-address_enriched-address.md): Get intelligence about an address with additional address information
- [GET /intelligence/address_enriched/{address}/all](https://intel.arkm.com/llms/get-intelligence-address_enriched-address-all.md): Get intelligence about an address on all chains with additional address information
- [GET /intelligence/address_tags/updates](https://intel.arkm.com/llms/get-intelligence-address_tags-updates.md): Get address-tag association updates
- [GET /intelligence/addresses/updates](https://intel.arkm.com/llms/get-intelligence-addresses-updates.md): Get address intelligence updates
- [GET /intelligence/contract/{chain}/{address}](https://intel.arkm.com/llms/get-intelligence-contract-chain-address.md): Get intelligence about a contract
- [GET /intelligence/entities/updates](https://intel.arkm.com/llms/get-intelligence-entities-updates.md): Get entity intelligence updates
- [GET /intelligence/entity/{entity}](https://intel.arkm.com/llms/get-intelligence-entity-entity.md): Get intelligence about an entity
- [GET /intelligence/entity/{entity}/summary](https://intel.arkm.com/llms/get-intelligence-entity-entity-summary.md): Get entity summary statistics
- [GET /intelligence/entity_balance_changes](https://intel.arkm.com/llms/get-intelligence-entity_balance_changes.md): Get entity balance changes
- [GET /intelligence/entity_predictions/{entity}](https://intel.arkm.com/llms/get-intelligence-entity_predictions-entity.md): Get predictions for an entity
- [GET /intelligence/entity_types](https://intel.arkm.com/llms/get-intelligence-entity_types.md): Get all entity types
- [GET /intelligence/search](https://intel.arkm.com/llms/get-intelligence-search.md): Search addresses, entities, and tokens
- [GET /intelligence/tags/updates](https://intel.arkm.com/llms/get-intelligence-tags-updates.md): Get tag definition updates
- [GET /intelligence/token/{chain}/{address}](https://intel.arkm.com/llms/get-intelligence-token-chain-address.md): Get intelligence on a token by chain/address
- [GET /intelligence/token/{id}](https://intel.arkm.com/llms/get-intelligence-token-id.md): Get intelligence on a token by CoinGecko pricing ID
- [GET /loans/address/{address}](https://intel.arkm.com/llms/get-loans-address-address.md): Get loan/borrow positions for an address
- [GET /loans/entity/{entity}](https://intel.arkm.com/llms/get-loans-entity-entity.md): Get loan/borrow positions for an entity
- [GET /marketdata/altcoin_index](https://intel.arkm.com/llms/get-marketdata-altcoin_index.md): Get Altcoin Index
- [GET /networks/history/{chain}](https://intel.arkm.com/llms/get-networks-history-chain.md): Get historical data for a blockchain network
- [GET /networks/status](https://intel.arkm.com/llms/get-networks-status.md): Get current status for all blockchain networks
- [GET /portfolio/address/{address}](https://intel.arkm.com/llms/get-portfolio-address-address.md): Get address portfolio history
- [GET /portfolio/entity/{entity}](https://intel.arkm.com/llms/get-portfolio-entity-entity.md): Get entity portfolio history
- [GET /portfolio/timeSeries/address/{address}](https://intel.arkm.com/llms/get-portfolio-timeSeries-address-address.md): Get daily time series data for an address's token
- [GET /portfolio/timeSeries/entity/{entity}](https://intel.arkm.com/llms/get-portfolio-timeSeries-entity-entity.md): Get daily time series data for an entity's token
- [GET /swaps](https://intel.arkm.com/llms/get-swaps.md): Get swaps
- [GET /tag/{id}/params](https://intel.arkm.com/llms/get-tag-id-params.md): Get tag parameters
- [GET /tag/{id}/summary](https://intel.arkm.com/llms/get-tag-id-summary.md): Get tag summary statistics
- [GET /token/addresses/{id}](https://intel.arkm.com/llms/get-token-addresses-id.md): Get chain addresses for a token
- [GET /token/arkham_exchange_tokens](https://intel.arkm.com/llms/get-token-arkham_exchange_tokens.md): Get Arkham Exchange tokens
- [GET /token/balance/{chain}/{address}](https://intel.arkm.com/llms/get-token-balance-chain-address.md): Get token balance for an entity or address, for a specific chain/address
- [GET /token/balance/{id}](https://intel.arkm.com/llms/get-token-balance-id.md): Get token balance (all chains) for an entity or address
- [GET /token/holders/{chain}/{address}](https://intel.arkm.com/llms/get-token-holders-chain-address.md): Get top token holders by chain and address
- [GET /token/holders/{id}](https://intel.arkm.com/llms/get-token-holders-id.md): Get top token holders by pricing ID
- [GET /token/market/{id}](https://intel.arkm.com/llms/get-token-market-id.md): Get current market data for a token
- [GET /token/price/history/{chain}/{address}](https://intel.arkm.com/llms/get-token-price-history-chain-address.md): Get token price history by chain and address
- [GET /token/price/history/{id}](https://intel.arkm.com/llms/get-token-price-history-id.md): Get token price history by pricing ID
- [GET /token/price_change/{id}](https://intel.arkm.com/llms/get-token-price_change-id.md): Get token price change since a timestamp
- [GET /token/top](https://intel.arkm.com/llms/get-token-top.md): Get top tokens by exchange activity
- [GET /token/top_flow/{chain}/{address}](https://intel.arkm.com/llms/get-token-top_flow-chain-address.md): Get top token flow
- [GET /token/top_flow/{id}](https://intel.arkm.com/llms/get-token-top_flow-id.md): Get top flow for a token by pricing ID
- [GET /token/trending](https://intel.arkm.com/llms/get-token-trending.md): Get trending tokens
- [GET /token/trending/{id}](https://intel.arkm.com/llms/get-token-trending-id.md): Get a single trending token by ID
- [GET /token/volume/{chain}/{address}](https://intel.arkm.com/llms/get-token-volume-chain-address.md): Get volume for a token by chain/address
- [GET /token/volume/{id}](https://intel.arkm.com/llms/get-token-volume-id.md): Get volume for a token by pricing ID
- [GET /transfers](https://intel.arkm.com/llms/get-transfers.md): Get transfers
- [GET /transfers/histogram](https://intel.arkm.com/llms/get-transfers-histogram.md): Get a detailed histogram of transfers (API Only)
- [GET /transfers/histogram/simple](https://intel.arkm.com/llms/get-transfers-histogram-simple.md): Get a simple histogram of transfers (Public)
- [GET /transfers/tx/{hash}](https://intel.arkm.com/llms/get-transfers-tx-hash.md): Get transfers for a transaction
- [GET /tx/{hash}](https://intel.arkm.com/llms/get-tx-hash.md): Get transaction details
- [GET /user/entities](https://intel.arkm.com/llms/get-user-entities.md): List all private entities
- [PUT /user/entities/only_add/{id}](https://intel.arkm.com/llms/put-user-entities-only_add-id.md): Update a private entity
- [GET /user/entities/{id}](https://intel.arkm.com/llms/get-user-entities-id.md): Get a private entity by ID
- [GET /user/labels](https://intel.arkm.com/llms/get-user-labels.md): Get user labels
- [POST /user/labels](https://intel.arkm.com/llms/post-user-labels.md): Create labels
- [GET /volume/address/{address}](https://intel.arkm.com/llms/get-volume-address-address.md): Get transfer volume for an address
- [GET /volume/entity/{entity}](https://intel.arkm.com/llms/get-volume-entity-entity.md): Get transfer volume for an entity
- [GET /ws/active_connections](https://intel.arkm.com/llms/get-ws-active_connections.md): Get active WebSocket connections
- [GET /ws/session-info](https://intel.arkm.com/llms/get-ws-session-info.md): Get WebSocket pricing info
- [GET /ws/sessions](https://intel.arkm.com/llms/get-ws-sessions.md): List WebSocket sessions
- [POST /ws/sessions](https://intel.arkm.com/llms/post-ws-sessions.md): Create WebSocket session
- [GET /ws/sessions/{id}](https://intel.arkm.com/llms/get-ws-sessions-id.md): Get WebSocket session status
- [DELETE /ws/sessions/{id}](https://intel.arkm.com/llms/delete-ws-sessions-id.md): Delete WebSocket session
- [GET /ws/transfers](https://intel.arkm.com/llms/get-ws-transfers.md): WebSocket transfer streaming

## Code Examples

- [Bash — arkham-cli](https://intel.arkm.com/cookbook/cli/arkham-cli.sh)
- [Python — arkham demo](https://intel.arkm.com/cookbook/cli/arkham_demo.py)
- [Python — rest example](https://intel.arkm.com/cookbook/cli/rest_example.py)
- [Python — websocket example](https://intel.arkm.com/cookbook/cli/websocket_example.py)

## Optional

- [Arkham-API-Complete.postman_collection](https://intel.arkm.com/cookbook/postman/Arkham-API-Complete.postman_collection.json): Postman collection/environment
- [Arkham-API-Production.postman_environment](https://intel.arkm.com/cookbook/postman/Arkham-API-Production.postman_environment.json): Postman collection/environment
