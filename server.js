// server.js

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 8080;

// Environment Variables
const {
  accessToken: initialAccessToken,
  clientId,
  clientSecret,
  refreshToken,
} = process.env;

// Validate Environment Variables
if (!initialAccessToken || !clientId || !clientSecret || !refreshToken) {
  console.error('Missing necessary environment variables. Please check Config Vars.');
  process.exit(1);
}

// CORS Configuration
app.use(cors({
  origin: '*', // Allow all origins for testing
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Use morgan for HTTP request logging
app.use(morgan('combined'));

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * Function to refresh the access token using the refresh token
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
    console.log('Access token refreshed successfully:', data.access_token);
    return data.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
};

/**
 * Middleware to handle authentication and token refresh
 */
let currentAccessToken = initialAccessToken;
let tokenExpiration = Date.now() + (3600 * 1000); // Assuming token is valid for 1 hour; adjust based on actual expiration

const isTokenExpired = () => {
  return Date.now() >= tokenExpiration;
};

// Middleware to refresh token if necessary and handle proxy request
app.use('/foxycart', createProxyMiddleware({
  target: 'https://api.foxycart.com',
  changeOrigin: true,
  pathRewrite: {
    '^/foxycart': '', // Removes '/foxycart' from the proxied request URL
  },
  onProxyReq: async (proxyReq, req, res) => {
    // Ensure the access token is refreshed and add headers
    const currentAccessToken = await refreshAccessTokenIfNeeded();
    proxyReq.setHeader('Authorization', `Bearer ${currentAccessToken}`);
    proxyReq.setHeader('FOXY-API-VERSION', '1');
    proxyReq.setHeader('Content-Type', 'application/json');
  },
  onError: (err, req, res) => {
    console.error('API Proxy error:', err);
    res.status(500).json({ error: 'Failed to GET data from FoxyCart API' });
  }
}));

/**
 * Dynamic FoxyCart API Handler
 * Allows client-side to specify the API path and method dynamically
 */
app.all('/foxycart/*', async (req, res) => {
  const { method, body } = req;
  const foxyCartApiUrl = `https://api.foxycart.com${req.path.replace('/foxycart', '')}`; // Construct the API URL

  try {
    // Make the dynamic request to the FoxyCart API
    const response = await fetch(foxyCartApiUrl, {
      method: method.toUpperCase(), // Use the method (GET, POST, PATCH, etc.)
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'FOXY-API-VERSION': '1',
        'client_id': clientId,
        'client_secret': clientSecret,
        'Content-Type': 'application/json',
      },
      body: method === 'POST' || method === 'PATCH' ? JSON.stringify(body) : null, // Add body if it's POST or PATCH
    });

    if (!response.ok) {
      throw new Error(`${method} request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error during FoxyCart API request:', error);
    res.status(500).json({ error: `Failed to ${method} data from FoxyCart API` });
  }
});

/**
 * Route to test token refresh manually
 */
app.get('/refresh-token-test', async (req, res) => {
  try {
    const newAccessToken = await refreshAccessToken();
    res.json({ message: 'Token refreshed successfully', accessToken: newAccessToken });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Health Check Endpoint
app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running.');
});

// Start the Server
app.listen(PORT, () => {
  console.log(`CORS Proxy Server is running on port ${PORT}`);
});
