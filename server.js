const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

// CORS configuration to allow requests from your site
app.use(cors({
  origin: 'https://www.sportdogfood.com', // Replace with your actual Webflow site URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Enable credentials if needed
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Token refresh function
async function refreshAccessToken() {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const refreshToken = process.env.REFRESH_TOKEN;

  const tokenUrl = 'https://api.foxycart.com/token';
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
      body: params
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Token refreshed successfully.');
    return data.access_token; // Return the new access token
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
}

// Refresh token test endpoint
app.get('/refresh-token-test', async (req, res) => {
  try {
    const accessToken = await refreshAccessToken();
    res.json({ message: 'Token refreshed successfully', accessToken });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// FoxyCart API proxy middleware to forward requests
app.use('/foxycart', createProxyMiddleware({
  target: 'https://api.foxycart.com',
  changeOrigin: true,
  pathRewrite: {
    '^/foxycart': '', // Strips '/foxycart' prefix before sending the request
  },
  onProxyReq: async (proxyReq, req, res) => {
    // Ensure token refresh
    const accessToken = await refreshAccessToken();
    proxyReq.setHeader('Authorization', `Bearer ${accessToken}`);
    proxyReq.setHeader('FOXY-API-VERSION', '1');
    proxyReq.setHeader('Content-Type', 'application/json');
  },
  onError: (err, req, res) => {
    console.error('API Proxy error:', err);
    res.status(500).json({ error: 'Failed to GET data from FoxyCart API' });
  }
}));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
