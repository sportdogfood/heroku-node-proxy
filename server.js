const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Function to refresh the token
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

// Middleware to add CORS headers to the response
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');  // Allow requests from any origin
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');  // Allow methods
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');  // Allow these headers
  next();
});

// Endpoint to fetch default shipping address
app.get('/customers/:id/default_shipping_address', async (req, res) => {
  try {
    const accessToken = await refreshToken();  // Refresh token before the request

    const customerId = req.params.id;
    const apiResponse = await fetch(`https://api.foxycart.com/customers/${customerId}/default_shipping_address`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,  // Include the access token
        'FOXY-API-VERSION': '1',
      },
    });

    const data = await apiResponse.json();  // Parse the response as JSON
    res.json(data);  // Send the data back to the client
  } catch (error) {
    res.status(500).json({ error: 'Error fetching data from FoxyCart API' });  // Handle errors
  }
});

// Set up the server to listen on the correct port
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
