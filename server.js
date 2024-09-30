const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const morgan = require('morgan');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;

// Environment Variables for FoxyCart
const {
  clientId,
  clientSecret,
  refreshToken,
} = process.env;

// Validate Environment Variables
if (!clientId || !clientSecret || !refreshToken) {
  console.error('Missing necessary environment variables. Please check Config Vars.');
  process.exit(1);
}

// CORS Configuration to allow all origins for testing (adjust this for production)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'client_id', 
    'client_secret', 
    'FOXY-API-VERSION', 
    'accept-version', 
    'refresh_token', // Add refresh_token to allowed headers
  ],
  exposedHeaders: ['Content-Type', 'Authorization'],
}));

// Use morgan for HTTP request logging
app.use(morgan('combined'));

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * Function to refresh FoxyCart access token
 */
const refreshAccessToken = async () => {
  const tokenUrl = `https://api.foxycart.com/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Access token refreshed:', data.access_token);
    return data.access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
};

/**
 * Route to test token refresh manually
 * Returns accessToken, client_id, client_secret, and refresh_token
 */
app.get('/refresh-token-test', async (req, res) => {
  try {
    const newAccessToken = await refreshAccessToken();
    res.json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * General Proxy Middleware (for non-FoxyCart services)
 */
app.use('/proxy', createProxyMiddleware({
  target: '',  // Target is dynamically set
  changeOrigin: true,
  secure: true,
  router: (req) => {
    const targetUrl = req.path.replace(/^\/proxy\//, '');
    console.log(`Proxying to: ${targetUrl}`);
    return targetUrl;
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy encountered an error.' });
  },
  logLevel: 'debug',  // Keep at debug level for troubleshooting
}));

/**
 * FoxyCart API Proxy Middleware
 */
app.use('/foxycart', createProxyMiddleware({
  target: 'https://api.foxycart.com',
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/foxycart': '', // Remove '/foxycart' prefix before sending the request to FoxyCart
  },
  onProxyReq: async (proxyReq, req, res) => {
    try {
      const accessToken = await refreshAccessToken(); // Ensure token is refreshed
      proxyReq.setHeader('Authorization', `Bearer ${accessToken}`);
      proxyReq.setHeader('FOXY-API-VERSION', '1');
      proxyReq.setHeader('Content-Type', 'application/json');
    } catch (error) {
      console.error('Error setting FoxyCart headers:', error);
      res.status(500).json({ error: 'Failed to refresh access token for FoxyCart.' });
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Add CORS headers to the proxied response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, FOXY-API-VERSION, accept-version, refresh_token'); // Added refresh_token
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  },
  onError: (err, req, res) => {
    console.error('FoxyCart API Proxy error:', err);
    res.status(500).json({ error: 'Failed to process request through FoxyCart proxy.' });
  },
  logLevel: 'debug' // Keep log level at debug for troubleshooting
}));

/**
 * Health Check Endpoint
 */
app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running.');
});

// Start the Server
app.listen(PORT, () => {
  console.log(`CORS Proxy Server is running on port ${PORT}`);
});
