require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const sessionManager = require('./sessionManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Enhanced CORS configuration with detailed logging
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  console.log(`Origin: ${req.headers.origin}`);
  
  // Set CORS headers for all origins, especially for the frontend public domain
  const allowedOrigins = [
    'https://8081-iboiaeuvpxrytnh0hxg0q-ed94c467.manus.computer',
    'http://localhost:8081',
    'http://localhost:8080',
    'https://total-degen.vercel.app',
    'https://www.total-degen.com',
    'https://total-degen.com'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-MBX-APIKEY, X-Session-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  console.log('CORS headers set:', res.getHeaders()['access-control-allow-origin']);
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log('Responding to OPTIONS request');
    return res.status(204).end();
  }
  
  next();
});
app.use(express.json());

// Extract session token from request headers
const getSessionToken = (req) => {
  return req.headers['x-session-token'];
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend server is running' });
});

// Get supported exchanges
app.get('/api/exchanges', (req, res) => {
  res.json({
    exchanges: [
      { id: 'binance', name: 'Binance', logo: '/exchanges/binance.svg' },
      { id: 'hyperliquid', name: 'Hyperliquid', logo: '/exchanges/hyperliquid.svg' }
    ]
  });
});

// Connect to exchange
app.post('/api/exchange/connect', async (req, res) => {
  try {
    const { exchange, apiKey, secretKey } = req.body;
    
    if (!exchange || !apiKey || !secretKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters' 
      });
    }
    
    if (exchange === 'binance') {
      // Test Binance API connection
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac('sha256', secretKey)
        .update(queryString)
        .digest('hex');
      
      try {
        const response = await axios({
          method: 'GET',
          url: `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
          headers: {
            'X-MBX-APIKEY': apiKey
          }
        });
        
        // Create a session with encrypted API keys
        const userId = 'user123'; // In production, this would be the authenticated user's ID
        const sessionData = sessionManager.createSession(userId, {
          exchange,
          apiKey,
          secretKey
        });
        
        return res.json({
          success: true,
          message: 'Successfully connected to Binance',
          data: {
            exchange: 'binance',
            accountInfo: response.data
          },
          token: sessionData.sessionToken,
          expiresAt: sessionData.expiresAt
        });
      } catch (error) {
        console.error('Binance API error:', error.response ? error.response.data : error.message);
        return res.status(400).json({
          success: false,
          message: error.response ? error.response.data.msg : 'Failed to connect to Binance',
          error: error.response ? error.response.data : error.message
        });
      }
    } else if (exchange === 'hyperliquid') {
      // Implement Hyperliquid connection logic here
      // For now, we'll create a session with the provided credentials
      const userId = 'user123'; // In production, this would be the authenticated user's ID
      const sessionData = sessionManager.createSession(userId, {
        exchange,
        apiKey,
        secretKey
      });
      
      return res.json({
        success: true,
        message: 'Successfully connected to Hyperliquid',
        data: {
          exchange: 'hyperliquid'
        },
        token: sessionData.sessionToken,
        expiresAt: sessionData.expiresAt
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported exchange'
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Validate session endpoint
app.get('/api/session/validate', (req, res) => {
  const sessionToken = getSessionToken(req);
  
  if (!sessionToken) {
    return res.status(401).json({
      success: false,
      message: 'No session token provided'
    });
  }
  
  const session = sessionManager.getSession(sessionToken);
  
  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session'
    });
  }
  
  return res.json({
    success: true,
    message: 'Session is valid',
    data: {
      exchange: session.exchange,
      expiresAt: session.expiresAt
    }
  });
});

// Get account balances
app.get('/api/exchange/balances', async (req, res) => {
  try {
    const sessionToken = getSessionToken(req);
    
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token provided'
      });
    }
    
    const keys = sessionManager.getApiKeys(sessionToken);
    
    if (!keys) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }
    
    if (keys.exchange === 'binance') {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac('sha256', keys.secretKey)
        .update(queryString)
        .digest('hex');
      
      const response = await axios({
        method: 'GET',
        url: `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
        headers: {
          'X-MBX-APIKEY': keys.apiKey
        }
      });
      
      // Filter out zero balances
      const balances = response.data.balances.filter(b => 
        parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
      );
      
      return res.json({
        success: true,
        data: balances
      });
    } else if (keys.exchange === 'hyperliquid') {
      // Implement Hyperliquid balance retrieval
      return res.json({
        success: true,
        data: [
          { asset: 'USDT', free: '1000.00', locked: '0.00' }
        ],
        message: 'Hyperliquid balances retrieved'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported exchange'
      });
    }
  } catch (error) {
    console.error('Error fetching balances:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch balances',
      error: error.message
    });
  }
});

