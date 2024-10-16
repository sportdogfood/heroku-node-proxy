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
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, fx.customer');
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

// Route handlers

// Route for customer authentication using email and password
app.post('/foxycart/customer/authenticate', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer/authenticate`;

    const data = await makeFoxyCartRequest('POST', apiUrl, accessToken, { email, password });

    if (data._embedded && data._embedded['fx:session']) {
      const session = data._embedded['fx:session'];

      res.json({
        jwt: session.jwt,
        sso: session.sso,
        session_token: session.session_token,
        expires_in: session.expires_in,
        fc_customer_id: session.fc_customer_id,
        fc_auth_token: session.fc_auth_token
      });
    } else {
      res.status(401).json({ error: 'Authentication failed. Invalid email or password.' });
    }
  } catch (error) {
    console.error('Error authenticating customer:', error);
    res.status(500).json({ error: 'Error authenticating customer from FoxyCart API' });
  }
});

// Route to search customers by fx_customer_id
app.get('/foxycart/customers/id', async (req, res) => {
  try {
    const { fx_customer_id } = req.query;

    if (!fx_customer_id) {
      return res.status(400).json({ error: 'fx_customer_id is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/customers/${fx_customer_id}`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data._embedded && data._embedded['fx:customers']) {
      const customer = data._embedded['fx:customers'][0];  // Access first customer
      res.json(customer);
    } else {
      res.status(404).json({ error: 'Customer not found.' });
    }
  } catch (error) {
    console.error(`Error searching customer by fx_customer_id:`, error);
    res.status(500).json({ error: 'Error searching customer by fx_customer_id' });
  }
});

// Route for fetching customer subscriptions
app.get('/foxycart/customers/subscriptions', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer/subscriptions?customer_id=${customer_id}&zoom=transaction_template%3Aitems`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data._embedded && data._embedded['fx:subscriptions']) {
      const subscriptions = data._embedded['fx:subscriptions'];
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
    const apiUrl = `https://secure.sportdogfood.com/s/customer/transactions?customer_id=${customer_id}&zoom=items`;

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

// Route to update customer data
app.patch('/foxycart/customers/:id', async (req, res) => {
  try {
    const customerId = req.params.id;
    const updatedData = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/customers/${customerId}`;

    const data = await makeFoxyCartRequest('PATCH', apiUrl, accessToken, updatedData);

    if (data._embedded && data._embedded['fx:customer']) {
      res.json(data._embedded['fx:customer']);  // Return updated customer data
    } else {
      res.status(400).json({ error: 'Customer update failed.' });
    }
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route for fetching SSO customer data with zoom parameters and fx.customer
app.get('/foxycart/customer/sso', async (req, res) => {
  try {
    const { fxCustomer } = req.query;
    if (!fxCustomer) {
      return res.status(400).json({ error: 'fx.customer is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer?sso=true&zoom=default_billing_address,default_shipping_address,default_payment_method,subscriptions,subscriptions:transactions,transactions,transactions:items`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken, null, fxCustomer);
    res.json(data);
  } catch (error) {
    console.error('Error fetching SSO customer data:', error);
    res.status(500).json({ error: 'Error fetching SSO customer data from FoxyCart API' });
  }
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
