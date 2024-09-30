const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');

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
 * General Proxy Middleware
 * This allows the proxy to handle requests to any external service (non-FoxyCart)
 */
app.use('/proxy', createProxyMiddleware({
  target: '', // Target will be dynamically changed based on request
  changeOrigin: true,
  secure: true,
  router: (req) => {
    const targetUrl = req.path.replace(/^\/proxy\//, '');
    console.log(`Proxying request to: ${targetUrl}`);
    return targetUrl;
  },
  onError: (err, req, res) => {
    console.error('CORS Proxy error:', err);
    res.status(500).json({ error: 'CORS Proxy encountered an error.' });
  },
  logLevel: 'debug', // Change to 'info' or 'error' in production
}));

/**
 * Route to test token refresh manually
 * Now returns all env variables including client_id, client_secret, and refresh_token
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

// Health Check Endpoint
app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running.');
});

// Start the Server
app.listen(PORT, () => {
  console.log(`CORS Proxy Server is running on port ${PORT}`);
});
