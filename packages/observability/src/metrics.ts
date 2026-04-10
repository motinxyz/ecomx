import { type Counter, type Histogram, metrics } from '@opentelemetry/api';

/**
 * Ecommerce Business Metrics
 *
 * This file centralizes your custom counters and histograms.
 * By defining them here, you ensure metrics logic is perfectly typed
 * and services aren't writing duplicate OpenTelemetry setup code.
 */

/**
 * Lazy-initialized Meter
 *
 * We don't fetch the meter at the top level. If we did, and this file was imported
 * before initTelemetry() ran, we would get a "No-Op" meter that does nothing.
 * By using a getter, we ensure we always get the registered provider.
 */
const getMeter = () => metrics.getMeter('ecomx-business-metrics');

/**
 * 🛒  E-Commerce Instrumentation (Lazy Singletons)
 */
let _authCounter: Counter | undefined;
let _orderCounter: Counter | undefined;
let _cartAddCounter: Counter | undefined;
let _orderValueHistogram: Histogram | undefined;

/**
 * Helpers for cleaner imports inside Elysia/Express routes.
 * These handle lazy-initialization of instruments on first use.
 */

export const recordLogin = (
  status: 'success' | 'failure' | 'invalid_password'
) => {
  if (!_authCounter) {
    _authCounter = getMeter().createCounter('ecomx_authentication_total', {
      description: 'Tracks user login attempts (success and failures)',
    });
  }
  _authCounter.add(1, { status });
};

export const recordOrder = (
  valueUSD: number,
  paymentMethod: 'stripe' | 'paypal' | 'crypto'
) => {
  if (!_orderCounter) {
    _orderCounter = getMeter().createCounter('ecomx_orders_processed_total', {
      description: 'Tracks total number of processed orders',
    });
  }
  if (!_orderValueHistogram) {
    _orderValueHistogram = getMeter().createHistogram('ecomx_order_value_usd', {
      description: 'Distribution of order values in USD',
      unit: 'USD',
    });
  }

  _orderCounter.add(1, { payment_method: paymentMethod });
  _orderValueHistogram.record(valueUSD, { payment_method: paymentMethod });
};

export const recordCartAdd = () => {
  if (!_cartAddCounter) {
    _cartAddCounter = getMeter().createCounter('ecomx_cart_adds_total', {
      description: 'Tracks items added to the cart',
    });
  }
  _cartAddCounter.add(1);
};
