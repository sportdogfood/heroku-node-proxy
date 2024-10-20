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



// Route for direct email search 
app.get('/foxycart/customers/find', async (req, res) => {
  try {
    // Extract the email address from the query parameter
    const email = req.query.email;
    
    // If email is not provided, return an error response
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const encodedEmail = encodeURIComponent(email);  // Encode the email for safe URL use
    const apiUrl = `https://api.foxycart.com/stores/50526/customers?email=${encodedEmail}`;

    // Make the request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data was returned and embedded customers exist
    if (data && data._embedded && data._embedded['fx:customers'] && data._embedded['fx:customers'].length > 0) {
      const customers = data._embedded['fx:customers'];
      return res.json(customers);  // Return customers if found
    } else if (data && data.total_items === 0) {
      return res.status(404).json({ error: 'No customer found with the given email address.' });
    } else {
      return res.status(404).json({ error: 'No customer found or no data returned.' });
    }
  } catch (error) {
    console.error('Error searching for customer by email:', error);
    return res.status(500).json({ error: 'Failed to search for customer data from FoxyCart API' });
  }
});



// Helper function to get a cached or new access token
async function getCachedOrNewAccessToken() {
  if (!global.accessToken || tokenIsExpired(global.accessToken)) {
    // Fetch a new token if no valid token is stored or it's expired
    global.accessToken = await refreshToken();
    global.accessToken.expires_at = Date.now() + 3600 * 1000; // Token valid for 1 hour (set appropriately)
  }
  return global.accessToken.token; // Return the valid token
}

// Helper function to check if the token is expired
function tokenIsExpired(token) {
  // Check if the token is expired based on current time and stored expiry
  return !token || token.expires_at < Date.now();
}

// Function to refresh the FoxyCart access token
async function refreshToken() {
  try {
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
    return {
      token: tokenData.access_token,
      expires_at: Date.now() + tokenData.expires_in * 1000  // Calculate the expiry time based on the token's life
    };
  } catch (error) {
    console.error('Failed to refresh token:', error);
    throw error;
  }
}


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

// Proxy route for calling FoxyCart API to fetch customer details by ID
app.get('/foxycart/customers/foxyapi/:id', async (req, res) => {
  try {
    const customerId = req.params.id;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get a new FoxyCart access token
    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/customers/${customerId}?sso=true`;

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

// Proxy route for calling FoxyCart API to fetch customer details by ID
app.get('/foxycart/customers/foxyapi/:id', async (req, res) => {
  try {
    const customerId = req.params.id;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get a new FoxyCart access token
    const accessToken = await refreshToken();
    const apiUrl = `https://api.foxycart.com/customers/${customerId}?sso=true`;

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

    console.log('Received customer_id:', customer_id);

    const accessToken = await refreshToken();
    console.log('Access token:', accessToken);

    const apiUrl = `https://api.foxycart.com/stores/50526/subscriptions?customer_id=${customer_id}&is_active=true`;
    console.log(`Fetching subscriptions for customer ID: ${customer_id} with URL: ${apiUrl}`);

    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);
    console.log('Raw data from FoxyCart API:', JSON.stringify(data, null, 2));

    // Extracting total_items from the response
    const totalItems = data.total_items || 0; // Default to 0 if total_items is not present

    if (data._embedded && data._embedded['fx:subscriptions']) {
      const activeSubscriptions = data._embedded['fx:subscriptions'].filter(sub => sub.is_active === true);

      if (activeSubscriptions.length > 0) {
        // Include total_items in the response along with active subscriptions
        res.json({
          total_items: totalItems,
          subscriptions: activeSubscriptions
        });
      } else {
        // Return empty subscriptions but include total_items to indicate count
        res.status(200).json({
          total_items: totalItems,
          subscriptions: []
        });
      }
    } else {
      // Return an empty subscriptions array but include total_items to indicate count
      res.status(200).json({
        total_items: totalItems,
        subscriptions: []
      });
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

    // Use the same logic to get a cached or refreshed access token
    const accessToken = await getCachedOrNewAccessToken();  
    console.log('Access token:', accessToken); // Log accessToken for debugging

    // Construct the FoxyCart API URL for transactions
    const apiUrl = `https://api.foxycart.com/stores/50526/transactions?customer_id=${customer_id}&limit=6&zoom=items,items:item_options,items:item_category`;
    console.log(`Fetching transactions for customer ID: ${customer_id} with URL: ${apiUrl}`);

    // Make request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);
    console.log('Raw data from FoxyCart API:', JSON.stringify(data, null, 2)); // Log raw data for clarity

    // Extract total_items from the response
    const totalItems = data.total_items || 0; // Default to 0 if total_items is not present

    if (data._embedded && data._embedded['fx:transactions']) {
      const transactions = data._embedded['fx:transactions'];

      if (transactions.length > 0) {
        // Include total_items in the response along with transactions
        res.json({
          total_items: totalItems,
          transactions: transactions
        });
      } else {
        // Return empty transactions but include total_items to indicate count
        res.status(200).json({
          total_items: totalItems,
          transactions: []
        });
      }
    } else {
      // Return an empty transactions array but include total_items to indicate count
      res.status(200).json({
        total_items: totalItems,
        transactions: []
      });
    }
  } catch (error) {
    console.error('Error fetching customer transactions:', error);
    res.status(500).json({ error: 'Error fetching customer transactions from FoxyCart API' });
  }
});


