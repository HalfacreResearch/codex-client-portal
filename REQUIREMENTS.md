# Codex Client Portal — Confirmed Requirements

## Core Value Proposition
Help clients accumulate **more BTC than the buy-and-hold strategy** through active DCA + trading.
The portal's job is to make that alpha visible, understandable, and shareable.

## BTC Alpha Benchmark Definition
- For each USD-to-BTC purchase the program makes (via sFOX), record the BTC amount acquired.
- Sum all those BTC amounts = the "DCA benchmark" (what a passive buyer would have).
- **Alpha = client's actual BTC balance − DCA benchmark BTC**
- For clients who deposited BTC directly: those BTC deposits count as-is in both actual and benchmark.
- USD is always partially in cash (DCA-ing progressively), so the benchmark must mirror the same timing.

## Client Dashboard Features

### 1. BTC Alpha Hero Metric
- Headline number at top of dashboard
- Shows: "+X.XXXX BTC vs buy-and-hold" and the % outperformance
- This is the number clients brag about

### 2. Benchmark Comparison Chart
- Line chart: Actual BTC balance vs DCA benchmark over time
- The gap between lines = visual proof of the program's value
- Clients screenshot this and share it

### 3. Monthly BTC Accumulation Bars
- Bar chart: BTC accumulated per month
- Shows consistent compounding over time

### 4. Portfolio Summary
- Current BTC holdings
- Current USD value
- Total USD deposited
- Overall portfolio growth %
- Keep high-level (sFOX already shows trade-level detail)

### 5. Plain-English Performance Statement
- Auto-generated monthly summary sentence
- Example: "Since joining in January 2024, your portfolio has accumulated 0.0412 BTC more than the buy-and-hold benchmark — equivalent to $X at today's price."

### 6. Shareable Performance Card
- One-tap button to generate a branded image
- Shows BTC alpha as PERCENTAGE/RATIO only (not absolute BTC numbers — privacy)
- "Powered by BTC Treasury Codex" watermark
- Designed for social sharing (X, text message, etc.)
- This is the primary referral/word-of-mouth driver

## Admin Panel Features
- Client list with each client's BTC alpha at a glance
- Add client (name, email, sFOX API key)
- View individual client details
- Send magic link login to client

## Design
- Keep current dark theme with BTC orange (#f7931a) accents
- No messaging system needed if other features are clean

## Business Context
- No derivatives — spot trading only
- 4 current clients (family + friends)
- Primary growth channel: client referrals via shareable performance card
- Long-term: portal will expand to cover all 4 business departments
