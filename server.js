// server.js

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fetch = require('node-fetch');
const cors = require('cors');
const URL = require('url').URL;

const app = express();
const PORT = process.env.PORT || 8080;

// Environment Variables
const {
  CLIENT_ID,
  CLIENT_SECRET,
  ACCESS_TOKEN,
  REFRESH_TOKEN,
} = process.env;

// Validate Environment Variables
if (!CLIENT_ID || !CLIENT_SECRET || !ACCESS_TOKEN || !REFRESH_TOKEN) {
  console.error('Missing necessary environment variables. Please check Config Vars.');
  process.exit(1);
}

// CORS Configuration
app.use(cors({
  origin: 'https://www.sportdogfood.com', // **Replace with your actual Webflow site URL without trailing slash**
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * Function to refresh the access token using the refresh token
 */
const refreshAccessToken = async () => {
  const tokenUrl = `https://api.foxycart.com/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', REFRESH_TOKEN);
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);

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
    console.log('Access token refreshed successfully.');
    return data.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
};

/**
 * Middleware to handle authentication and token refresh
 */
let currentAccessToken = ACCESS_TOKEN;
let tokenExpiration = Date.now() + (3600 * 1000); // **Assuming token is valid for 1 hour; adjust based on actual expiration**

const isTokenExpired = () => {
  return Date.now() >= tokenExpiration;
};

// Middleware to attach the current access token to the request
app.use(async (req, res, next) => {
  if (isTokenExpired()) {
    try {
      currentAccessToken = await refreshAccessToken();
      tokenExpiration = Date.now() + (3600 * 1000); // **Reset expiration time; adjust as needed**
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
  target: 'https://api.foxycart.com', // **FoxyCart API base URL**
  changeOrigin: true,
  secure: true,
  pathRewrite: (path, req) => {
    // **Remove the /api prefix when forwarding to FoxyCart**
    return path.replace(/^\/api/, '');
  },
  onProxyReq: (proxyReq, req, res) => {
    // **Inject the Authorization header with the access token**
    proxyReq.setHeader('Authorization', `Bearer ${req.accessToken}`);
    proxyReq.setHeader('FOXY-API-VERSION', '1');
    proxyReq.setHeader('Content-Type', 'application/json');
  },
  onError: (err, req, res) => {
    console.error('API Proxy error:', err);
    res.status(500).json({ error: 'API Proxy encountered an error.' });
  },
  logLevel: 'debug', // **Change to 'info' or 'error' in production**
});

// **Apply the FoxyCart API proxy middleware to all routes starting with /api**
app.use('/api', apiProxy);

/**
 * CORS Anywhere-like Proxy Middleware
 * **This proxies any request to /proxy/* to the target URL provided in the path.**
 * **Example: /proxy/https://example.com/api/data will proxy to https://example.com/api/data**
 */
app.use('/proxy', createProxyMiddleware({
  target: '', // **Target is dynamic based on the request**
  changeOrigin: true,
  secure: true,
  router: (req) => {
    // **Extract the target URL from the request path**
    // **e.g., /proxy/https://example.com/api/data**
    const targetUrl = req.path.replace(/^\/proxy\//, '');
    return targetUrl;
  },
  onProxyReq: (proxyReq, req, res) => {
    // **You can add additional headers here if needed**
    // **For example, to add authentication headers for specific services**
  },
  onError: (err, req, res) => {
    console.error('CORS Proxy error:', err);
    res.status(500).json({ error: 'CORS Proxy encountered an error.' });
  },
  logLevel: 'debug', // **Change to 'info' or 'error' in production**
}));

// **Health Check Endpoint**
app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running.');
});

// **Start the Server**
app.listen(PORT, () => {
  console.log(`CORS Proxy Server is running on port ${PORT}`);
});
