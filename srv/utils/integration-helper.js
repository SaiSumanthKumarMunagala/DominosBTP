/**
 * Integration Helper — wires real Stripe and Twilio.
 * REPLACE the existing srv/utils/integration-helper.js with this file.
 */

const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

const stripeClient = require('./stripe-client');
const twilioClient = require('./twilio-client');

const integrationHelper = {

    // ═══════════════════════════════════════════
    //  PAYMENT — real Stripe
    // ═══════════════════════════════════════════
    async processPayment({ orderId, orderNumber, amount, currency, method, customerEmail }) {
        console.log(`[PAYMENT] Processing $${amount} for ${orderNumber}`);

        const result = await stripeClient.createPayment({
            amount, currency, orderNumber, customerEmail
        });

        await this.logIntegration({
            system: 'STRIPE',
            endpoint: '/v1/payment_intents',
            method: 'POST',
            orderId,
            statusCode: result.success ? 200 : 400,
            requestBody: JSON.stringify({ amount, currency, orderNumber }),
            responseBody: JSON.stringify(result)
        });

        return result;
    },

    async processRefund({ orderId, paymentRef, amount }) {
        console.log(`[REFUND] Refunding $${amount} for order ${orderId}`);

        const result = await stripeClient.createRefund({
            paymentIntentId: paymentRef,
            amount
        });

        await this.logIntegration({
            system: 'STRIPE',
            endpoint: '/v1/refunds',
            method: 'POST',
            orderId,
            statusCode: result.success ? 200 : 400,
            responseBody: JSON.stringify(result)
        });

        return result;
    },


    // ═══════════════════════════════════════════
    //  SMS — real Twilio
    // ═══════════════════════════════════════════
    async sendSMS({ phone, message }) {
        console.log(`[SMS] Sending to ${phone}`);

        const result = await twilioClient.sendSMS({
            to: phone,
            body: message
        });

        await this.logIntegration({
            system: 'TWILIO',
            endpoint: '/Messages.json',
            method: 'POST',
            statusCode: result.success ? 200 : 500,
            requestBody: JSON.stringify({ to: phone, body: message }),
            responseBody: JSON.stringify(result)
        });

        return result;
    },


    // ═══════════════════════════════════════════
    //  DELIVERY — mocked (real DoorDash needs business account)
    // ═══════════════════════════════════════════
    async dispatchToDeliveryPartner({ orderId, storeAddress, deliveryAddress, items }) {
        console.log(`[DELIVERY] Dispatching order ${orderId}`);
        return {
            success: true,
            trackingId: `DLV-${uuidv4().slice(0, 8).toUpperCase()}`,
            estimatedMinutes: 15 + Math.floor(Math.random() * 10)
        };
    },


    // ═══════════════════════════════════════════
    //  EVENT MESH — local for dev
    // ═══════════════════════════════════════════
    async publishEvent({ topic, data }) {
        console.log(`[EVENT] Topic: ${topic} | Data: ${JSON.stringify(data)}`);
        return { published: true };
    },


    async postToERP({ orderId, orderNumber, totalAmount, storeCode, orderDate }) {
        console.log(`[ERP] Posting revenue $${totalAmount} for order ${orderNumber}`);
        return { success: true, documentNumber: `DOC-${Date.now()}` };
    },


    // ═══════════════════════════════════════════
    //  AUDIT LOG
    // ═══════════════════════════════════════════
    async logIntegration({ system, endpoint, method, orderId, statusCode, requestBody, responseBody, errorMessage }) {
        try {
            await INSERT.into('com.dominos.IntegrationLogs').entries({
                ID: uuidv4(),
                timestamp: new Date().toISOString(),
                direction: 'OUTBOUND',
                system,
                endpoint,
                method: method || 'POST',
                requestBody: requestBody || null,
                responseBody: responseBody || null,
                statusCode: statusCode || 0,
                duration: 0,
                orderId: orderId || null,
                errorMessage: errorMessage || null,
                retryCount: 0
            });
        } catch (e) {
            console.error('[INT-LOG] Failed:', e.message);
        }
    }
};

module.exports = integrationHelper;
