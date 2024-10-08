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
      refresh_token: 'XbuTTBW9R6sRHWvKvnYYuJkpAIYnLaZeKHsjAL1D',  // Replace with your refresh token
      client_id: 'client_gsIC67wRNWDFk9UPUjNV',                      // Replace with your client ID
      client_secret: 'gsGeQmYYlWgk3GPkBLsbmTpq7GSt4lrwHHNi1IQm',      // Replace with your client secret
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

// Route for fetching customer attributes
app.get('/foxycart/customers/:customerId/attributes', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customerId } = req.params;
    const apiUrl = `https://api.foxycart.com/customers/${customerId}/attributes`;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching customer attributes:", error);
    res.status(500).json({ error: 'Error fetching customer attributes from FoxyCart API' });
  }
});

// Route for fetching a specific customer attribute
app.get('/foxycart/customer_attributes/:thisattributeId', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { thisattributeId } = req.params;
    const apiUrl = `https://api.foxycart.com/customer_attributes/${thisattributeId}`;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching customer attribute:", error);
    res.status(500).json({ error: 'Error fetching customer attribute from FoxyCart API' });
  }
});

// Route for fetching customer addresses
app.get('/foxycart/customers/:customerId/addresses', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customerId } = req.params;
    const apiUrl = `https://api.foxycart.com/customers/${customerId}/addresses`;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching customer addresses:", error);
    res.status(500).json({ error: 'Error fetching customer addresses from FoxyCart API' });
  }
});

// Route for default billing address
app.get('/foxycart/customers/:customerId/default_billing_address', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customerId } = req.params;
    const apiUrl = `https://api.foxycart.com/customers/${customerId}/default_billing_address`;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching default billing address:", error);
    res.status(500).json({ error: 'Error fetching default billing address from FoxyCart API' });
  }
});

// Route for default payment method
app.get('/foxycart/customers/:customerId/default_payment_method', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customerId } = req.params;
    const apiUrl = `https://api.foxycart.com/customers/${customerId}/default_payment_method`;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching default payment method:", error);
    res.status(500).json({ error: 'Error fetching default payment method from FoxyCart API' });
  }
});

// Route for default shipping address
app.get('/foxycart/customers/:customerId/default_shipping_address', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customerId } = req.params;
    const apiUrl = `https://api.foxycart.com/customers/${customerId}/default_shipping_address`;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching default shipping address:", error);
    res.status(500).json({ error: 'Error fetching default shipping address from FoxyCart API' });
  }
});

// Route for cart requests with additional query parameters
app.get('/foxycart/carts/:customerId', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customerId } = req.params;
    const query = buildQueryString(req.query);  // Build query string from request parameters
    const apiUrl = `https://api.foxycart.com/carts/${customerId}${query}`;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching cart data:", error);
    res.status(500).json({ error: 'Error fetching cart data from FoxyCart API' });
  }
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
