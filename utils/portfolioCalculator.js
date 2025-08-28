// Portfolio calculation utilities
const calculatePnL = (currentValue, initialValue) => {
  if (!initialValue || initialValue === 0) return { pnl: 0, pnlPercentage: 0 }
  
  const pnl = currentValue - initialValue
  const pnlPercentage = (pnl / initialValue) * 100
  
  return { pnl, pnlPercentage }
}

const calculateAPY = (currentValue, initialValue, daysHeld) => {
  if (!initialValue || initialValue === 0 || !daysHeld || daysHeld === 0) return 0
  
  const dailyReturn = (currentValue - initialValue) / initialValue / daysHeld
  const apy = (Math.pow(1 + dailyReturn, 365) - 1) * 100
  
  return apy
}

const determinePositionType = (protocol) => {
  const protocolName = protocol.name?.toLowerCase() || protocol.id?.toLowerCase() || ''
  
  if (protocolName.includes('aave') || protocolName.includes('compound') || protocolName.includes('lend')) {
    return 'lending'
  } else if (protocolName.includes('uniswap') || protocolName.includes('sushiswap') || protocolName.includes('pancake')) {
    return 'liquidity'
  } else if (protocolName.includes('farm') || protocolName.includes('yield')) {
    return 'farming'
  } else if (protocolName.includes('stake')) {
    return 'staking'
  }
  
  return 'other'
}

const processPortfolioData = (debankData) => {
  if (!debankData || !Array.isArray(debankData)) {
    return {
      positions: [],
      overview: {
        totalValue: 0,
        totalPnL: 0,
        totalPnLPercentage: 0,
        avgAPY: 0,
        positionsCount: 0,
        topProtocols: []
      }
    }
  }

  const positions = []
  let totalValue = 0
  let totalPnL = 0
  let totalInitialValue = 0
  const protocolCounts = {}

  debankData.forEach((protocol, index) => {
    if (!protocol || !protocol.portfolio_item_list) return

    protocol.portfolio_item_list.forEach((item, itemIndex) => {
      // Mock historical data for demonstration (in real app, fetch from historical API)
      const mockInitialValue = item.stats?.net_usd_value * (0.8 + Math.random() * 0.4) // Random initial value
      const currentValue = item.stats?.net_usd_value || 0
      const daysHeld = Math.floor(Math.random() * 90) + 1 // Random days 1-90
      
      const { pnl, pnlPercentage } = calculatePnL(currentValue, mockInitialValue)
      const apy = calculateAPY(currentValue, mockInitialValue, daysHeld)
      
      const assets = []
      if (item.detail?.supply_token_list) {
        item.detail.supply_token_list.forEach(token => {
          assets.push({
            symbol: token.symbol || 'Unknown',
            amount: token.amount || 0,
            value: (token.amount || 0) * (token.price || 0),
            logo: token.logo_url
          })
        })
      }
      
      if (item.detail?.reward_token_list) {
        item.detail.reward_token_list.forEach(token => {
          assets.push({
            symbol: token.symbol || 'Unknown',
            amount: token.amount || 0,
            value: (token.amount || 0) * (token.price || 0),
            logo: token.logo_url
          })
        })
      }

      const position = {
        id: `${protocol.id || index}-${itemIndex}`,
        protocol: protocol.name || 'Unknown Protocol',
        protocolLogo: protocol.logo_url,
        type: determinePositionType(protocol),
        assets: assets,
        totalValue: currentValue,
        pnl: pnl,
        pnlPercentage: pnlPercentage,
        apy: apy,
        duration: daysHeld,
        lastUpdated: new Date().toISOString()
      }

      positions.push(position)
      totalValue += currentValue
      totalPnL += pnl
      totalInitialValue += mockInitialValue

      // Count protocols
      const protocolName = protocol.name || 'Unknown'
      protocolCounts[protocolName] = (protocolCounts[protocolName] || 0) + 1
    })
  })

  // Calculate overall metrics
  const totalPnLPercentage = totalInitialValue > 0 ? (totalPnL / totalInitialValue) * 100 : 0
  const avgAPY = positions.length > 0 ? positions.reduce((sum, p) => sum + p.apy, 0) / positions.length : 0
  
  // Get top protocols
  const topProtocols = Object.entries(protocolCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name)

  return {
    positions,
    overview: {
      totalValue,
      totalPnL,
      totalPnLPercentage,
      avgAPY,
      positionsCount: positions.length,
      topProtocols
    }
  }
}

module.exports = {
  calculatePnL,
  calculateAPY,
  determinePositionType,
  processPortfolioData
} 