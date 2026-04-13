import type { Status } from '@ecomx/infra';

/**
 * Standard Industry Payment Methods
 */
export const PaymentMethod = {
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
  CREDIT_CARD: 'credit_card',
  BKASH: 'bkash',
  NAGAD: 'nagad',
  SSL_COMMERZ: 'sslcommerz',
} as const;

// Automatically generates: 'stripe' | 'paypal' | 'bkash' | ...
export type PaymentMethodType =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Standard Industry Authentication Methods
 */
export const AuthMethod = {
  EMAIL: 'email',
  GOOGLE: 'google',
  GITHUB: 'github',
  MAGIC_LINK: 'magic_link',
} as const;

// Automatically generates: 'email' | 'google' | 'github' | ...
export type AuthMethodType = (typeof AuthMethod)[keyof typeof AuthMethod];

/**
 * Business Domain Event Names
 */
export const EventName = {
  USER_LOGGED_IN: 'auth.login.success',
  ORDER_PLACED: 'ecommerce.order.placed',
  CART_ADDED: 'ecommerce.cart.added',
} as const;

/**
 * The Data Dictionary (Domain Schema)
 */
export type EcommerceEvents = {
  [EventName.USER_LOGGED_IN]: {
    'user.id': string;
    'auth.method': AuthMethodType;
  };

  [EventName.ORDER_PLACED]: {
    'user.id': string;
    'ecommerce.order.id': string;
    'ecommerce.order.value': number;
    'ecommerce.payment.method': PaymentMethodType;
    'error.type'?: (typeof Status)[keyof typeof Status];
  };

  [EventName.CART_ADDED]: {
    'user.id': string;
    'ecommerce.product.id': string;
  };
};
