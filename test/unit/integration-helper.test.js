const integrationHelper = require('../../srv/utils/integration-helper');

describe('Integration Helper — Mock Mode', () => {

    describe('processPayment', () => {
        it('returns a transaction result', async () => {
            const result = await integrationHelper.processPayment({
                orderId: 'test-001',
                orderNumber: 'NYC01-250406-1234',
                amount: 29.99,
                currency: 'USD',
                method: 'CARD',
                customerEmail: 'test@test.com'
            });

            expect(result).toBeDefined();
            expect(typeof result.success).toBe('boolean');
            expect(result.timestamp).toBeDefined();
            if (result.success) {
                expect(result.transactionId).toMatch(/^TXN-/);
            }
        });
    });

    describe('processRefund', () => {
        it('returns a refund result', async () => {
            const result = await integrationHelper.processRefund({
                orderId: 'test-001',
                paymentRef: 'TXN-ABCD1234',
                amount: 29.99
            });
            expect(result.success).toBe(true);
            expect(result.refundId).toMatch(/^REF-/);
        });
    });

    describe('sendSMS', () => {
        it('returns success in mock mode', async () => {
            const result = await integrationHelper.sendSMS({
                phone: '+1-555-0001',
                message: 'Test notification'
            });
            expect(result.success).toBe(true);
            expect(result.messageId).toMatch(/^MSG-/);
        });
    });

    describe('dispatchToDeliveryPartner', () => {
        it('returns tracking info', async () => {
            const result = await integrationHelper.dispatchToDeliveryPartner({
                orderId: 'test-001',
                storeAddress: '1560 Broadway, NYC',
                deliveryAddress: '123 Main St, NYC',
                items: [{ name: 'Margherita', qty: 1 }]
            });
            expect(result.success).toBe(true);
            expect(result.trackingId).toMatch(/^DLV-/);
            expect(result.estimatedMinutes).toBeGreaterThan(0);
        });
    });

    describe('publishEvent', () => {
        it('publishes event in mock mode', async () => {
            const result = await integrationHelper.publishEvent({
                topic: 'dominos/order/delivered',
                data: { orderId: 'test-001', status: 'DELIVERED' }
            });
            expect(result.published).toBe(true);
        });
    });

    describe('postToERP', () => {
        it('returns document number', async () => {
            const result = await integrationHelper.postToERP({
                orderId: 'test-001',
                orderNumber: 'NYC01-250406-1234',
                totalAmount: 29.99,
                storeCode: 'NYC01',
                orderDate: '2025-04-06'
            });
            expect(result.success).toBe(true);
            expect(result.documentNumber).toMatch(/^DOC-/);
        });
    });
});