app.post('/foxycart/customer/fetch_customer', async (req, res) => {
  try {
    console.log('Incoming /fetch request body:', req.body);

    const { fc_customer_id, jwt } = req.body;

    if (!fc_customer_id || !jwt) {
      return res.status(400).json({ error: 'Customer ID and JWT are required' });
    }

    const accessToken = await refreshToken();

    // Fetch customer details with the provided JWT
    const customerUrl = `https://api.foxycart.com/customers/${fc_customer_id}?sso=true`;
    const customerData = await makeFoxyCartRequest('GET', customerUrl, accessToken, null);

    if (!customerData) {
      console.error('Failed to fetch customer data: No response');
      return res.status(404).json({ error: 'Failed to fetch customer data' });
    }

    // Respond with customer data
    res.json(customerData);
  } catch (error) {
    console.error('Error fetching customer data:', error);
    res.status(500).json({ error: 'Error fetching customer data from FoxyCart API' });
  }
});

app.post('/foxycart/customer/fetch_transactions', async (req, res) => {
  try {
    console.log('Incoming /transactions request body:', req.body);

    const { fc_customer_id } = req.body;

    if (!fc_customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const accessToken = await refreshToken();

    // Fetch customer transactions
    const transactionsUrl = `https://api.foxycart.com/stores/50526/transactions?customer_id=${fc_customer_id}&limit=6&zoom=items,items:item_options,items:item_category`;
    const transactionsData = await makeFoxyCartRequest('GET', transactionsUrl, accessToken);

    if (!transactionsData || !transactionsData._embedded || !transactionsData._embedded['fx:transaction']) {
      console.error('Failed to fetch transactions or no transactions found');
      return res.status(404).json({ error: 'Failed to fetch transactions or no transactions found' });
    }

    // Respond with transactions data
    res.json(transactionsData._embedded['fx:transaction']);
  } catch (error) {
    console.error('Error fetching transactions data:', error);
    res.status(500).json({ error: 'Error fetching transactions data from FoxyCart API' });
  }
});

app.post('/foxycart/customer/fetch_subscriptions', async (req, res) => {
  try {
    console.log('Incoming /subscriptions request body:', req.body);

    const { fc_customer_id } = req.body;

    if (!fc_customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const accessToken = await refreshToken();

    // Fetch customer subscriptions
    const subscriptionsUrl = `https://api.foxycart.com/stores/50526/subscriptions?customer_id=${fc_customer_id}&limit=2`;
    const subscriptionsData = await makeFoxyCartRequest('GET', subscriptionsUrl, accessToken);

    if (!subscriptionsData || !subscriptionsData._embedded || !subscriptionsData._embedded['fx:subscription']) {
      console.error('Failed to fetch subscriptions or no subscriptions found');
      return res.status(404).json({ error: 'Failed to fetch subscriptions or no subscriptions found' });
    }

    // Respond with subscriptions data
    res.json(subscriptionsData._embedded['fx:subscription']);
  } catch (error) {
    console.error('Error fetching subscriptions data:', error);
    res.status(500).json({ error: 'Error fetching subscriptions data from FoxyCart API' });
  }
});




// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
