// server.js

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
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

// Middleware to attach the current access token to the request
app.use(async (req, res, next) => {
  if (isTokenExpired()) {
    try {
      currentAccessToken = await refreshAccessToken();
      tokenExpiration = Date.now() + (3600 * 1000); // Reset expiration time; adjust as needed
      console.log('Access token updated.');
    } catch (error) {
      return res.status(500).json({ error: 'Failed to refresh access token.' });
    }
  }
  req.accessToken = currentAccessToken;
  next();
});

/**
 * Proxy Middleware Configuration for FoxyCart API
 */
const apiProxy = createProxyMiddleware({
  target: 'https://api.foxycart.com', // FoxyCart API base URL
  changeOrigin: true,
  secure: true,
  pathRewrite: (path, req) => {
    // Remove the /api prefix when forwarding to FoxyCart
    const rewrittenPath = path.replace(/^\/api/, '');
    console.log(`Proxying to FoxyCart API: ${rewrittenPath}`);
    return rewrittenPath;
  },
  onProxyReq: (proxyReq, req, res) => {
    // Inject the Authorization header with the access token
    proxyReq.setHeader('Authorization', `Bearer ${req.accessToken}`);
    proxyReq.setHeader('FOXY-API-VERSION', '1');
    proxyReq.setHeader('Content-Type', 'application/json');
    console.log(`Added Authorization header: Bearer ${req.accessToken}`);
    console.log(`Set FOXY-API-VERSION header: 1`);
  },
  onError: (err, req, res) => {
    console.error('API Proxy error:', err);
    res.status(500).json({ error: 'API Proxy encountered an error.' });
  },
  logLevel: 'debug', // Change to 'info' or 'error' in production
});

// Apply the FoxyCart API proxy middleware to all routes starting with /api
app.use('/api', apiProxy);

/**
 * CORS Anywhere-like Proxy Middleware
 * This proxies any request to /proxy/* to the target URL provided in the path.
 * Example: /proxy/https://example.com/api/data will proxy to https://example.com/api/data
 */
app.use('/proxy', createProxyMiddleware({
  target: '', // Target is dynamic based on the request
  changeOrigin: true,
  secure: true,
  router: (req) => {
    // Extract the target URL from the request path
    const targetUrl = req.path.replace(/^\/proxy\//, '');
    console.log(`Proxying to External URL: ${targetUrl}`);
    return targetUrl;
  },
  onProxyReq: (proxyReq, req, res) => {
    // You can add additional headers here if needed
    // For example, to add authentication headers for specific services
  },
  onError: (err, req, res) => {
    console.error('CORS Proxy error:', err);
    res.status(500).json({ error: 'CORS Proxy encountered an error.' });
  },
  logLevel: 'debug', // Change to 'info' or 'error' in production
}));

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
