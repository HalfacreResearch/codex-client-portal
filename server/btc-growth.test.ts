import { describe, it, expect } from 'vitest';

describe('BTC Growth Calculation', () => {
  it('should correctly calculate BTC growth from SOL/BTC trades', () => {
    // Glenn's actual trades from May 2025
    const mockTransactions = [
      // BTC Deposit
      {
        id: 1,
        day: '2025-01-15T00:00:00Z',
        action: 'Deposit',
        currency: 'btc',
        amount: 0.517,
        net_proceeds: 0,
        price: 0,
        symbol: 'btc/usd'
      },
      // May 5: Buy 33.289 SOL for 0.05166591 BTC
      {
        id: 2,
        day: '2025-05-05T00:00:00Z',
        action: 'Buy',
        currency: 'sol',
        amount: 33.289,
        net_proceeds: -0.05166591, // Spent BTC (negative)
        price: 0.00155, // BTC per SOL
        symbol: 'sol/btc'
      },
      // May 8: Sell 33.293 SOL for 0.05259301 BTC
      {
        id: 3,
        day: '2025-05-08T00:00:00Z',
        action: 'Sell',
        currency: 'sol',
        amount: -33.293,
        net_proceeds: 0.05259301, // Received BTC (positive)
        price: 0.00158, // BTC per SOL
        symbol: 'sol/btc'
      }
    ];

    // Filter for BTC-pair trades
    const btcPairTrades = mockTransactions.filter(tx => {
      const currency = (tx.currency || "").toLowerCase();
      const netProceeds = Math.abs(tx.net_proceeds || 0);
      const price = tx.price || 0;
      
      const isCrypto = currency !== "btc" && currency !== "usd" && currency !== "usdc";
      const hasBtcPrice = price > 0 && price < 0.01;
      const hasBtcProceeds = netProceeds > 0 && netProceeds < 1;
      
      return isCrypto && (hasBtcPrice || hasBtcProceeds);
    });

    console.log('BTC-pair trades found:', btcPairTrades.length);
    expect(btcPairTrades.length).toBe(2); // Should find both SOL trades

    // Calculate BTC growth
    const btcGrowth = btcPairTrades.reduce((sum, tx) => sum + (tx.net_proceeds || 0), 0);
    console.log('BTC Growth:', btcGrowth);
    expect(btcGrowth).toBeCloseTo(0.0009271, 7); // Net gain: 0.05259301 - 0.05166591

    // Calculate BTC holdings at trade time (0.517 BTC deposited)
    const btcDeposits = mockTransactions
      .filter(tx => tx.action === 'Deposit' && tx.currency === 'btc')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const btcHoldingsAtTradeTime = btcDeposits;
    console.log('BTC Holdings at Trade Time:', btcHoldingsAtTradeTime);
    expect(btcHoldingsAtTradeTime).toBe(0.517);

    // Calculate percentage
    const percentGrowth = (btcGrowth / btcHoldingsAtTradeTime) * 100;
    console.log('BTC Percentage Growth:', percentGrowth.toFixed(4) + '%');
    expect(percentGrowth).toBeCloseTo(0.1793, 2); // ~0.18%
  });

  it('should handle empty BTC-pair trades', () => {
    const mockTransactions = [
      {
        id: 1,
        day: '2025-01-15T00:00:00Z',
        action: 'Deposit',
        currency: 'btc',
        amount: 0.517,
        net_proceeds: 0,
        price: 0,
        symbol: 'btc/usd'
      }
    ];

    const btcPairTrades = mockTransactions.filter(tx => {
      const currency = (tx.currency || "").toLowerCase();
      const netProceeds = Math.abs(tx.net_proceeds || 0);
      const price = tx.price || 0;
      
      const isCrypto = currency !== "btc" && currency !== "usd" && currency !== "usdc";
      const hasBtcPrice = price > 0 && price < 0.01;
      const hasBtcProceeds = netProceeds > 0 && netProceeds < 1;
      
      return isCrypto && (hasBtcPrice || hasBtcProceeds);
    });

    expect(btcPairTrades.length).toBe(0);
    
    const btcGrowth = btcPairTrades.reduce((sum, tx) => sum + (tx.net_proceeds || 0), 0);
    expect(btcGrowth).toBe(0);
  });
});
