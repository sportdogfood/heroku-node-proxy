const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, fx-customer');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Handle OPTIONS preflight requests
app.options('*', (req, res) => {
  res.sendStatus(200);
});

// Function to refresh the FoxyCart access token
async function refreshToken() {
  const refreshResponse = await fetch('https://api.foxycart.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.FOXY_REFRESH_TOKEN,
      client_id: process.env.FOXY_CLIENT_ID,
      client_secret: process.env.FOXY_CLIENT_SECRET,
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    throw new Error(`Token refresh failed with status ${refreshResponse.status}: ${errorText}`);
  }

  const tokenData = await refreshResponse.json();
  return tokenData.access_token;
}

// Helper function to make API requests to FoxyCart (handle HAL responses)
async function makeFoxyCartRequest(method, endpoint, accessToken, body = null, fxCustomer = null) {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'FOXY-API-VERSION': '1',
    'Content-Type': 'application/json',
  };

  if (fxCustomer) {
    headers['fx.customer'] = fxCustomer;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const apiResponse = await fetch(endpoint, options);
    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    // Handle HAL response
    const data = await apiResponse.json();
    return data;  // Return raw data (we'll process in individual routes)
  } catch (error) {
    console.error(`Error with primary endpoint (${endpoint}):`, error);

    // Retry with secondary endpoint if the primary fails
    const backupEndpoint = endpoint.replace('https://secure.sportdogfood.com', 'https://api.foxycart.com');
    console.log(`Retrying with backup endpoint: ${backupEndpoint}`);
    const backupResponse = await fetch(backupEndpoint, options);

    if (!backupResponse.ok) {
      const errorText = await backupResponse.text();
      throw new Error(`Backup API request failed with status ${backupResponse.status}: ${errorText}`);
    }
    const backupData = await backupResponse.json();
    return backupData;  // Return raw data (we'll process in individual routes)
  }
}

// Route for fetching customer subscriptions
app.get('/foxycart/customers/subscriptions', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/stores/50526/subscriptions?customer_id=${customer_id}&limit=2`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data._embedded && data._embedded['fx:subscriptions']) {
      const subscriptions = data._embedded['fx:subscriptions'].filter(subscription => subscription.is_active);
      res.json(subscriptions);
    } else {
      res.status(404).json({ error: 'No subscriptions found.' });
    }
  } catch (error) {
    console.error('Error fetching customer subscriptions:', error);
    res.status(500).json({ error: 'Error fetching customer subscriptions from FoxyCart API' });
  }
});

// Route for fetching customer transactions
app.get('/foxycart/customers/transactions', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/stores/50526/transactions?customer_id=${customer_id}&limit=10&zoom=items`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data._embedded && data._embedded['fx:transactions']) {
      const transactions = data._embedded['fx:transactions'];
      res.json(transactions);
    } else {
      res.status(404).json({ error: 'No transactions found.' });
    }
  } catch (error) {
    console.error('Error fetching customer transactions:', error);
    res.status(500).json({ error: 'Error fetching customer transactions from FoxyCart API' });
  }
});

// Route for fetching customer carts
app.get('/foxycart/customers/carts', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/stores/50526/carts?customer_id=${customer_id}`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data._embedded && data._embedded['fx:carts']) {
      const carts = data._embedded['fx:carts'];
      res.json(carts);
    } else {
      res.status(404).json({ error: 'No carts found.' });
    }
  } catch (error) {
    console.error('Error fetching customer carts:', error);
    res.status(500).json({ error: 'Error fetching customer carts from FoxyCart API' });
  }
});

// PUT route for updating customer details
app.put('/foxycart/customers/:id', async (req, res) => {
  try {
    const customerId = req.params.id;
    const customerData = req.body;

    if (!customerId || !customerData) {
      return res.status(400).json({ error: 'Customer ID and data are required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/customers/${customerId}`;

    const data = await makeFoxyCartRequest('PUT', apiUrl, accessToken, customerData);
    res.json(data);
  } catch (error) {
    console.error('Error updating customer details:', error);
    res.status(500).json({ error: 'Failed to update customer details in FoxyCart API' });
  }
});

// PUT route for updating subscriptions
app.put('/foxycart/subscriptions/:id', async (req, res) => {
  try {
    const subscriptionId = req.params.id;
    const subscriptionData = req.body;

    if (!subscriptionId || !subscriptionData) {
      return res.status(400).json({ error: 'Subscription ID and data are required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/subscriptions/${subscriptionId}`;

    const data = await makeFoxyCartRequest('PUT', apiUrl, accessToken, subscriptionData);
    res.json(data);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription in FoxyCart API' });
  }
});

// PUT route for updating carts
app.put('/foxycart/carts/:id', async (req, res) => {
  try {
    const cartId = req.params.id;
    const cartData = req.body;

    if (!cartId || !cartData) {
      return res.status(400).json({ error: 'Cart ID and data are required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/carts/${cartId}`;

    const data = await makeFoxyCartRequest('PUT', apiUrl, accessToken, cartData);
    res.json(data);
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ error: 'Failed to update cart in FoxyCart API' });
  }
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
