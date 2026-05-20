/**
 * Stripe integration — client-side only, no backend required.
 *
 * How to set up:
 *  1. Go to Stripe Dashboard → Payment Links → Create link
 *  2. Set price to $9.99/month (recurring)
 *  3. Set the "After payment" → Redirect URL to:
 *       https://your-domain.com/?subscribed=1
 *  4. Copy the Payment Link URL and set:
 *       VITE_STRIPE_PAYMENT_LINK=https://buy.stripe.com/xxxx
 *
 * On return the app detects ?subscribed=1 and grants 30 days of Pro access.
 * For real payment verification add a Supabase/Vercel backend with Stripe webhooks.
 */

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const STRIPE_PAYMENT_LINK: string = env?.VITE_STRIPE_PAYMENT_LINK ?? '';
export const STRIPE_PRICE = '$9.99';
export const STRIPE_PERIOD = 'month';

export function isStripeConfigured(): boolean {
  return STRIPE_PAYMENT_LINK.length > 0;
}

/** Open the Stripe Payment Link in a new tab. */
export function openCheckout(): void {
  if (!STRIPE_PAYMENT_LINK) return;
  window.open(STRIPE_PAYMENT_LINK, '_blank', 'noopener,noreferrer');
}
