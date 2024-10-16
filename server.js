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

// Helper function to make API requests to FoxyCart
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
    return apiResponse.json();
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
    return backupResponse.json();
  }
}

// Route handlers
app.all('/foxycart/*', async (req, res) => {
  try {
    const accessToken = await refreshToken();
    const method = req.method;
    const apiUrl = `https://api.foxycart.com${req.path.replace('/foxycart', '')}`;
    const fxCustomer = req.headers['fx.customer'] || null;
    const body = ['POST', 'PATCH', 'PUT'].includes(method) ? req.body : null;

    const data = await makeFoxyCartRequest(method, apiUrl, accessToken, body, fxCustomer);
    res.json(data);
  } catch (error) {
    console.error(`Error handling request for ${req.path}:`, error);
    res.status(500).json({ error: `Error handling request for ${req.path}` });
  }
});
// Route to search customers by email
// Route to search customers by email
app.get('/foxycart/customers/email', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Ensure the email is URL-encoded
    const encodedEmail = encodeURIComponent(email);
    
    // Refresh the access token
    const accessToken = await refreshToken();
    
    // Construct the API URL
    const apiUrl = `https://api.foxycart.com/stores/50526/customers?email=${encodedEmail}`;

    console.log(`Sending request to FoxyCart API: ${apiUrl}`);
    
    // Fetch data from FoxyCart API
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'FOXY-API-VERSION': '1',
        'Content-Type': 'application/json',
      }
    });

    // Log the response status and body
    const responseText = await response.text();
    console.log(`FoxyCart API Response Status: ${response.status}`);
    console.log(`FoxyCart API Response Body: ${responseText}`);

    // Check if the response is OK
    if (!response.ok) {
      throw new Error(`FoxyCart API returned an error: ${response.status} - ${response.statusText}`);
    }

    // Parse and send the JSON response
    const data = JSON.parse(responseText);
    res.json(data);

  } catch (error) {
    console.error(`Error searching customer by email:`, error);
    res.status(500).json({ error: `Error searching customer by email: ${error.message}` });
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
    res.json(data);
  } catch (error) {
    console.error(`Error searching customer by fx_customer_id:`, error);
    res.status(500).json({ error: 'Error searching customer by fx_customer_id' });
  }
});

// Specific routes for customer authentication, subscriptions, transactions, and other established routes
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

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);
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

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);
    res.json(data);
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
    res.json(data);
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

    const accessToken = await refreshToken();  // Ensure this function is working
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