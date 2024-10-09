
// Server-Side Script (server.js on Heroku)
const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Function to refresh the FoxyCart access token
async function refreshToken() {
  const refreshResponse = await fetch('https://api.foxycart.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.FOXY_REFRESH_TOKEN,  // Use environment variables for sensitive information
      client_id: process.env.FOXY_CLIENT_ID,
      client_secret: process.env.FOXY_CLIENT_SECRET,
    }),
  });

  const tokenData = await refreshResponse.json();
  return tokenData.access_token;  // Return the new access token
}

// Helper function to build the query string
function buildQueryString(params) {
  const query = new URLSearchParams(params).toString();
  return query ? `?${query}` : '';
}

// Helper function to handle API requests
async function fetchFromFoxyCart(apiUrl, accessToken) {
  const apiResponse = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'FOXY-API-VERSION': '1',
      'Content-Type': 'application/json',
    }
  });
  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`API request failed with status ${apiResponse.status}: ${errorText}`);
  }
  return apiResponse.json();
}

// Generic route handler for customer-related data
app.get('/foxycart/*', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com${req.path.replace('/foxycart', '')}${buildQueryString(req.query)}`;
    const data = await fetchFromFoxyCart(apiUrl, accessToken);
    res.json(data);
  } catch (error) {
    console.error(`Error fetching data for ${req.path}:`, error);
    res.status(500).json({ error: `Error fetching data from FoxyCart API for ${req.path}` });
  }
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});