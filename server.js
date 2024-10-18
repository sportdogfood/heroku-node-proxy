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

app.post('/foxycart/customer/authenticate', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get a new FoxyCart access token
    const accessToken = await refreshToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer/authenticate`;

    // Make the request to FoxyCart for customer authentication
    const data = await makeFoxyCartRequest('POST', apiUrl, accessToken, { email, password });

    // Log the entire response for debugging
    console.log('Authentication response from FoxyCart:', JSON.stringify(data, null, 2));

    // Check if the response contains the necessary session details
    if (data && data.session_token && data.jwt && data.sso) {
      // Authentication succeeded, return the session details
      res.json({
        jwt: data.jwt,
        sso: data.sso,
        session_token: data.session_token,
        expires_in: data.expires_in,
        fc_customer_id: new URLSearchParams(new URL(data.sso).search).get('fc_customer_id'),
        fc_auth_token: new URLSearchParams(new URL(data.sso).search).get('fc_auth_token')
      });
    } else {
      // If authentication fails, log and return a 401 error
      console.error('Authentication failed, invalid response:', JSON.stringify(data));
      res.status(401).json({ error: 'Authentication failed. Invalid email or password.' });
    }
  } catch (error) {
    // Log any errors that occur during the process
    console.error('Error authenticating customer:', error);

    // Return a 500 error with a generic message
    res.status(500).json({ error: 'Error authenticating customer from FoxyCart API' });
  }
});




// Proxy route for calling FoxyCart API to fetch customer details by ID
app.get('/foxycart/customers/:id', async (req, res) => {
  try {
    const customerId = req.params.id;
    const zoomParams = req.query.zoom;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get a new FoxyCart access token
    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/customers/${customerId}?sso=true&zoom=${zoomParams}`;

    // Use the helper function to make the request
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Customer not found or no data returned.' });
    }
  } catch (error) {
    // Log any errors that occur
    console.error('Error fetching customer data:', error);
    res.status(500).json({ error: 'Failed to retrieve customer data from FoxyCart API' });
  }
});

// Route for fetching customer subscriptions
app.get('/foxycart/subscriptions', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    console.log('Received customer_id:', customer_id); // Log customer_id for debugging

    const accessToken = await refreshToken();
    console.log('Access token:', accessToken); // Log accessToken for debugging

    const apiUrl = `https://api.foxycart.com/stores/50526/subscriptions?customer_id=${customer_id}&limit=10`;
    console.log(`Fetching subscriptions for customer ID: ${customer_id} with URL: ${apiUrl}`);

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);
    console.log('Raw data from FoxyCart API:', data); // Log raw data

    if (data._embedded && data._embedded['fx:subscriptions']) {
      // Filter subscriptions to include only active ones (isActive = true)
      const activeSubscriptions = data._embedded['fx:subscriptions'].filter(sub => sub.is_active === true);
      
      if (activeSubscriptions.length > 0) {
        res.json(activeSubscriptions);
      } else {
        res.status(404).json({ error: 'No active subscriptions found.' });
      }
    } else {
      res.status(404).json({ error: 'No subscriptions found.' });
    }
  } catch (error) {
    console.error('Error fetching customer subscriptions:', error);
    res.status(500).json({ error: 'Error fetching customer subscriptions from FoxyCart API' });
  }
});

app.get('/foxycart/carts/:cart_id/items', async (req, res) => {
  try {
    const { cart_id } = req.params;

    if (!cart_id) {
      return res.status(400).json({ error: 'Cart ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/carts/${cart_id}/items`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Cart not found or no items found in the cart.' });
    }
  } catch (error) {
    console.error('Error fetching cart items:', error);
    res.status(500).json({ error: 'Failed to retrieve cart items from FoxyCart API' });
  }
});

