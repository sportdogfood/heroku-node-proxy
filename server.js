const express = require('express');
const fetch = require('node-fetch'); // Import fetch for Node.js environments prior to v18
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, fx.customer');
  next();
});

// Function to refresh the FoxyCart access token
async function refreshToken() {
  const refreshResponse = await fetch('https://api.foxycart.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.FOXY_REFRESH_TOKEN,  // Replace with your refresh token from Config Vars
      client_id: process.env.FOXY_CLIENT_ID,          // Replace with your client ID from Config Vars
      client_secret: process.env.FOXY_CLIENT_SECRET,  // Replace with your client secret from Config Vars
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    throw new Error(`Token refresh failed with status ${refreshResponse.status}: ${errorText}`);
  }

  const tokenData = await refreshResponse.json();
  return tokenData.access_token;  // Return the new access token
}

// Helper function to build the query string
function buildQueryString(params) {
  const query = new URLSearchParams(params).toString();
  return query ? `?${query}` : '';
}

// Helper function to handle API requests
async function fetchFromFoxyCart(apiUrl, accessToken, fxCustomer = null) {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'FOXY-API-VERSION': '1',
    'Content-Type': 'application/json',
  };

  if (fxCustomer) {
    headers['fx.customer'] = fxCustomer;
  }

  const apiResponse = await fetch(apiUrl, {
    method: 'GET',
    headers: headers,
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

// Route for customer authentication using email and password
app.post('/foxycart/customer/authenticate', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer/authenticate`;

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API request failed with status ${apiResponse.status}: ${errorText}`);
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error('Error authenticating customer:', error);
    res.status(500).json({ error: 'Error authenticating customer from FoxyCart API' });
  }
});

// Route for fetching customer subscriptions
app.get('/foxycart/customers/subscriptions', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const apiUrl = `https://secure.sportdogfood.com/s/customer/subscriptions?customer_id=${customer_id}&zoom=transaction_template%3Aitems`;

    const data = await fetchFromFoxyCart(apiUrl, accessToken);
    res.json(data);
  } catch (error) {
    console.error('Error fetching customer subscriptions:', error);
    res.status(500).json({ error: 'Error fetching customer subscriptions from FoxyCart API' });
  }
});

// Route for fetching customer transactions
app.get('/foxycart/customers/transactions', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const apiUrl = `https://secure.sportdogfood.com/s/customer/transactions?customer_id=${customer_id}&zoom=items`;

    const data = await fetchFromFoxyCart(apiUrl, accessToken);
    res.json(data);
  } catch (error) {
    console.error('Error fetching customer transactions:', error);
    res.status(500).json({ error: 'Error fetching customer transactions from FoxyCart API' });
  }
});

// Route for fetching SSO customer data with zoom parameters and fx.customer
app.get('/foxycart/customer/sso', async (req, res) => {
  try {
    const { fxCustomer } = req.query;  // Get fx.customer from query params if provided
    if (!fxCustomer) {
      return res.status(400).json({ error: 'fx.customer is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer?sso=true&zoom=default_billing_address,default_shipping_address,default_payment_method,subscriptions,subscriptions:transactions,transactions,transactions:items`;

    const data = await fetchFromFoxyCart(apiUrl, accessToken, fxCustomer);
    res.json(data);
  } catch (error) {
    console.error('Error fetching customer SSO data:', error);
    res.status(500).json({ error: 'Error fetching customer SSO data from FoxyCart API' });
  }
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
