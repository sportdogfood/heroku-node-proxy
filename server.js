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
  origin: '*', // Allow all origins for testing, but restrict this in production
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
 * Dynamic FoxyCart API Handler with Proxy
 * Allows client-side to specify the API path and method dynamically
 */
app.use('/foxycart', async (req, res, next) => {
  try {
    // Refresh the token before proceeding with the proxy request
    const accessToken = await refreshAccessToken();

    createProxyMiddleware({
      target: 'https://api.foxycart.com',
      changeOrigin: true,
      secure: true,
      pathRewrite: {
        '^/foxycart': '', // Remove '/foxycart' prefix before sending the request to FoxyCart
      },
      onProxyReq: (proxyReq) => {
        // Attach the Authorization header with the refreshed access token
        proxyReq.setHeader('Authorization', `Bearer ${accessToken}`);
        proxyReq.setHeader('FOXY-API-VERSION', '1');
        proxyReq.setHeader('Content-Type', 'application/json');
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers to the proxied response
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      },
      onError: (err) => {
        console.error('API Proxy error:', err);
        res.status(500).json({ error: 'Failed to process request through proxy.' });
      },
      logLevel: 'debug', // Keep log level at debug for troubleshooting
    })(req, res, next); // Apply the proxy middleware to the request
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token before proxy request.' });
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
