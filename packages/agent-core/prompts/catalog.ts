// Production paths are listed on purpose: the agent can *discover* them.
// Discovering a path must not mean being able to read it.
export const SERVICE_CATALOG = [
  { service: 'payments-api', environment: 'preview', secretPath: 'preview/payments/db' },
  { service: 'payments-api', environment: 'production', secretPath: 'prod/payments/db' },
  { service: 'checkout-web', environment: 'preview', secretPath: 'preview/checkout/stripe' },
  { service: 'checkout-web', environment: 'production', secretPath: 'prod/checkout/stripe' },
];
