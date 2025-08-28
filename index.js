const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { processPortfolioData } = require('./utils/portfolioCalculator');
const authRoutes = require('./routes/auth');
const walletAuthRoutes = require('./routes/walletAuth');
const walletMonitoringRoutes = require('./routes/walletMonitoring');
const { authenticateToken, optionalAuth } = require('./middleware/auth');
const db = require('./database/db');
const scheduler = require('./services/scheduler');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Auth routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet-auth', walletAuthRoutes);
app.use('/api/wallet-monitoring', walletMonitoringRoutes);

app.get('/api/debank/portfolio/:address', optionalAuth, async (req, res) => {
  const { address } = req.params;
  const { chain_ids = 'bsc,eth' } = req.query;
  
  console.log(`Received request for address: ${address}`);
  
  try {
    const url = `https://pro-openapi.debank.com/v1/user/all_complex_protocol_list?id=${address}&chain_ids=${chain_ids}`;
    console.log('Fetching from URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'AccessKey': '1ed5c1940a7ad31165a8ce6ed2ef93168394efc1' // Add your AccessKey here if you have one
      }
    });
    
    console.log('D-Bank response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('D-Bank error response:', errorText);
      return res.status(response.status).json({ error: 'Failed to fetch from D-Bank', details: errorText });
    }
    const data = await response.json();
    console.log('D-Bank API Response:', JSON.stringify(data, null, 2));
    
    // Process the data to calculate PnL, APY, and other metrics
    const processedData = processPortfolioData(data);
    console.log('Processed Portfolio Data:', JSON.stringify(processedData, null, 2));
    
    // Save portfolio snapshot if user is authenticated
    if (req.user && processedData.overview) {
      try {
        await db.savePortfolioSnapshot(req.user.id, address, processedData);
        console.log('Portfolio snapshot saved for user:', req.user.email);
      } catch (snapshotError) {
        console.error('Error saving portfolio snapshot:', snapshotError);
        // Don't fail the request if snapshot saving fails
      }
    }
    
    res.json(processedData);
  } catch (err) {
    console.log('Error details:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Get user's portfolio history
app.get('/api/portfolio/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const history = await db.getUserPortfolioHistory(req.user.id, parseInt(limit));
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Portfolio history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend proxy server running on http://localhost:${PORT}`);
  
  // Start the wallet monitoring scheduler
  setTimeout(() => {
    console.log('🚀 Starting wallet monitoring scheduler...');
    scheduler.start();
  }, 2000); // Wait 2 seconds for database to be ready
}); 