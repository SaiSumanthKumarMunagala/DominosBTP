/**
 * Stripe payment client.
 * Drop this file into: srv/utils/stripe-client.js
 *
 * Requires: npm install stripe
 * Set STRIPE_SECRET_KEY in your .env file (use sk_test_... for test mode)
 */

const Stripe = require('stripe');

const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey) {
    console.warn('[STRIPE] STRIPE_SECRET_KEY not set — payments will use mock mode');
}

const stripe = stripeKey ? new Stripe(stripeKey) : null;

module.exports = {

    async createPayment({ amount, currency, orderNumber, customerEmail }) {
        if (!stripe) {
            return {
                success: true,
                transactionId: `MOCK-${Date.now()}`,
                message: 'Mock payment (no Stripe key configured)',
                timestamp: new Date().toISOString()
            };
        }

        try {
            const intent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100),
                currency: currency.toLowerCase(),
                description: `Domino's Order ${orderNumber}`,
                receipt_email: customerEmail,
                payment_method: 'pm_card_visa',
                confirm: true,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: 'never'
                }
            });

            console.log(`[STRIPE] Payment ${intent.status}: ${intent.id}`);

            return {
                success: intent.status === 'succeeded',
                transactionId: intent.id,
                message: `Payment ${intent.status}`,
                amount: intent.amount / 100,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            console.error('[STRIPE] Payment error:', err.message);
            return {
                success: false,
                transactionId: null,
                message: err.message,
                timestamp: new Date().toISOString()
            };
        }
    },

    async createRefund({ paymentIntentId, amount }) {
        if (!stripe) {
            return { success: true, refundId: `MOCK-REF-${Date.now()}` };
        }

        try {
            const refund = await stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: Math.round(amount * 100)
            });
            console.log(`[STRIPE] Refund ${refund.status}: ${refund.id}`);
            return {
                success: refund.status === 'succeeded',
                refundId: refund.id
            };
        } catch (err) {
            console.error('[STRIPE] Refund error:', err.message);
            return { success: false, refundId: null };
        }
    }
};
