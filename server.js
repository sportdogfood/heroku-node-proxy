const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Storing Zoho tokens
let zohoAccessToken = '1000.94bf57a9a6ac9ce3798fff8b9a3e9691.6c07a030a6fdd9009e916b8719f50b10';
let zohoRefreshToken = '1000.e43807d9c5e727bccf0e3e984a88ce2e.1e2cd45ab2af3b8752abfc1e5c00c35b';

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

// ------------------------------------------------------
//  FoxyCart API Section
// ------------------------------------------------------

// Function to refresh the FoxyCart access token
async function refreshFoxyToken() {
  const refreshResponse = await fetch('https://api.foxycart.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: '1000.d4af8517a8417c1e2c7a6011cbe373de.be05fe8c3ae49fa7dbb65f22c8bb00dd',  // Replace with your refresh token
      client_id: '1000.3VZRY3CC9QGZBXA8IZZ6TWZTZV1H6H',                      // Replace with your client ID
      client_secret: '48dcd0b587246976e9dfcfcc54b10bfb211686cbe4',      // Replace with your client secret
    }),
  });

  const tokenData = await refreshResponse.json();
  return tokenData.access_token;  // Return the new access token
}

// FoxyCart-specific API route with token refresh
app.all('/foxycart/:endpoint*', async (req, res) => {
  try {
    const accessToken = await refreshFoxyToken();  // Refresh FoxyCart token before the request
    const endpoint = req.params.endpoint + (req.params[0] || '');  // Support dynamic subpaths
    const apiUrl = `https://api.foxycart.com/${endpoint}`;

    console.log(`Forwarding request to: ${apiUrl}`);  // Log the URL being requested

    const apiResponse = await fetch(apiUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': req.get('Content-Type') || 'application/json',
      },
      body: ['POST', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });

    if (!apiResponse.ok) {
      console.log(`API response status: ${apiResponse.status}`);
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log("FoxyCart API response data:", data);
    res.json(data);  // Send data back to the client
  } catch (error) {
    console.error("Error in FoxyCart API proxy route:", error);
    res.status(500).json({ error: 'Error fetching data from FoxyCart API' });
  }
});

// ------------------------------------------------------
//  Zoho CRM API Section
// ------------------------------------------------------

// Function to refresh the Zoho CRM access token
async function refreshZohoToken() {
  try {
    const refreshResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: zohoRefreshToken,  // Using stored refresh token
        client_id: '1000.3VZRY3CC9QGZBXA8IZZ6TWZTZV1H6H',  // Your Zoho client ID
        client_secret: '48dcd0b587246976e9dfcfcc54b10bfb211686cbe4',  // Your Zoho client secret
      }),
    });

    const tokenData = await refreshResponse.json();
    
    // Check if the access token was successfully received
    if (tokenData.access_token) {
      console.log('Zoho access token refreshed:', tokenData.access_token);
      zohoAccessToken = tokenData.access_token;  // Update the access token in memory
      return zohoAccessToken;
    } else {
      console.error('Error refreshing Zoho token:', tokenData);
      throw new Error('Failed to refresh Zoho access token');
    }
  } catch (error) {
    console.error('Error refreshing Zoho access token:', error);
    throw error;
  }
}


// Zoho CRM-specific API route with token refresh
app.all('/zoho/:endpoint*', async (req, res) => {
  try {
    const accessToken = zohoAccessToken || await refreshZohoToken();  // Use existing token or refresh if needed
    const endpoint = req.params.endpoint + (req.params[0] || '');  // Support dynamic subpaths
    const apiUrl = `https://www.zohoapis.com/crm/v2/${endpoint}`;  // Zoho CRM API base URL

    console.log(`Forwarding request to: ${apiUrl}`);  // Log the full API URL

    const apiResponse = await fetch(apiUrl, {
      method: req.method,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': req.get('Content-Type') || 'application/json',
      },
      body: ['POST', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.log(`Zoho API response status: ${apiResponse.status}, body: ${errorText}`);
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log("Zoho CRM API response data:", data);
    res.json(data);  // Send data back to the client
  } catch (error) {
    console.error("Error in Zoho CRM API proxy route:", error);
    res.status(500).json({ error: 'Error fetching data from Zoho CRM API' });
  }
});

// ------------------------------------------------------
//  Webhook Proxy Route for Zoho Flow
// ------------------------------------------------------

app.post('/webhook', async (req, res) => {
  try {
    const webhookUrl = 'https://flow.zoho.com/681603876/flow/webhook/incoming?zapikey=1001.f200c297788af43ff53e2ad8eb84e06f.19c02d61915242576e3b5be4c21d300f&isdebug=false';
    
    // Forward the webhook request
    const apiResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!apiResponse.ok) {
      console.log(`Webhook response status: ${apiResponse.status}`);
      throw new Error(`Webhook request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log("Webhook response data:", data);
    res.json(data);  // Return webhook response to the client
  } catch (error) {
    console.error("Error in webhook route:", error);
    res.status(500).json({ error: 'Error sending webhook' });
  }
});

// ------------------------------------------------------
//  Server Initialization
// ------------------------------------------------------

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
