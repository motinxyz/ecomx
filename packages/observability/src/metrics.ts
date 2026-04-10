import { metrics } from '@opentelemetry/api';

/**
 * Ecommerce Business Metrics
 * 
 * This file centralizes your custom counters and histograms.
 * By defining them here, you ensure metrics logic is perfectly typed
 * and services aren't writing duplicate OpenTelemetry setup code.
 */

// We fetch the global meter initialized by `NodeSDK` in tracing.ts
const ecomxMeter = metrics.getMeter('ecomx-business-metrics');

/**
 * 🛒  E-Commerce Counters
 */

// 1. User Authentications
export const authCounter = ecomxMeter.createCounter('ecomx_authentication_total', {
  description: 'Tracks user login attempts (success and failures)',
});

// 2. Orders Processed
export const orderCounter = ecomxMeter.createCounter('ecomx_orders_processed_total', {
  description: 'Tracks total number of processed orders',
});

// 3. Cart Adds
export const cartAddCounter = ecomxMeter.createCounter('ecomx_cart_adds_total', {
  description: 'Tracks items added to the cart',
});

/**
 * ⏱️ E-Commerce Histograms (value distributions)
 */

// Tracks the total monetary value of orders
export const orderValueHistogram = ecomxMeter.createHistogram('ecomx_order_value_usd', {
  description: 'Distribution of order values in USD',
  unit: 'USD',
});

/**
 * Helpers for cleaner imports inside Elysia routes
 */
export const recordLogin = (status: 'success' | 'failure' | 'invalid_password') => {
  authCounter.add(1, { status });
};

export const recordOrder = (valueUSD: number, paymentMethod: 'stripe' | 'paypal' | 'crypto') => {
  orderCounter.add(1, { payment_method: paymentMethod });
  orderValueHistogram.record(valueUSD, { payment_method: paymentMethod });
};
