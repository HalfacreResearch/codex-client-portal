# Codex Client Portal TODO

## Authentication
- [x] Client authentication via Manus OAuth (email-based login)

## Dashboard Cards
- [x] Portfolio Overview Card (total USD value, crypto balances)
- [x] USD Growth Metrics Card (deposited, current value, growth)
- [x] BTC Performance Card (conditional on BTC holdings)

## Tables
- [x] Recent Trades Table (last 10-20 trades)
- [x] Account Balances Table with refresh button

## Support
- [x] Contact/Support button with Request a Call functionality
- [x] Automated notifications to Codex team owner

## Backend
- [x] Database schema with client_credentials table
- [x] Server-side sFOX API integration
- [x] Encrypted API key storage
- [x] tRPC procedures for portfolio data

## Styling
- [x] Dark theme with orange accent (#FF6B35)
- [x] Modern card-based dashboard layout
- [x] Responsive design for mobile and desktop

## Updates
- [x] Update orange accent to match BTC logo (#F7931A)
- [x] Enable staff to pre-create client accounts with email and API key before client login

## Admin Panel
- [x] Admin dashboard page for staff
- [x] Add new client form (name, email, sFOX API key)
- [x] Client list view with status
- [x] Edit/update client API keys
- [x] Admin-only route protection
- [x] Update header to say "BTC Treasury Codex" instead of "Codex"
- [x] Update footer copyright to "© 2025 BTC Treasury Codex. All Rights Reserved."
- [x] Make client names clickable in admin panel to view their dashboard
- [x] Fix API key encryption/decryption issue causing "Unable to load portfolio data"
- [x] Fix XRP and LINK showing $0.00 - add price fetching for all cryptocurrencies
- [x] Change header navigation elements to orange color
- [x] Fix header: revert title and logout to original colors, keep only nav elements orange
- [x] Replace "C" icon with BTC Treasury Codex logo in header
- [ ] Fix navigation items (Admin Panel, Request a Call) to be orange instead of gray
- [x] Remove Recent Trades section from client dashboard
- [x] Update BTC Performance card to match USD Growth Metrics card style with green percentage growth
- [x] Remove redundant Account Balances table from client dashboard
- [x] Fix BTC Performance calculation to include BTC deposits/transfers as "purchased" and properly account for BTC sales
- [x] Fix BTC percentage growth calculation - currently showing 766% which is inaccurate
- [x] Debug BTC metrics data from backend - verify totalPurchased, totalSold, currentlyHeld values

## Calculation Accuracy Fixes
- [ ] Analyze Van's transaction data to verify USD and BTC calculations
- [ ] Analyze Glenn's transaction data to verify USD and BTC calculations
- [x] Fix USD growth calculation to properly handle deposits vs transfers
- [x] Fix BTC growth calculation to show system performance independent of selling activity
- [ ] Test calculations against real client data for accuracy
- [ ] Fix USD growth to include BTC deposit USD values at historical deposit prices (not current price)
- [ ] Fix BTC growth to count BTC bought through trades (currently only counting deposits)
- [ ] Update BTC growth formula: (Current + Sold - Total Acquired) / Total Acquired × 100
- [x] Fix BTC Growth to only count BTC-pair trades (BTC/SOL, BTC/LINK), not USD trades
- [x] BTC Growth should show 0% when no BTC-pair trades have been made (like Glenn's case)
- [x] Fix BTC-pair trade detection - use allTransactions with price-based filtering
- [x] Properly identify SOL/BTC trades where Source Currency = btc and Target Currency = sol
- [ ] Simplify BTC growth: use transaction history to calculate Current + Sold - Deposited
- [ ] Remove complex BTC-pair trade detection logic
- [x] Fix BTC growth formula: (BTC gained from trades) / (BTC holdings at trade time) × 100
- [x] Implemented calculation using BTC holdings at time of first BTC-pair trade
- [ ] Optimize API calls - reduce from 5 concurrent calls to 2-3 by reusing allTransactions data
- [ ] Remove separate getDeposits() and getOrders() calls, extract from allTransactions instead
- [ ] Fix BTC growth showing 0% - SOL/BTC trades not being detected by price < 0.01 filter

## URGENT - BTC Growth Still Broken (Dec 24, 2025 8:00 PM)
- [ ] BTC Percentage Growth STILL showing +0.00% after deploying fix
- [ ] Debug: Check server logs for BTC-pair trade detection output
- [ ] Investigate: Why are SOL/BTC trades not being detected by the filter?
- [ ] Test: Verify the sFOX API data structure matches our assumptions

## ROOT CAUSE FOUND (Dec 24, 2025 8:10 PM)
- [x] Discovered: sFOX API returns `price` in USD for ALL transactions, not BTC
- [x] The filter `price < 0.01` never matches because USD prices are ~$100-$150
- [x] Fix: Use `symbol` field to detect BTC-pair trades (e.g., "sol/btc", "link/btc")
- [x] Calculate BTC amount from net_proceeds field instead of using price
- [x] Pushed to GitHub (commit af091dc)
