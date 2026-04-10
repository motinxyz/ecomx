/**
 * The Data Dictionary (Domain Schema)
 *
 * This file strictly scopes every permissible behavior event in the entire Ecomx
 * infrastructure. By centralizing it, we prevent developers from making typos
 * (e.g. tracking "Add_To_Cart" instead of "CartUpdated"), ensuring our Data
 * Warehouse tables remain perfectly clean for Machine Learning models.
 */

export type EcommerceEvents = {
  UserLoggedIn: {
    userId: string;
    method: 'email' | 'google' | 'github';
  };

  UserRegistered: {
    userId: string;
    source: 'organic' | 'referral' | 'paid_ads';
  };

  ProductViewed: {
    userId?: string;
    guestSessionId?: string;
    productId: string;
    category: string;
    priceDisplayed: number;
    viewDurationSeconds?: number;
  };

  CartUpdated: {
    userId: string;
    productId: string;
    action: 'add' | 'remove' | 'update_quantity';
    newQuantity: number;
    priceAtAction: number;
  };

  OrderPlaced: {
    userId: string;
    orderId: string;
    totalValueUSD: number;
    paymentMethod: 'stripe' | 'paypal' | 'crypto';
    itemsCount: number;
    appliedDiscountCode?: string;
  };
};
