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
      refresh_token: 'XbuTTBW9R6sRHWvKvnYYuJkpAIYnLaZeKHsjAL1D',  // Replace with your refresh token
      client_id: 'client_gsIC67wRNWDFk9UPUjNV',                      // Replace with your client ID
      client_secret: 'gsGeQmYYlWgk3GPkBLsbmTpq7GSt4lrwHHNi1IQm',      // Replace with your client secret
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
  const refreshResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: '1000.0e561ca8a742d446d134a6436e2d04e9.6862bd1eb6787111fc89a044c35b9946',  // Replace with your Zoho refresh token
      client_id: '1000.3VZRY3CC9QGZBXA8IZZ6TWZTZV1H6H',           // Replace with your Zoho client ID
      client_secret: '48dcd0b587246976e9dfcfcc54b10bfb211686cbe4',   // Replace with your Zoho client secret
    }),
  });

  const tokenData = await refreshResponse.json();
  return tokenData.access_token;  // Return the new Zoho access token
}

// Zoho CRM-specific API route with token refresh
app.all('/zoho/:endpoint*', async (req, res) => {
  try {
    const accessToken = await refreshZohoToken();  // Refresh Zoho token before the request
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
//  Generic Proxy Route for Other APIs
// ------------------------------------------------------

// Generic proxy route for other APIs
app.all('/proxy/*', async (req, res) => {
  try {
    const apiUrl = req.params[0];  // Extract the full URL to proxy
    console.log(`Forwarding request to: ${apiUrl}`);  // Log the URL being requested

    const apiResponse = await fetch(apiUrl, {
      method: req.method,
      headers: {
        ...req.headers,  // Forward the original headers (but not Host, to avoid conflicts)
        'Host': undefined,  // Remove the Host header
        'Origin': undefined,  // Remove Origin header to prevent CORS issues
      },
      body: ['POST', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });

    if (!apiResponse.ok) {
      console.log(`API response status: ${apiResponse.status}`);
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    console.log("Generic API response data:", data);
    res.json(data);  // Send data back to the client
  } catch (error) {
    console.error("Error in generic proxy route:", error);
    res.status(500).json({ error: 'Error fetching data from external API' });
  }
});

// ------------------------------------------------------
//  Server Initialization
// ------------------------------------------------------

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
