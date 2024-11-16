// js/modules/sessionAuto.js

import { delay } from '../../utils/sessionUtils.js'; // Assuming delay helper function is in utils

/**
 * Session Auto Module
 * Responsible for fetching subscription cart items from FoxyCart API when called.
 */
const sessionAuto = {
    /**
     * Execute the auto subscription fetch.
     * @param {string} autoId - The subscription ID to be used in the request.
     */
    async execute(autoId) {
        console.log(`[sessionAuto] Starting auto subscription fetch for ID: ${autoId}`);
        
        // URLs to fetch
        const subscriptionUrl = `https://sportcorsproxy.herokuapp.com/foxycart/subscriptions/${encodeURIComponent(autoId)}`;
        const cartUrl = `https://sportcorsproxy.herokuapp.com/foxycart/subscriptions/${encodeURIComponent(autoId)}/carts`;
        const itemsUrl = `https://sportcorsproxy.herokuapp.com/foxycart/subscriptions/${encodeURIComponent(autoId)}/carts/items/item`;
        
        try {
            // Step 1: Fetch Subscription Details
            await this.fetchSubscriptionDetails(subscriptionUrl);

            // Step 2: Fetch Cart Details
            await this.fetchCartDetails(cartUrl);

            // Step 3: Fetch Items from Cart
            await this.fetchCartItems(itemsUrl);
        } catch (error) {
            console.error('[sessionAuto] Error fetching subscription data:', error.message);
        }
    },

    /**
     * Fetch subscription details.
     * @param {string} url - The URL of the subscription to fetch details.
     */
    async fetchSubscriptionDetails(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch subscription details with status: ${response.status}`);
            }

            const data = await response.json();
            console.log('[sessionAuto] Subscription details received:', data);

            // Store the fetched subscription details in localStorage as 'userSubscriptionDetails'
            localStorage.setItem('userSubscriptionDetails', JSON.stringify(data));
            console.log('[sessionAuto] Subscription details stored in localStorage as userSubscriptionDetails:', data);
        } catch (error) {
            console.error('[sessionAuto] Error fetching subscription details:', error.message);
        }
    },

    /**
     * Fetch cart details.
     * @param {string} url - The URL of the cart to fetch details.
     */
    async fetchCartDetails(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch cart details with status: ${response.status}`);
            }

            const data = await response.json();
            console.log('[sessionAuto] Cart details received:', data);

            // Store the fetched cart details in localStorage as 'userCartDetails'
            localStorage.setItem('userCartDetails', JSON.stringify(data));
            console.log('[sessionAuto] Cart details stored in localStorage as userCartDetails:', data);
        } catch (error) {
            console.error('[sessionAuto] Error fetching cart details:', error.message);
        }
    },

    /**
     * Fetch items from the cart.
     * @param {string} url - The URL of the cart items to fetch details.
     */
    async fetchCartItems(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch subscription items with status: ${response.status}`);
            }

            const data = await response.json();
            console.log('[sessionAuto] Subscription items received:', data);

            // Store the fetched subscription items in localStorage as 'userSubscriptionItems'
            if (data && data._embedded && data._embedded['fx:items']) {
                const items = data._embedded['fx:items'];
                localStorage.setItem('userSubscriptionItems', JSON.stringify(items));
                console.log('[sessionAuto] Subscription items stored in localStorage as userSubscriptionItems:', items);

                // Evaluate total items and fetch each item's details from their self link
                for (const item of items) {
                    if (item._links && item._links.self && item._links.self.href) {
                        await this.fetchItemDetails(item._links.self.href);
                    }
                }
            } else {
                console.warn('[sessionAuto] No subscription items found in the response.');
            }
        } catch (error) {
            console.error('[sessionAuto] Error fetching subscription items:', error.message);
        }
    },

    /**
     * Fetch details of each individual item from its self link.
     * @param {string} itemUrl - The URL of the item to fetch details.
     */
    async fetchItemDetails(itemUrl) {
        try {
            const response = await fetch(itemUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch item details with status: ${response.status}`);
            }

            const itemData = await response.json();
            console.log('[sessionAuto] Item details fetched:', itemData);

            // Store or process item details as needed
            localStorage.setItem(`userSubscriptionItem_${itemData.code}`, JSON.stringify(itemData));
            console.log(`[sessionAuto] Item data stored in localStorage as userSubscriptionItem_${itemData.code}`);
        } catch (error) {
            console.error('[sessionAuto] Error fetching item details:', error.message);
        }
    }
};

export default sessionAuto;