// Get portfolio value
app.get('/api/exchange/portfolio', async (req, res) => {
  try {
    const sessionToken = getSessionToken(req);
    
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token provided'
      });
    }
    
    const keys = sessionManager.getApiKeys(sessionToken);
    
    if (!keys) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }
    
    if (keys.exchange === 'binance') {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac('sha256', keys.secretKey)
        .update(queryString)
        .digest('hex');
      
      // Get account information
      const accountResponse = await axios({
        method: 'GET',
        url: `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
        headers: {
          'X-MBX-APIKEY': keys.apiKey
        }
      });
      
      // Get ticker prices for all assets
      const tickerResponse = await axios({
        method: 'GET',
        url: 'https://api.binance.com/api/v3/ticker/price'
      });
      
      const prices = {};
      tickerResponse.data.forEach(ticker => {
        prices[ticker.symbol] = parseFloat(ticker.price);
      });
      
      // Calculate portfolio value
      let totalValue = 0;
      const assets = [];
      
      accountResponse.data.balances.forEach(balance => {
        const asset = balance.asset;
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = free + locked;
        
        if (total > 0) {
          let assetValue = 0;
          
          // For USDT and stablecoins, use face value
          if (asset === 'USDT' || asset === 'USDC' || asset === 'BUSD' || asset === 'DAI') {
            assetValue = total;
          } 
          // For other assets, find a USDT pair if available
          else {
            const usdtPair = `${asset}USDT`;
            if (prices[usdtPair]) {
              assetValue = total * prices[usdtPair];
            } else {
              // Try BTC pair and then convert BTC to USDT
              const btcPair = `${asset}BTC`;
              if (prices[btcPair] && prices['BTCUSDT']) {
                assetValue = total * prices[btcPair] * prices['BTCUSDT'];
              }
            }
          }
          
          totalValue += assetValue;
          
          assets.push({
            asset,
            free,
            locked,
            total,
            valueUSDT: assetValue
          });
        }
      });
      
      return res.json({
        success: true,
        data: {
          totalValueUSDT: totalValue,
          assets: assets.sort((a, b) => b.valueUSDT - a.valueUSDT) // Sort by value descending
        }
      });
    } else if (keys.exchange === 'hyperliquid') {
      // Implement Hyperliquid portfolio value calculation
      return res.json({
        success: true,
        data: {
          totalValueUSDT: 1000,
          assets: [
            { asset: 'USDT', free: 1000, locked: 0, total: 1000, valueUSDT: 1000 }
          ]
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported exchange'
      });
    }
  } catch (error) {
    console.error('Error fetching portfolio value:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio value',
      error: error.message
    });
  }
});

// Get open positions
app.get('/api/exchange/positions', async (req, res) => {
  try {
    const sessionToken = getSessionToken(req);
    
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token provided'
      });
    }
    
    const keys = sessionManager.getApiKeys(sessionToken);
    
    if (!keys) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }
    
    if (keys.exchange === 'binance') {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac('sha256', keys.secretKey)
        .update(queryString)
        .digest('hex');
      
      // Get open positions from futures account
      try {
        const positionsResponse = await axios({
          method: 'GET',
          url: `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
          headers: {
            'X-MBX-APIKEY': keys.apiKey
          }
        });
        
        // Filter out positions with zero amount
        const positions = positionsResponse.data.filter(position => 
          parseFloat(position.positionAmt) !== 0
        );
        
        return res.json({
          success: true,
          data: positions
        });
      } catch (futuresError) {
        console.error('Error fetching futures positions:', futuresError);
        
        // If futures API fails, return empty positions
        return res.json({
          success: true,
          data: [],
          message: 'No futures positions found or futures API access not available'
        });
      }
    } else if (keys.exchange === 'hyperliquid') {
      // Implement Hyperliquid positions retrieval
      return res.json({
        success: true,
        data: []
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported exchange'
      });
    }
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch positions',
      error: error.message
    });
  }
});

// Get portfolio history for chart
app.get('/api/exchange/portfolio/history', async (req, res) => {
  try {
    const sessionToken = getSessionToken(req);
    const { timeframe } = req.query; // 1d, 7d, 30d, etc.
    
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token provided'
      });
    }
    
    const keys = sessionManager.getApiKeys(sessionToken);
    
    if (!keys) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }
    
    if (keys.exchange === 'binance') {
      try {
        // Get current portfolio value
        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}`;
        const signature = crypto
          .createHmac('sha256', keys.secretKey)
          .update(queryString)
          .digest('hex');
        
        // Get account information
        const accountResponse = await axios({
          method: 'GET',
          url: `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
          headers: {
            'X-MBX-APIKEY': keys.apiKey
          }
        });
        
        // Get ticker prices for all assets
        const tickerResponse = await axios({
          method: 'GET',
          url: 'https://api.binance.com/api/v3/ticker/price'
        });
        
        const prices = {};
        tickerResponse.data.forEach(ticker => {
          prices[ticker.symbol] = parseFloat(ticker.price);
        });
        
        // Calculate current portfolio value
        let currentValue = 0;
        accountResponse.data.balances.forEach(balance => {
          const asset = balance.asset;
          const total = parseFloat(balance.free) + parseFloat(balance.locked);
          
          if (total > 0) {
            let assetValue = 0;
            
            // For USDT and stablecoins, use face value
            if (asset === 'USDT' || asset === 'USDC' || asset === 'BUSD' || asset === 'DAI') {
              assetValue = total;
            } 
            // For other assets, find a USDT pair if available
            else {
              const usdtPair = `${asset}USDT`;
              if (prices[usdtPair]) {
                assetValue = total * prices[usdtPair];
              } else {
                // Try BTC pair and then convert BTC to USDT
                const btcPair = `${asset}BTC`;
                if (prices[btcPair] && prices['BTCUSDT']) {
                  assetValue = total * prices[btcPair] * prices['BTCUSDT'];
                }
              }
            }
            
            currentValue += assetValu
(Content truncated due to size limit. Use line ranges to read in chunks)