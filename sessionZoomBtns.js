// js/modules/sessionZoomBtns.js

const sessionZoomBtns = {
    /**
     * Initialize Zoom buttons based on available data.
     * This method will be called by sessionZoom and may be invoked by other scripts later.
     */
    async init() {
        console.log('[sessionZoomBtns] Initializing Zoom buttons.');

        const customerId = window.fx_customerId;
        if (!customerId) {
            console.warn('[sessionZoomBtns] No customer ID found. Aborting Zoom button initialization.');
            return;
        }

        try {
            // Ping each endpoint to determine if data exists for Billing, Shipping, and Payment
            const billingData = await this.fetchCustomerData('default_billing_address');
            const shippingData = await this.fetchCustomerData('default_shipping_address');
            const paymentData = await this.fetchCustomerData('default_payment_method');

            // Render buttons for each type of data
            this.renderButtons('Billing', billingData, 'billingButtonRow');
            this.renderButtons('Shipping', shippingData, 'shippingButtonRow');
            this.renderButtons('Card', paymentData, 'paymentButtonRow');

            console.log('[sessionZoomBtns] Zoom buttons rendered successfully.');
        } catch (error) {
            console.error('[sessionZoomBtns] Error initializing Zoom buttons:', error);
        }
    },

    /**
     * Fetch customer data from the given endpoint.
     * @param {string} dataType - The type of data to fetch ('default_billing_address', 'default_shipping_address', 'default_payment_method').
     * @returns {Promise<object|null>} - Returns data if available, else null.
     */
    async fetchCustomerData(dataType) {
        const customerId = window.fx_customerId;
        const apiUrl = `https://sportcorsproxy.herokuapp.com/foxycart/customers/${customerId}/${dataType}`;

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${dataType}`);
            }

            const data = await response.json();
            return data || null;
        } catch (error) {
            console.error(`[sessionZoomBtns] Error fetching ${dataType}:`, error);
            return null;
        }
    },

    /**
     * Render buttons based on data availability.
     * @param {string} label - The label for the row ('Billing', 'Shipping', 'Card').
     * @param {object|null} data - The data fetched from the API. Null if not found.
     * @param {string} containerId - The ID of the container element where buttons will be appended.
     */
    renderButtons(label, data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`[sessionZoomBtns] Container with ID ${containerId} not found.`);
            return;
        }

        // Create a row element
        const row = document.createElement('div');
        row.className = 'zoom-button-row';

        // Create a button element ('Modify' if data exists, otherwise 'Add')
        const button = document.createElement('button');
        button.className = 'zoom-button';
        button.textContent = data ? 'Modify' : 'Add';
        button.addEventListener('click', () => this.handleButtonClick(label, data));

        // Create a label element below the button
        const buttonLabel = document.createElement('span');
        buttonLabel.className = 'button-label';
        buttonLabel.textContent = label;

        // Append button and label to the row
        row.appendChild(button);
        row.appendChild(buttonLabel);

        // Append the row to the container
        container.appendChild(row);
    },

    /**
     * Handle button click to either populate form or initiate data input.
     * @param {string} label - The label for the data being modified ('Billing', 'Shipping', 'Card').
     * @param {object|null} data - The data to populate, if available.
     */
    async handleButtonClick(label, data) {
        console.log(`[sessionZoomBtns] ${label} button clicked.`);

        if (data) {
            // Populate form with existing data
            this.populateForm(label, data);
        } else {
            // Wait for user to input new data (trigger an empty form)
            this.populateForm(label, {});
        }
    },

    /**
     * Populate a form with the given data.
     * @param {string} label - The label for the form ('Billing', 'Shipping', 'Card').
     * @param {object} data - The data to populate in the form.
     */
    populateForm(label, data) {
        // Create or select the form element
        let form = document.getElementById(`${label.toLowerCase()}Form`);
        if (!form) {
            form = document.createElement('form');
            form.id = `${label.toLowerCase()}Form`;
            form.className = 'zoom-data-form';
            document.body.appendChild(form); // Append form to body or a dedicated container
        }

        // Clear any existing content in the form
        form.innerHTML = '';

        // Populate form fields with the provided data
        Object.keys(data).forEach(key => {
            const input = document.createElement('input');
            input.type = 'text';
            input.name = key;
            input.value = data[key] || '';
            input.placeholder = key;
            form.appendChild(input);
        });

        // Create a submit button for the form
        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.textContent = 'Save';
        form.appendChild(submitButton);

        console.log(`[sessionZoomBtns] Populating ${label} form with data:`, data);
    }
};

export default sessionZoomBtns;
