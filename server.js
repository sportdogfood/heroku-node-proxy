const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Function to refresh the access token
async function refreshToken() {
  const refreshResponse = await fetch('https://api.foxycart.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: 'XbuTTBW9R6sRHWvKvnYYuJkpAIYnLaZeKHsjAL1D', // Your refresh token
      client_id: 'client_gsIC67wRNWDFk9UPUjNV',                    // Your client ID
      client_secret: 'gsGeQmYYlWgk3GPkBLsbmTpq7GSt4lrwHHNi1IQm',    // Your client secret
    }),
  });

  const tokenData = await refreshResponse.json();
  return tokenData.access_token;  // Return the new access token
}

// Middleware to add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Proxy route for customer details
app.get('/customers/:id', async (req, res) => {
  try {
    const accessToken = await refreshToken();  // Refresh token before the request
    const customerId = req.params.id;
    const apiUrl = `https://api.foxycart.com/customers/${customerId}`;  // Base URL for customer details

    console.log(`Forwarding request to: ${apiUrl}`);  // Log the URL being requested

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
      },
    });

    if (!apiResponse.ok) {
      console.log(`API response status: ${apiResponse.status}`);
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log("API response data:", data);
    res.json(data);  // Send data back to the client
  } catch (error) {
    console.error("Error fetching customer details:", error);
    res.status(500).json({ error: 'Error fetching customer details from FoxyCart API' });
  }
});

// Proxy route for customer shipping and billing addresses
app.get('/customers/:id/:endpoint', async (req, res) => {
  try {
    const accessToken = await refreshToken();  // Refresh token before the request
    const customerId = req.params.id;
    const endpoint = req.params.endpoint;  // Dynamic endpoint (e.g., default_shipping_address)
    const apiUrl = `https://api.foxycart.com/customers/${customerId}/${endpoint}`;

    console.log(`Forwarding request to: ${apiUrl}`);  // Log the URL being requested

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
      },
    });

    if (!apiResponse.ok) {
      console.log(`API response status: ${apiResponse.status}`);
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log("API response data:", data);
    res.json(data);  // Send data back to the client
  } catch (error) {
    console.error("Error in customer address proxy route:", error);
    res.status(500).json({ error: 'Error fetching customer address data from FoxyCart API' });
  }
});

// Proxy route for store details
app.get('/stores/:id', async (req, res) => {
  try {
    const accessToken = await refreshToken();  // Refresh token before the request
    const storeId = req.params.id;
    const apiUrl = `https://api.foxycart.com/stores/${storeId}`;

    console.log(`Forwarding request to: ${apiUrl}`);  // Log the URL being requested

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
      },
    });

    if (!apiResponse.ok) {
      console.log(`API response status: ${apiResponse.status}`);
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log("API response data:", data);
    res.json(data);  // Send data back to the client
  } catch (error) {
    console.error("Error in store proxy route:", error);
    res.status(500).json({ error: 'Error fetching store details from FoxyCart API' });
  }
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