app.get('/foxycart/subscriptions/:subscription_id', async (req, res) => {
  try {
    const { subscription_id } = req.params;

    if (!subscription_id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/subscriptions/${subscription_id}`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Subscription not found.' });
    }
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to retrieve subscription from FoxyCart API' });
  }
});

app.get('/foxycart/items/:item_id', async (req, res) => {
  try {
    const { item_id } = req.params;

    if (!item_id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/items/${item_id}`;

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Item not found.' });
    }
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to retrieve item from FoxyCart API' });
  }
});

app.patch('/foxycart/subscriptions/:subscription_id/send_webhooks', async (req, res) => {
  try {
    const { subscription_id } = req.params;

    if (!subscription_id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/subscriptions/${subscription_id}/send_webhooks`;

    const data = await makeFoxyCartRequest('PATCH', apiUrl, accessToken);

    if (data) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Failed to trigger webhook for the subscription.' });
    }
  } catch (error) {
    console.error('Error triggering webhook for subscription:', error);
    res.status(500).json({ error: 'Failed to trigger webhook for subscription from FoxyCart API' });
  }
});


// Route for fetching customer transactions
app.get('/foxycart/transactions', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    console.log('Received customer_id:', customer_id); // Log customer_id for debugging

    const accessToken = await refreshToken();
    console.log('Access token:', accessToken); // Log accessToken for debugging
    
    const apiUrl = `https://api.foxycart.com/stores/50526/transactions?customer_id=${customer_id}&limit=6&zoom=items,items:item_options,items:item_category`;
    console.log(`Fetching transactions for customer ID: ${customer_id} with URL: ${apiUrl}`);

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);
    console.log('Raw data from FoxyCart API:', data); // Log raw data

    // Respond with the complete HAL+JSON response
    res.json(data);
  } catch (error) {
    console.error('Error fetching customer transactions:', error);
    res.status(500).json({ error: 'Error fetching customer transactions from FoxyCart API' });
  }
});

app.post('/foxycart/customer/zoom', async (req, res) => {
  try {
    const { email, jwt } = req.body;

    if (!email || !jwt) {
      return res.status(400).json({ error: 'Email and JWT are required' });
    }

    const accessToken = await refreshToken();

    // Step 1: Fetch customer details with the provided JWT
    const zoomParams = 'default_billing_address,default_shipping_address,default_payment_method';
    const customerUrl = `https://api.foxycart.com/customers?email=${encodeURIComponent(email)}&zoom=${zoomParams}`;
    const customerData = await makeFoxyCartRequest('GET', customerUrl, accessToken, null, jwt);

    if (!customerData || !customerData._embedded || !customerData._embedded['fx:customer']) {
      console.error('Failed to fetch customer data');
      return res.status(404).json({ error: 'Failed to fetch customer data' });
    }

    const customer = customerData._embedded['fx:customer'];
    const fc_customer_id = customer.id;

    // Step 2: Fetch customer transactions
    const transactionsUrl = `https://api.foxycart.com/stores/50526/transactions?customer_id=${fc_customer_id}&limit=6&zoom=items,items:item_options,items:item_category`;
    const transactionsData = await makeFoxyCartRequest('GET', transactionsUrl, accessToken, null, jwt);

    if (!transactionsData) {
      console.error('Failed to fetch transactions');
      return res.status(404).json({ error: 'Failed to fetch transactions' });
    }

    // Step 3: Fetch customer subscriptions
    const subscriptionsUrl = `https://api.foxycart.com/stores/50526/subscriptions?customer_id=${fc_customer_id}&limit=2`;
    const subscriptionsData = await makeFoxyCartRequest('GET', subscriptionsUrl, accessToken, null, jwt);

    if (!subscriptionsData) {
      console.error('Failed to fetch subscriptions');
      return res.status(404).json({ error: 'Failed to fetch subscriptions' });
    }

    // Combine all data into a single response
    const fullData = {
      customer,
      transactions: transactionsData,
      subscriptions: subscriptionsData
    };

    // Respond with combined fullData
    res.json(fullData);
  } catch (error) {
    console.error('Error fetching full customer data:', error);
    res.status(500).json({ error: 'Error fetching full customer data from FoxyCart API' });
  }
});





// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
