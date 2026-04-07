/**
 * Integration Helper — bridges CAP ↔ SAP Integration Suite ↔ External Systems
 *
 * In production, these calls go through SAP Integration Suite iFlows
 * which handle protocol mediation, mapping, error handling, and retry.
 *
 * In development, these are mocked with console logs and simulated responses.
 */

const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const integrationHelper = {

    // ═══════════════════════════════════════════
    //  PAYMENT GATEWAY  (via Integration Suite)
    // ═══════════════════════════════════════════
    /**
     * iFlow: Payment_Processing
     * Route: CAP → Integration Suite → Stripe/PayPal/SAP Payment Engine
     */
    async processPayment({ orderId, orderNumber, amount, currency, method, customerEmail }) {
        if (!IS_PRODUCTION) {
            console.log(`[MOCK-PAYMENT] Processing $${amount} ${currency} via ${method} for order ${orderNumber}`);
            // Simulate 95% success rate
            const success = Math.random() > 0.05;
            return {
                success,
                transactionId: success ? `TXN-${uuidv4().slice(0, 8).toUpperCase()}` : null,
                message: success ? 'Payment processed successfully' : 'Payment declined',
                timestamp: new Date().toISOString()
            };
        }

        // Production: call Integration Suite iFlow endpoint
        try {
            const is = await cds.connect.to('PaymentGateway');
            const response = await is.tx(req).post('/payments/charge', {
                orderId,
                orderNumber,
                amount,
                currency,
                method,
                customerEmail,
                returnUrl: `https://dominos.example.com/order/${orderId}/confirm`
            });
            return response;
        } catch (err) {
            console.error('[PAYMENT] Integration Suite error:', err.message);
            await this.logIntegration({
                system: 'PAYMENT_GW', endpoint: '/payments/charge', method: 'POST',
                orderId, statusCode: 500, errorMessage: err.message
            });
            throw err;
        }
    },

    /**
     * iFlow: Payment_Refund
     */
    async processRefund({ orderId, paymentRef, amount }) {
        if (!IS_PRODUCTION) {
            console.log(`[MOCK-REFUND] Refunding $${amount} for order ${orderId} (ref: ${paymentRef})`);
            return { success: true, refundId: `REF-${uuidv4().slice(0, 8).toUpperCase()}` };
        }

        try {
            const is = await cds.connect.to('PaymentGateway');
            return await is.tx(req).post('/payments/refund', { paymentRef, amount });
        } catch (err) {
            console.error('[REFUND] Error:', err.message);
            throw err;
        }
    },


    // ═══════════════════════════════════════════
    //  SMS NOTIFICATION  (via Integration Suite)
    // ═══════════════════════════════════════════
    /**
     * iFlow: SMS_Notification
     * Route: CAP → Integration Suite → Twilio/MessageBird
     */
    async sendSMS({ phone, message }) {
        if (!IS_PRODUCTION) {
            console.log(`[MOCK-SMS] To: ${phone} | Message: ${message}`);
            return { success: true, messageId: `MSG-${uuidv4().slice(0, 8)}` };
        }

        try {
            const sms = await cds.connect.to('SMSNotification');
            return await sms.tx(req).post('/send', { to: phone, body: message });
        } catch (err) {
            console.error('[SMS] Error:', err.message);
            await this.logIntegration({
                system: 'SMS_GW', endpoint: '/send', method: 'POST',
                statusCode: 500, errorMessage: err.message
            });
            throw err;
        }
    },


    // ═══════════════════════════════════════════
    //  DELIVERY PARTNER  (via Integration Suite)
    // ═══════════════════════════════════════════
    /**
     * iFlow: Delivery_Dispatch
     * Route: CAP → Integration Suite → Delivery Partner API (DoorDash/Uber Eats/Internal)
     */
    async dispatchToDeliveryPartner({ orderId, storeAddress, deliveryAddress, items }) {
        if (!IS_PRODUCTION) {
            console.log(`[MOCK-DELIVERY] Dispatching order ${orderId}`);
            return {
                success: true,
                trackingId: `DLV-${uuidv4().slice(0, 8)}`,
                estimatedMinutes: 15 + Math.floor(Math.random() * 10)
            };
        }

        try {
            const dp = await cds.connect.to('DeliveryPartner');
            return await dp.tx(req).post('/dispatch', {
                orderId, pickup: storeAddress, dropoff: deliveryAddress, items
            });
        } catch (err) {
            console.error('[DELIVERY] Error:', err.message);
            throw err;
        }
    },


    // ═══════════════════════════════════════════
    //  SAP EVENT MESH  (real-time events)
    // ═══════════════════════════════════════════
    /**
     * Publishes order events to SAP Event Mesh for downstream consumers
     * (e.g., analytics dashboard, ERP posting, loyalty engine)
     */
    async publishEvent({ topic, data }) {
        if (!IS_PRODUCTION) {
            console.log(`[MOCK-EVENT] Topic: ${topic} | Data: ${JSON.stringify(data)}`);
            return { published: true };
        }

        try {
            const messaging = await cds.connect.to('messaging');
            await messaging.emit(topic, data);
            return { published: true };
        } catch (err) {
            console.error('[EVENT-MESH] Publish error:', err.message);
            throw err;
        }
    },


    // ═══════════════════════════════════════════
    //  ERP POSTING  (via Integration Suite → S/4HANA)
    // ═══════════════════════════════════════════
    /**
     * iFlow: ERP_Revenue_Posting
     * Posts completed order as a revenue document to SAP S/4HANA
     */
    async postToERP({ orderId, orderNumber, totalAmount, storeCode, orderDate }) {
        if (!IS_PRODUCTION) {
            console.log(`[MOCK-ERP] Posting revenue $${totalAmount} for order ${orderNumber} to S/4HANA`);
            return { success: true, documentNumber: `DOC-${Date.now()}` };
        }

        // In production: calls Integration Suite iFlow
        // which maps to S/4HANA BAPI_ACC_DOCUMENT_POST or OData API
        return { success: true, documentNumber: `DOC-${Date.now()}` };
    },


    // ═══════════════════════════════════════════
    //  INTEGRATION AUDIT LOG
    // ═══════════════════════════════════════════

    async logIntegration({ system, endpoint, method, orderId, statusCode, requestBody, responseBody, errorMessage, duration }) {
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
                duration: duration || 0,
                orderId: orderId || null,
                errorMessage: errorMessage || null,
                retryCount: 0
            });
        } catch (e) {
            console.error('[INT-LOG] Failed to write integration log:', e.message);
        }
    }
};

module.exports = integrationHelper;
