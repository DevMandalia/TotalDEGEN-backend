require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

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
    'http://localhost:8080'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-MBX-APIKEY');
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

// Store API keys temporarily (in memory only - would use proper storage in production)
const apiKeys = {};

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
        
        // Store API keys (in memory only - would use secure storage in production)
        const userId = 'user123'; // In production, this would be the authenticated user's ID
        apiKeys[userId] = {
          exchange,
          apiKey,
          secretKey
        };
        
        return res.json({
          success: true,
          message: 'Successfully connected to Binance',
          data: {
            exchange: 'binance',
            accountInfo: response.data
          }
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
      // Implement Hyperliquid connection logic using direct REST API
      try {
        // First, verify the API keys by making a request to the info endpoint
        const response = await axios({
          method: 'POST',
          url: 'https://api.hyperliquid.xyz/info',
          data: {
            type: 'userState',
            user: apiKey // Using apiKey as the user address
          }
        });
        
        // Check if the response contains expected data structure
        if (!response.data) {
          throw new Error('Invalid response from Hyperliquid API');
        }
        
        // Store API keys (in memory only - would use secure storage in production)
        const userId = 'user123'; // In production, this would be the authenticated user's ID
        apiKeys[userId] = {
          exchange,
          apiKey,
          secretKey
        };
        
        return res.json({
          success: true,
          message: 'Successfully connected to Hyperliquid',
          data: {
            exchange: 'hyperliquid',
            accountInfo: response.data
          }
        });
      } catch (error) {
        console.error('Hyperliquid API error:', error.response ? error.response.data : error.message);
        
        // Handle specific Hyperliquid error cases
        let errorMessage = 'Failed to connect to Hyperliquid';
        let statusCode = 400;
        
        if (error.response) {
          // API returned an error response
          if (error.response.status === 403) {
            errorMessage = 'Access denied. Please check your API key permissions.';
          } else if (error.response.status === 429) {
            errorMessage = 'Rate limit exceeded. Please try again later.';
            statusCode = 429;
          } else if (error.response.data && error.response.data.error) {
            errorMessage = `Hyperliquid error: ${error.response.data.error}`;
          }
        } else if (error.code === 'ECONNABORTED') {
          errorMessage = 'Connection timed out. Hyperliquid API may be experiencing issues.';
          statusCode = 503;
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          errorMessage = 'Unable to reach Hyperliquid API. Please check your internet connection.';
          statusCode = 503;
        }
        
        return res.status(statusCode).json({
          success: false,
          message: errorMessage,
          error: error.response ? error.response.data : error.message
        });
      }
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

// Get account balances
app.get('/api/exchange/balances', async (req, res) => {
  try {
    const userId = 'user123'; // In production, this would be from authentication
    const userKeys = apiKeys[userId];
    
    if (!userKeys) {
      return res.status(401).json({
        success: false,
        message: 'No exchange connection found'
      });
    }
    
    if (userKeys.exchange === 'binance') {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac('sha256', userKeys.secretKey)
        .update(queryString)
        .digest('hex');
      
      const response = await axios({
        method: 'GET',
        url: `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
        headers: {
          'X-MBX-APIKEY': userKeys.apiKey
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
    } else if (userKeys.exchange === 'hyperliquid') {
      try {
        // Get user state from Hyperliquid
        const response = await axios({
          method: 'POST',
          url: 'https://api.hyperliquid.xyz/info',
          data: {
            type: 'userState',
            user: userKeys.apiKey // Using apiKey as the user address
          }
        });
        
        // Extract balances from the response
        let balances = [];
        if (response.data && response.data.assetPositions) {
          balances = response.data.assetPositions.map(position => ({
            asset: position.coin,
            free: position.free,
            locked: position.locked || '0'
          }));
        }
        
        return res.json({
          success: true,
          data: balances
        });
      } catch (error) {
        console.error('Hyperliquid API error:', error.response ? error.response.data : error.message);
        return res.status(400).json({
          success: false,
          message: 'Failed to fetch Hyperliquid balances',
          error: error.response ? error.response.data : error.message
        });
      }
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

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

module.exports = app;
