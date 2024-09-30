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
 * Route to test direct GET request to FoxyCart
 */
app.get('/direct-api-test', async (req, res) => {
  try {
    // Refresh token if needed
    const currentAccessToken = await refreshAccessToken();
    
    // Fetch data from FoxyCart API
    const apiUrl = `https://api.foxycart.com/customers/27268981/default_shipping_address`;
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${currentAccessToken}`,
        'FOXY-API-VERSION': '1',
        'client_id': clientId,
        'client_secret': clientSecret
      }
    });

    if (!response.ok) {
      throw new Error(`GET request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error during direct API request:', error);
    res.status(500).json({ error: 'Failed to fetch data from FoxyCart API' });
  }
});

// Health Check Endpoint
app.get('/', (req, res) => {
  res.send('CORS Proxy Server is running.');
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
