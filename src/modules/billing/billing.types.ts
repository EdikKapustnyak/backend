export interface CheckoutSessionResult {
  /** URL to redirect the browser to - Stripe-hosted Checkout page. */
  checkoutUrl: string;
}

export interface PortalSessionResult {
  /** URL to redirect the browser to - Stripe-hosted Customer Portal (update card, cancel, view invoices). */
  portalUrl: string;
}
