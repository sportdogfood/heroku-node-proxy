const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors'); // Import cors
const morgan = require('morgan'); // For logging
const app = express();
require('dotenv').config();

// Use morgan for logging HTTP requests
app.use(morgan('combined'));

// Use the cors middleware
app.use(cors({
  origin: '*', // Replace '*' with specific origins if needed
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'],
}));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to check if the token is expired
function tokenIsExpired(token) {
  return !token || token.expires_at < Date.now();
}

// Helper function to get a cached or new access token
async function getCachedOrNewAccessToken() {
  if (!global.accessToken || tokenIsExpired(global.accessToken)) {
    // Fetch a new token if no valid token is stored or it's expired
    global.accessToken = await refreshToken();
  }
  return global.accessToken.token; // Return the valid token
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
      expires_at: Date.now() + tokenData.expires_in * 1000, // Calculate the expiry time
    };
  } catch (error) {
    console.error('Failed to refresh token:', error);
    throw error;
  }
}

// Function to make API requests to FoxyCart (handle HAL responses)
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
    return data; // Return raw data (process in routes)
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
    return backupData; // Return raw data (process in routes)
  }
}

// Example Route
app.post('/foxycart/customer/authenticate', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get a new FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();
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

// Updated Route for Authenticating Admin Using Request Body (POST)
app.post('/foxycart/customer/adminauth', async (req, res) => {
  try {
    const { email } = req.body; // Extract email from the request body

    // Check if email is provided
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Retrieve the unified password from environment or default value
    const password = process.env.UNIFIED || 'fFkwg2uWmg4Z89PUr3sP';
    if (!password) {
      return res.status(500).json({ error: 'Server configuration error: missing unified password' });
    }

    // Get a new FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer/authenticate`;

    // Make the request to FoxyCart for admin authentication
    const data = await makeFoxyCartRequest('POST', apiUrl, accessToken, { email, password });

    // Log the response for debugging
    console.log('Admin Authentication response from FoxyCart:', JSON.stringify(data, null, 2));

    // Check if response contains necessary session details
    if (data && data.session_token && data.jwt && data.sso) {
      res.json({
        jwt: data.jwt,
        sso: data.sso,
        session_token: data.session_token,
        expires_in: data.expires_in,
        fc_customer_id: new URLSearchParams(new URL(data.sso).search).get('fc_customer_id'),
        fc_auth_token: new URLSearchParams(new URL(data.sso).search).get('fc_auth_token')
      });
    } else {
      console.error('Authentication failed, invalid response:', JSON.stringify(data));
      res.status(401).json({ error: 'Authentication failed. Invalid email or unified credential.' });
    }
  } catch (error) {
    console.error('Error authenticating admin:', error);
    res.status(500).json({ error: 'Error authenticating admin from FoxyCart API' });
  }
});


// New Route for Authenticating Admin via Query Parameters
app.get('/foxycart/customers/admin', async (req, res) => {
  try {
    const { email, admin } = req.query; // Extract email and admin flag from query parameters

    // Check if email and admin flag are provided
    if (!email || admin !== 'true') {
      return res.status(400).json({ error: 'Valid email and admin flag are required' });
    }

    // Retrieve the unified password directly for simplicity
    const password = process.env.UNIFIED || 'fFkwg2uWmg4Z89PUr3sP';
    if (!password) {
      return res.status(500).json({ error: 'Server configuration error: missing unified password' });
    }

    // Get a new FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://secure.sportdogfood.com/s/customer/authenticate`;

    // Make the request to FoxyCart for admin authentication
    const data = await makeFoxyCartRequest('POST', apiUrl, accessToken, { email, password });

    // Log the entire response for debugging purposes
    console.log('Admin Authentication response from FoxyCart:', JSON.stringify(data, null, 2));

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
      res.status(401).json({ error: 'Authentication failed. Invalid email or unified credential.' });
    }
  } catch (error) {
    // Log any errors that occur during the process
    console.error('Error authenticating admin:', error);

    // Return a 500 error with a generic message
    res.status(500).json({ error: 'Error authenticating admin from FoxyCart API' });
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


// Proxy route for calling FoxyCart API to fetch customer details by ID
app.get('/foxycart/customers/:id', async (req, res) => {
  try {
    const customerId = req.params.id;
    const zoomParams = req.query.zoom;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${customerId}?sso=true&zoom=${zoomParams || ''}`;

    // Make the request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data) {
      res.json(data);  // Return customer data if found
    } else {
      res.status(404).json({ error: 'Customer not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching customer data:', error);
    res.status(500).json({ error: 'Failed to retrieve customer data from FoxyCart API' });
  }
});

// Route for fetching customer attributes by customerId
app.get('/foxycart/customers/:customerId/attributes', async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/attributes`;

    // Make the request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data) {
      res.json(data); // Return the customer attributes if found
    } else {
      res.status(404).json({ error: 'Customer attributes not found.' });
    }
  } catch (error) {
    console.error('Error fetching customer attributes:', error);
    res.status(500).json({ error: 'Failed to retrieve customer attributes from FoxyCart API' });
  }
});

// Route for fetching specific customer CRM ID attribute
app.get('/foxycart/customers/:customerId/attributes/attributes/crm', async (req, res) => {
  try {
    const { customerId } = req.params;

    // Check if customerId is provided
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/attributes`;

    // Make the request to FoxyCart API to get customer attributes
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data and the attributes are returned successfully
    if (data && data._embedded && data._embedded['fx:attributes']) {
      const attributes = data._embedded['fx:attributes'];

      // Initialize the result object to store CRM ID
      let crmId = {};

      // Loop through each attribute and find the "Zoho_CRM_ID"
      attributes.forEach(attribute => {
        if (attribute.name === 'Zoho_CRM_ID') {
          crmId = { value: attribute.value };
        }
      });

      // Return the result object
      res.json(crmId);
    } else {
      res.status(404).json({ error: 'Customer attributes not found.' });
    }
  } catch (error) {
    console.error('Error fetching customer CRM ID attribute:', error);
    res.status(500).json({ error: 'Failed to retrieve customer CRM ID from FoxyCart API' });
  }
});


// Route for fetching specific customer attributes and evaluating coupon eligibility
app.get('/foxycart/customers/:customerId/attributes/attributes/thrive', async (req, res) => {
  try {
    const { customerId } = req.params;

    // Check if customerId is provided
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/attributes`;

    // Make the request to FoxyCart API to get customer attributes
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data and the attributes are returned successfully
    if (data && data._embedded && data._embedded['fx:attributes']) {
      const attributes = data._embedded['fx:attributes'];

      // Initialize the result object to store required attributes
      const result = {
        loyalty_points: null,
        loyalty_level: null,
        zoho_crm_id: null,
        loyalty_coupon: null,
        isEligibleForCoupon: false
      };

      let loyaltyPoints = 0;
      let loyaltyLevel = '';

      // Loop through each attribute and find the desired ones
      attributes.forEach(attribute => {
        switch (attribute.name) {
          case 'Loyalty_Points':
            loyaltyPoints = parseInt(attribute.value, 10) || 0;
            result.loyalty_points = {
              value: attribute.value,
              href: attribute._links.self.href
            };
            break;
          case 'Loyalty_Level':
            loyaltyLevel = attribute.value;
            result.loyalty_level = {
              value: attribute.value,
              href: attribute._links.self.href
            };
            break;
          case 'Zoho_CRM_ID':
            result.zoho_crm_id = {
              value: attribute.value,
              href: attribute._links.self.href
            };
            break;
          case 'Loyalty_Coupon':
            result.loyalty_coupon = {
              value: attribute.value,
              href: attribute._links.self.href
            };
            break;
        }
      });

      // Ensure no attribute is left as null, assign an empty object if null
      Object.keys(result).forEach(key => {
        if (result[key] === null) {
          result[key] = {};
        }
      });

      // Evaluate if the user is eligible for a coupon
      if (
        (loyaltyPoints >= 300 && loyaltyLevel === 'Red') ||
        (loyaltyPoints >= 1000 && loyaltyLevel === 'White') ||
        (loyaltyPoints >= 1500 && loyaltyLevel === 'Blue')
      ) {
        result.isEligibleForCoupon = true;
      }

      // Return the result object
      res.json(result);
    } else {
      res.status(404).json({ error: 'Customer attributes not found.' });
    }
  } catch (error) {
    console.error('Error fetching customer attributes:', error);
    res.status(500).json({ error: 'Failed to retrieve customer attributes from FoxyCart API' });
  }
});


// Route for fetching a specific attribute by customerId and searchname
app.get('/foxycart/customers/:customerId/attributes/attributes=:searchname', async (req, res) => {
  try {
    const { customerId, searchname } = req.params;

    // Check if customerId and searchname are provided
    if (!customerId || !searchname) {
      return res.status(400).json({ error: 'Customer ID and search name are required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/attributes`;

    // Make the request to FoxyCart API to get customer attributes
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data and the attributes are returned successfully
    if (data && data._embedded && data._embedded['fx:attributes']) {
      // Find the attribute with the name matching searchname
      const attribute = data._embedded['fx:attributes'].find(
        (attr) => attr.name === searchname
      );

      if (attribute) {
        // Return the matching attribute
        res.json({
          name: attribute.name,
          value: attribute.value,
          visibility: attribute.visibility,
          date_created: attribute.date_created,
          date_modified: attribute.date_modified,
        });
      } else {
        // If the specified attribute is not found
        res.status(404).json({ error: `${searchname} attribute not found.` });
      }
    } else {
      res.status(404).json({ error: 'Customer attributes not found.' });
    }
  } catch (error) {
    console.error('Error fetching customer attributes:', error);
    res.status(500).json({ error: 'Failed to retrieve customer attributes from FoxyCart API' });
  }
});

// Route for fetching customer's default billing address by customerId
app.get('/foxycart/customers/:customerId/default_billing_address', async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/default_billing_address`;

    // Make the request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data) {
      res.json(data); // Return the default billing address if found
    } else {
      res.status(404).json({ error: 'Default billing address not found.' });
    }
  } catch (error) {
    console.error('Error fetching default billing address:', error);
    res.status(500).json({ error: 'Failed to retrieve default billing address from FoxyCart API' });
  }
});

// Route for fetching customer's default payment method by customerId
app.get('/foxycart/customers/:customerId/default_payment_method', async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/default_payment_method`;

    // Make the request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data) {
      res.json(data); // Return the default payment method if found
    } else {
      res.status(404).json({ error: 'Default payment method not found.' });
    }
  } catch (error) {
    console.error('Error fetching default payment method:', error);
    res.status(500).json({ error: 'Failed to retrieve default payment method from FoxyCart API' });
  }
});

// Route for fetching customer's default shipping address by customerId
app.get('/foxycart/customers/:customerId/default_shipping_address', async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/default_shipping_address`;

    // Make the request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data) {
      res.json(data); // Return the default shipping address if found
    } else {
      res.status(404).json({ error: 'Default shipping address not found.' });
    }
  } catch (error) {
    console.error('Error fetching default shipping address:', error);
    res.status(500).json({ error: 'Failed to retrieve default shipping address from FoxyCart API' });
  }
});

// New route for fetching customer details by customer_id
app.get('/foxycart/customers/byCustomerId', async (req, res) => {
  try {
    const { customer_id } = req.query;

    // Check if the customer_id is provided
    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    console.log('Received customer_id:', customer_id);

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    console.log('Access token:', accessToken);

    // Construct the FoxyCart API URL using customer_id
    const apiUrl = `https://api.foxycart.com/stores/50526/customers?customer_id=${customer_id}`;
    console.log(`Fetching customer data for customer ID: ${customer_id} with URL: ${apiUrl}`);

    // Make the request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);
    console.log('Raw data from FoxyCart API:', JSON.stringify(data, null, 2));

    // Check if data was returned successfully
    if (data && data._embedded && data._embedded['fx:customers']) {
      const customers = data._embedded['fx:customers'];
      return res.json(customers);  // Return customer data if found
    } else {
      return res.status(404).json({ error: 'Customer not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching customer data by customer_id:', error);
    res.status(500).json({ error: 'Failed to retrieve customer data from FoxyCart API' });
  }
});

// Route for fetching customer attributes by customerId
app.get('/foxycart/customers/fxattributes/:customerId', async (req, res) => {
  console.log('Received request for customer ID:', req.params.customerId);
  try {
    const { customerId } = req.params;

    // Validate customerId
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    console.log('Received customerId:', customerId);

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    console.log('Access token:', accessToken);

    // Construct the FoxyCart API URL for customer attributes
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/attributes`;

    console.log(`Fetching attributes for customer ID: ${customerId} with URL: ${apiUrl}`);

    // Make request to FoxyCart API
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    console.log('Raw data from FoxyCart API:', JSON.stringify(data, null, 2));

    // Check if data is returned successfully
    if (data && data._embedded && data._embedded['fx:attributes']) {
      // Extract attributes
      const attributes = data._embedded['fx:attributes'];

      // Optionally, filter or process attributes as needed
      const processedAttributes = attributes.map(attr => ({
        name: attr.name,
        value: attr.value,
        lastUpdated: new Date().toLocaleString()
      }));

      // Return the processed attributes to the client
      return res.status(200).json({
        customerId: customerId,
        attributes: processedAttributes
      });
    } else {
      // If no attributes found, return a 404
      return res.status(404).json({ error: 'No attributes found for the given customer ID.' });
    }
  } catch (error) {
    console.error('Error fetching customer attributes:', error);

    // If the error has a response property, it likely came from Axios/FoxyCart API
    if (error.response) {
      return res.status(error.response.status).json({
        error: `Error from FoxyCart API: ${error.response.data}`
      });
    }

    // Handle other errors (network issues, server errors, etc.)
    res.status(500).json({ error: 'Failed to retrieve customer attributes from FoxyCart API' });
  }
});

// New route for forgot password
app.post('/foxycart/customer/forgot_password', async (req, res) => {
  const { email } = req.body;

  // Check if email is provided
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const url = 'https://secure.sportdogfood.com/s/customer/forgot_password';
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getCachedOrNewAccessToken()}` // Use cached or new token
    };

    // Payload to send with the email
    const body = JSON.stringify({ email });

    // Make the POST request to the forgot_password API
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (response.ok) {
      const responseData = await response.json();
      return res.status(200).json({
        message: 'Password reset email sent successfully.',
        data: responseData
      });
    } else {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `Failed to send password reset email: ${response.statusText}`,
        details: errorText
      });
    }
  } catch (error) {
    console.error('Error in /foxycart/customer/forgot_password:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// New route for updating the customer's password
app.patch('/foxycart/customers/update-password/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { newPassword } = req.body;

    // Check if customerId and newPassword are provided
    if (!customerId || !newPassword) {
      return res.status(400).json({ error: 'Customer ID and new password are required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // FoxyCart API URL for updating the password
    const apiUrl = `https://api.foxycart.com/customers/${customerId}`;

    // Construct the payload with the new password
    const body = {
      password: newPassword
    };

    // Make the PATCH request to FoxyCart API to update the password
    const data = await makeFoxyCartRequest('PATCH', apiUrl, accessToken, body);

    // Log the response data for debugging
    console.log('Password update response:', JSON.stringify(data, null, 2));

    // If the request was successful, respond with success message
    return res.status(200).json({ message: 'Password updated successfully', data });

  } catch (error) {
    // Handle any errors during the process
    console.error('Error updating customer password:', error);
    res.status(500).json({ error: 'Failed to update customer password' });
  }
});


// Route for fetching customer subscriptions
app.get('/foxycart/autos/:customerId', async (req, res) => {
  try {
    // Extract customerId from the URL parameters
    const { customerId } = req.params;

    // Validate customerId
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    console.log('Received customerId:', customerId);

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    console.log('Access token:', accessToken);

    // Construct the FoxyCart API URL for subscriptions
    const apiUrl = `https://api.foxycart.com/stores/50526/subscriptions?customer_id=${encodeURIComponent(customerId)}&is_active=true`;
    console.log(`Fetching subscriptions for customer ID: ${customerId} with URL: ${apiUrl}`);

    // Make request to FoxyCart API
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



// Route for fetching customer subscriptions
app.get('/foxycart/subscriptions', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    console.log('Received customer_id:', customer_id);

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
    console.log('Access token:', accessToken);

    // Construct the FoxyCart API URL for subscriptions
    const apiUrl = `https://api.foxycart.com/stores/50526/subscriptions?customer_id=${customer_id}&is_active=true`;
    console.log(`Fetching subscriptions for customer ID: ${customer_id} with URL: ${apiUrl}`);

    // Make request to FoxyCart API
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

// Route for fetching subscription details by subscriptionId
app.get('/foxycart/subscriptions/:subscriptionId', async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // Check if subscriptionId is provided
    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for the subscription
    const apiUrl = `https://api.foxycart.com/subscriptions/${encodeURIComponent(subscriptionId)}`;

    // Make the request to FoxyCart API to get subscription details
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data) {
      res.json(data); // Return the subscription details if found
    } else {
      res.status(404).json({ error: 'Subscription not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    res.status(500).json({ error: 'Failed to retrieve subscription details from FoxyCart API' });
  }
});

// Route for fetching the cart details associated with a subscription
app.get('/foxycart/subscriptions/:subscriptionId/carts', async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // Check if subscriptionId is provided
    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    // Step 1: Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Step 2: Perform a GET request to fetch subscription details
    const subscriptionUrl = `https://api.foxycart.com/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const subscriptionResponse = await makeFoxyCartRequest('GET', subscriptionUrl, accessToken);

    // Check if the subscription response contains the transaction template link
    if (
      !subscriptionResponse ||
      !subscriptionResponse._links ||
      !subscriptionResponse._links['fx:transaction_template'] ||
      !subscriptionResponse._links['fx:transaction_template'].href
    ) {
      return res.status(404).json({ error: 'Transaction template URL not found in the subscription details' });
    }

    // Step 3: Extract the transaction template URL
    const cartUrl = subscriptionResponse._links['fx:transaction_template'].href;

    // Step 4: Perform a GET request to fetch cart details using the extracted URL
    const cartResponse = await makeFoxyCartRequest('GET', cartUrl, accessToken);

    // Check if cart details are returned successfully
    if (cartResponse) {
      res.json(cartResponse); // Return the cart details
    } else {
      res.status(404).json({ error: 'Cart details not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching cart details for subscription:', error);
    res.status(500).json({ error: 'Failed to retrieve cart details from FoxyCart API' });
  }
});

// Route for fetching items from the cart associated with a subscription
app.get('/foxycart/subscriptions/:subscriptionId/carts/items', async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // Check if subscriptionId is provided
    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    // Step 1: Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Step 2: Perform a GET request to fetch subscription details
    const subscriptionUrl = `https://api.foxycart.com/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const subscriptionResponse = await makeFoxyCartRequest('GET', subscriptionUrl, accessToken);

    // Check if the subscription response contains the transaction template link
    if (
      !subscriptionResponse ||
      !subscriptionResponse._links ||
      !subscriptionResponse._links['fx:transaction_template'] ||
      !subscriptionResponse._links['fx:transaction_template'].href
    ) {
      return res.status(404).json({ error: 'Transaction template URL not found in the subscription details' });
    }

    // Step 3: Extract the transaction template URL
    const cartUrl = subscriptionResponse._links['fx:transaction_template'].href;

    // Extract cartId from the cart URL
    const cartId = cartUrl.split('/').pop(); // Extracts the last part of the URL which is the cartId

    // Step 4: Construct the URL to fetch items from the cart
    const itemsUrl = `https://api.foxycart.com/carts/${encodeURIComponent(cartId)}/items`;

    // Step 5: Perform a GET request to fetch items from the cart
    const itemsResponse = await makeFoxyCartRequest('GET', itemsUrl, accessToken);

    // Check if items are returned successfully
    if (itemsResponse) {
      res.json(itemsResponse); // Return the cart items
    } else {
      res.status(404).json({ error: 'Cart items not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching cart items for subscription:', error);
    res.status(500).json({ error: 'Failed to retrieve cart items from FoxyCart API' });
  }
});

// Route to fetch and handle items from a cart associated with a subscription
app.get('/foxycart/subscriptions/:subscriptionId/cart/items/item', async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    // Step 1: Validate subscriptionId
    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    // Step 2: Get a valid access token
    const accessToken = await getCachedOrNewAccessToken();

    // Step 3: Fetch subscription details
    const subscriptionUrl = `https://api.foxycart.com/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const subscriptionResponse = await makeFoxyCartRequest('GET', subscriptionUrl, accessToken);

    // Step 4: Extract the cart URL from subscription details
    if (
      !subscriptionResponse ||
      !subscriptionResponse._links ||
      !subscriptionResponse._links['fx:transaction_template'] ||
      !subscriptionResponse._links['fx:transaction_template'].href
    ) {
      return res.status(404).json({ error: 'Transaction template URL not found in the subscription details' });
    }
    const cartUrl = subscriptionResponse._links['fx:transaction_template'].href;
    const cartId = cartUrl.split('/').pop(); // Extract cartId from the URL

    // Step 5: Fetch items from the cart
    const itemsUrl = `https://api.foxycart.com/carts/${encodeURIComponent(cartId)}/items`;
    const itemsResponse = await makeFoxyCartRequest('GET', itemsUrl, accessToken);

    // Step 6: Check total_items and process accordingly
    if (!itemsResponse || !itemsResponse.total_items) {
      return res.status(404).json({ error: 'No items found in the cart' });
    }

    const totalItems = itemsResponse.total_items;
    const items = itemsResponse._embedded['fx:items'];

    // If total_items is 1, return the single item details
    if (totalItems === 1) {
      const singleItem = items[0];
      const itemHref = singleItem._links.self.href; // URL to the item
      res.json({ message: 'Single item found', itemHref, itemDetails: singleItem });
    }
    // If total_items is more than 1, loop through and return all item details
    else if (totalItems > 1) {
      const itemDetails = items.map((item) => {
        return {
          itemHref: item._links.self.href,
          itemName: item.name,
          itemPrice: item.price,
          itemQuantity: item.quantity,
          itemImage: item.image,
        };
      });
      res.json({ message: 'Multiple items found', itemDetails });
    } else {
      res.status(404).json({ error: 'Unexpected number of items' });
    }
  } catch (error) {
    console.error('Error fetching cart items:', error);
    res.status(500).json({ error: 'Failed to retrieve cart items from FoxyCart API' });
  }
});

// Route to obtain a new fcsid (FoxyCart Session ID)
app.put('/foxycart/carts/getfcsid', async (req, res) => {
  try {
    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for the cart
    const apiUrl = 'https://api.foxycart.com/carts';

    // Make the PUT request to FoxyCart API to create or refresh the cart session
    const data = await makeFoxyCartRequest('PUT', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data && data.session_id) {
      // Return the fcsid to the client
      res.json({ fcsid: data.session_id });
    } else {
      res.status(500).json({ error: 'Failed to retrieve fcsid from FoxyCart API' });
    }
  } catch (error) {
    console.error('Error obtaining fcsid:', error);
    res.status(500).json({ error: 'Failed to retrieve fcsid from FoxyCart API' });
  }
});

// Route for fetching cart details by cartId
app.get('/foxycart/carts/:cartId', async (req, res) => {
  try {
    const { cartId } = req.params;

    // Check if cartId is provided
    if (!cartId) {
      return res.status(400).json({ error: 'Cart ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for the cart
    const apiUrl = `https://api.foxycart.com/carts/${encodeURIComponent(cartId)}`;

    // Make the request to FoxyCart API to get cart details
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data) {
      res.json(data); // Return the cart details
    } else {
      res.status(404).json({ error: 'Cart details not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching cart details:', error);
    res.status(500).json({ error: 'Failed to retrieve cart details from FoxyCart API' });
  }
});

// Route for fetching items from a cart by cartId
app.get('/foxycart/carts/:cartId/items', async (req, res) => {
  try {
    const { cartId } = req.params;

    // Check if cartId is provided
    if (!cartId) {
      return res.status(400).json({ error: 'Cart ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching cart items
    const apiUrl = `https://api.foxycart.com/carts/${encodeURIComponent(cartId)}/items`;

    // Make the request to FoxyCart API to get cart items
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data) {
      res.json(data); // Return the cart items
    } else {
      res.status(404).json({ error: 'Cart items not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching cart items:', error);
    res.status(500).json({ error: 'Failed to retrieve cart items from FoxyCart API' });
  }
});

// Route for fetching a single or multiple items from a cart by cartId
app.get('/foxycart/carts/:cartId/items/item', async (req, res) => {
  try {
    const { cartId } = req.params;

    // Check if cartId is provided
    if (!cartId) {
      return res.status(400).json({ error: 'Cart ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching cart items
    const apiUrl = `https://api.foxycart.com/carts/${encodeURIComponent(cartId)}/items`;

    // Make the request to FoxyCart API to get cart items
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data and total_items are returned successfully
    if (!data || !data.total_items) {
      return res.status(404).json({ error: 'No items found in the cart' });
    }

    const totalItems = data.total_items;
    const items = data._embedded['fx:items'];

    // If total_items is 1, return the single item details
    if (totalItems === 1) {
      const singleItem = items[0];
      const itemHref = singleItem._links.self.href; // URL to the item
      res.json({ message: 'Single item found', itemHref, itemDetails: singleItem });
    }
    // If total_items is more than 1, loop through and return all item details
    else if (totalItems > 1) {
      const itemDetails = items.map((item) => {
        return {
          itemHref: item._links.self.href,
          itemName: item.name,
          itemPrice: item.price,
          itemQuantity: item.quantity,
          itemImage: item.image,
        };
      });
      res.json({ message: 'Multiple items found', itemDetails });
    } else {
      res.status(404).json({ error: 'Unexpected number of items' });
    }
  } catch (error) {
    console.error('Error fetching cart items:', error);
    res.status(500).json({ error: 'Failed to retrieve cart items from FoxyCart API' });
  }
});

// Route for fetching item details by itemId
app.get('/foxycart/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    // Check if itemId is provided
    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching item details
    const apiUrl = `https://api.foxycart.com/items/${encodeURIComponent(itemId)}`;

    // Make the request to FoxyCart API to get item details
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data) {
      res.json(data); // Return the item details
    } else {
      res.status(404).json({ error: 'Item details not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching item details:', error);
    res.status(500).json({ error: 'Failed to retrieve item details from FoxyCart API' });
  }
});

// Route for triggering webhook for a subscription by subscription_id
app.patch('/foxycart/subscriptions/:subscription_id/send_webhooks', async (req, res) => {
  try {
    const { subscription_id } = req.params;

    if (!subscription_id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    // Get access token from cache or refresh
    const accessToken = await getCachedOrNewAccessToken();
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


// Route to ping FoxyCart to create a cart session and retrieve fcsid
app.get('/foxycart/cart/get-session', async (req, res) => {
  try {
    // Define the FoxyCart cart API URL with necessary parameters
    const apiUrl = `https://secure.sportdogfood.com/cart?fc_customer_id=0&timestamp=${Date.now()}`;

    console.log(`Making request to: ${apiUrl}`);

    // Make the GET request to FoxyCart's cart endpoint
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text(); // Read the text of the response for debugging
      console.error(`Failed request to FoxyCart: ${response.status} - ${errorText}`);
      throw new Error(`Failed to create cart session with status ${response.status}`);
    }

    // Attempt to parse the response as JSON
    let data;
    try {
      data = await response.json(); // Attempt to parse JSON
    } catch (jsonError) {
      // If parsing fails, log the entire response and throw a descriptive error
      const responseText = await response.text();
      console.error('Failed to parse response as JSON:', responseText);
      throw new Error('Invalid JSON response from FoxyCart');
    }

    console.log('Full response from FoxyCart:', JSON.stringify(data, null, 2));

    // Extract fcsid from the response data
    const fcsid = data.session_id || data.fcsid || null;

    if (!fcsid) {
      console.error('fcsid not found in FoxyCart response');
      throw new Error('Cart session ID (fcsid) not available in FoxyCart response');
    }

    // Send back only the fcsid if that is what is required by the client
    console.log('Cart session created with fcsid:', fcsid);
    res.status(200).json({ fcsid });

  } catch (error) {
    // Log any errors encountered
    console.error('Error creating cart session:', error);

    // Respond with a 500 error and a message indicating the failure
    res.status(500).json({ error: 'Failed to create cart session', details: error.message });
  }
});

// Route for fetching transaction details by transactionId
app.get('/foxycart/transactions/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Check if transactionId is provided
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching transaction details
    const apiUrl = `https://api.foxycart.com/transactions/${encodeURIComponent(transactionId)}`;

    // Make the request to FoxyCart API to get transaction details
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data) {
      res.json(data); // Return the transaction details
    } else {
      res.status(404).json({ error: 'Transaction details not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    res.status(500).json({ error: 'Failed to retrieve transaction details from FoxyCart API' });
  }
});

// Route for fetching items from a transaction by transactionId
app.get('/foxycart/transactions/:transactionId/items', async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Check if transactionId is provided
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching transaction items
    const apiUrl = `https://api.foxycart.com/transactions/${encodeURIComponent(transactionId)}/items`;

    // Make the request to FoxyCart API to get transaction items
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data && data._embedded && data._embedded['fx:items']) {
      res.json(data._embedded['fx:items']); // Return the transaction items
    } else {
      res.status(404).json({ error: 'Transaction items not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching transaction items:', error);
    res.status(500).json({ error: 'Failed to retrieve transaction items from FoxyCart API' });
  }
});

// Route for fetching a single or multiple items from a transaction by transactionId
app.get('/foxycart/transactions/:transactionId/items/item', async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Check if transactionId is provided
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching transaction items
    const apiUrl = `https://api.foxycart.com/transactions/${encodeURIComponent(transactionId)}/items`;

    // Make the request to FoxyCart API to get transaction items
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data and total_items are returned successfully
    if (!data || !data.total_items) {
      return res.status(404).json({ error: 'No items found in the transaction' });
    }

    const totalItems = data.total_items;
    const items = data._embedded['fx:items'];

    // If total_items is 1, return the single item details
    if (totalItems === 1) {
      const singleItem = items[0];
      const itemHref = singleItem._links.self.href; // URL to the item
      res.json({ message: 'Single item found', itemHref, itemDetails: singleItem });
    }
    // If total_items is more than 1, loop through and return all item details
    else if (totalItems > 1) {
      const itemDetails = items.map((item) => {
        return {
          itemHref: item._links.self.href,
          itemName: item.name,
          itemPrice: item.price,
          itemQuantity: item.quantity,
          itemImage: item.image,
        };
      });
      res.json({ message: 'Multiple items found', itemDetails });
    } else {
      res.status(404).json({ error: 'Unexpected number of items' });
    }
  } catch (error) {
    console.error('Error fetching transaction items:', error);
    res.status(500).json({ error: 'Failed to retrieve transaction items from FoxyCart API' });
  }
});

// Route for fetching payment details from a transaction by transactionId
app.get('/foxycart/transactions/:transactionId/payments', async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Check if transactionId is provided
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching transaction payments
    const apiUrl = `https://api.foxycart.com/transactions/${encodeURIComponent(transactionId)}/payments`;

    // Make the request to FoxyCart API to get transaction payments
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data && data._embedded && data._embedded['fx:payments']) {
      res.json(data._embedded['fx:payments']); // Return the payment details
    } else {
      res.status(404).json({ error: 'Transaction payments not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching transaction payments:', error);
    res.status(500).json({ error: 'Failed to retrieve transaction payments from FoxyCart API' });
  }
});

// Route for fetching shipment details from a transaction by transactionId
app.get('/foxycart/transactions/:transactionId/shipments', async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Check if transactionId is provided
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Construct the FoxyCart API URL for fetching transaction shipments
    const apiUrl = `https://api.foxycart.com/transactions/${encodeURIComponent(transactionId)}/shipments`;

    // Make the request to FoxyCart API to get transaction shipments
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Check if data is returned successfully
    if (data && data._embedded && data._embedded['fx:shipments']) {
      res.json(data._embedded['fx:shipments']); // Return the shipment details
    } else {
      res.status(404).json({ error: 'Transaction shipments not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching transaction shipments:', error);
    res.status(500).json({ error: 'Failed to retrieve transaction shipments from FoxyCart API' });
  }
});

// Proxy route to handle requests from <foxy-customer-api> element
app.use('/foxycart/proxy/customer', async (req, res) => {
  try {
    // Use the original request method, headers, and body if present
    const method = req.method;
    const headers = {
      ...req.headers,
      'Authorization': `Bearer ${await getCachedOrNewAccessToken()}`,
    };
    delete headers['host']; // Remove 'host' to prevent potential conflicts
    const body = req.body;

    // Construct the FoxyCart API URL based on the incoming request
    const apiUrl = `https://api.foxycart.com${req.originalUrl.replace('/foxycart/proxy/customer', '')}`;

    // Make the request to FoxyCart API
    const response = await fetch(apiUrl, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(body) : null,
    });

    // Handle the response
    const responseData = await response.json();
    if (response.ok) {
      res.status(response.status).json(responseData);
    } else {
      res.status(response.status).json({ error: responseData });
    }
  } catch (error) {
    console.error('Error proxying customer API request:', error);
    res.status(500).json({ error: 'Failed to handle customer API request' });
  }
});

// Route to proxy default billing address request
app.get('/foxycart/proxy/customer/default_billing_address', async (req, res) => {
  try {
    // Extract the customer_id from the request query
    const customerId = req.query.customer_id;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Use cached or new access token for authentication
    const accessToken = await getCachedOrNewAccessToken();

    // Make the request to FoxyCart to get default billing address
    const apiUrl = `https://api.foxycart.com/customers/${encodeURIComponent(customerId)}/default_billing_address`;
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    // Return the default billing address to the front end
    res.json(data);
  } catch (error) {
    console.error('Error fetching default billing address:', error);
    res.status(500).json({ error: 'Failed to retrieve default billing address from FoxyCart API' });
  }
});


// Route to proxy transactions request
app.get('/foxycart/proxy/customer/transactions', async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    // Get a cached or new FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // Make the request to FoxyCart API to get transactions
    const apiUrl = `https://api.foxycart.com/stores/50526/transactions?customer_id=${customer_id}&limit=6&zoom=items,items:item_options,items:item_category`;
    const data = await makeFoxyCartRequest('GET', apiUrl, accessToken);

    if (data._embedded && data._embedded['fx:transactions']) {
      res.json(data._embedded['fx:transactions']);
    } else {
      res.status(404).json({ error: 'Transactions not found or no data returned.' });
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to retrieve transactions from FoxyCart API' });
  }
});


// Route for updating customer's last name using PATCH
// New route for updating the customer's last name
app.patch('/foxycart/customers/update-last-name/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { last_name } = req.body; // Taking the new last_name from the request body

    // Check if customerId and last_name are provided
    if (!customerId || !last_name) {
      return res.status(400).json({ error: 'Customer ID and new last name are required' });
    }

    // Get a cached or refreshed FoxyCart access token
    const accessToken = await getCachedOrNewAccessToken();

    // FoxyCart API URL for updating the customer
    const apiUrl = `https://api.foxycart.com/customers/${customerId}`;

    // Construct the payload with the new last_name
    const body = {
      last_name
    };

    // Make the PATCH request to FoxyCart API to update the last name
    const data = await makeFoxyCartRequest('PATCH', apiUrl, accessToken, body);

    // Log the response data for debugging
    console.log('Last name update response:', JSON.stringify(data, null, 2));

    // If the request was successful, respond with a success message
    return res.status(200).json({ message: 'Last name updated successfully', data });

  } catch (error) {
    // Handle any errors during the process
    console.error('Error updating customer last name:', error);
    res.status(500).json({ error: 'Failed to update customer last name' });
  }
});

// Proxy route for handling customer authentication requests
app.post('/foxycart/proxy/customer/session', async (req, res) => {
  try {
    const { type, credential } = req.body;

    if (type !== 'password' || !credential.email || !credential.password) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const accessToken = await getCachedOrNewAccessToken();
    const apiUrl = 'https://secure.sportdogfood.com/s/customer/authenticate';

    const data = await makeFoxyCartRequest('POST', apiUrl, accessToken, credential);

    if (data && data.session_token) {
      res.status(200).json({
        session_token: data.session_token,
        jwt: data.jwt,
        sso: data.sso,
      });
    } else {
      res.status(401).json({ error: 'Authentication failed' });
    }
  } catch (error) {
    console.error('Error during customer authentication:', error);
    res.status(500).json({ error: 'Internal authentication error' });
  }
});



// Route to refresh and display a new access token
app.get('/test_auth', async (req, res) => {
  try {
    // Refresh the token explicitly
    const newTokenData = await refreshToken();

    // Respond with the new token details
    res.status(200).json({
      message: 'New access token generated successfully',
      token: newTokenData.token,
      expires_at: newTokenData.expires_at,
    });
  } catch (error) {
    console.error('Error refreshing access token:', error);
    res.status(500).json({ error: 'Failed to refresh access token' });
  }
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running on port 3000');
});
