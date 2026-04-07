const cds = require('@sap/cds');

describe('OrderingService — Integration Tests', () => {
    let app;

    beforeAll(async () => {
        app = await cds.test(__dirname + '/../..');
    });

    // ── Menu ──
    describe('GET /api/order/MenuItems', () => {
        it('returns menu items', async () => {
            const { status, data } = await app.get('/api/order/MenuItems')
                .auth('customer', 'customer');
            expect(status).toBe(200);
            expect(data.value.length).toBeGreaterThan(0);
        });

        it('includes pizza items', async () => {
            const { data } = await app.get("/api/order/MenuItems?$filter=category_ID eq 'cat01'")
                .auth('customer', 'customer');
            expect(data.value.length).toBeGreaterThan(5);
        });
    });

    // ── Categories ──
    describe('GET /api/order/Categories', () => {
        it('returns 5 categories', async () => {
            const { data } = await app.get('/api/order/Categories')
                .auth('customer', 'customer');
            expect(data.value.length).toBe(5);
        });
    });

    // ── Stores ──
    describe('GET /api/order/Stores', () => {
        it('returns open stores', async () => {
            const { data } = await app.get("/api/order/Stores?$filter=isOpen eq true")
                .auth('customer', 'customer');
            expect(data.value.length).toBeGreaterThan(0);
        });
    });

    // ── Coupons ──
    describe('GET /api/order/Coupons', () => {
        it('returns active coupons', async () => {
            const { data } = await app.get("/api/order/Coupons?$filter=isActive eq true")
                .auth('customer', 'customer');
            expect(data.value.length).toBeGreaterThan(0);
        });
    });

    // ── Coupon Validation ──
    describe('validateCoupon()', () => {
        it('validates a valid coupon', async () => {
            const { data } = await app.get("/api/order/validateCoupon(code='WELCOME20',subtotal=50)")
                .auth('customer', 'customer');
            expect(data.isValid).toBe(true);
            expect(data.discountAmount).toBeGreaterThan(0);
        });

        it('rejects invalid coupon', async () => {
            const { data } = await app.get("/api/order/validateCoupon(code='FAKECODE',subtotal=50)")
                .auth('customer', 'customer');
            expect(data.isValid).toBe(false);
        });

        it('rejects below minimum order', async () => {
            const { data } = await app.get("/api/order/validateCoupon(code='FLAT5',subtotal=10)")
                .auth('customer', 'customer');
            expect(data.isValid).toBe(false);
            expect(data.message).toContain('Minimum');
        });
    });

    // ── Place Order ──
    describe('placeOrder()', () => {
        it('places a valid order', async () => {
            const { status, data } = await app.post('/api/order/placeOrder', {
                customerId: 'c001',
                storeId: 'str01',
                orderType: 'DELIVERY',
                items: [
                    { menuItemId: 'mi01', size: 'MEDIUM', quantity: 2 },
                    { menuItemId: 'mi08', size: 'REGULAR', quantity: 1 },
                    { menuItemId: 'mi10', size: 'REGULAR', quantity: 2 }
                ],
                paymentMethod: 'CARD',
                tipAmount: 3.00,
                specialInstructions: 'Ring the doorbell twice'
            }).auth('customer', 'customer');

            expect(status).toBe(200);
            expect(data.orderNumber).toBeDefined();
            expect(data.status).toBe('PLACED');
            expect(data.totalAmount).toBeGreaterThan(0);
        });

        it('rejects order for closed store', async () => {
            // All seed stores are open, so this tests the validation path
            const { status } = await app.post('/api/order/placeOrder', {
                customerId: 'c001',
                storeId: 'nonexistent',
                items: [{ menuItemId: 'mi01', size: 'MEDIUM', quantity: 1 }],
                paymentMethod: 'CARD'
            }).auth('customer', 'customer');

            expect(status).toBeGreaterThanOrEqual(400);
        });
    });

    // ── Security ──
    describe('Security', () => {
        it('rejects unauthenticated access', async () => {
            const { status } = await app.get('/api/order/MenuItems');
            expect(status).toBe(401);
        });

        it('rejects customer from store service', async () => {
            const { status } = await app.get('/api/store/Orders')
                .auth('customer', 'customer');
            expect(status).toBe(403);
        });

        it('rejects customer from admin service', async () => {
            const { status } = await app.get('/api/admin/Orders')
                .auth('customer', 'customer');
            expect(status).toBe(403);
        });
    });
});

describe('StoreService — Integration Tests', () => {
    let app;

    beforeAll(async () => {
        app = await cds.test(__dirname + '/../..');
    });

    describe('Store Operations', () => {
        it('store manager can access orders', async () => {
            const { status } = await app.get('/api/store/Orders')
                .auth('store_mgr', 'store');
            expect(status).toBe(200);
        });

        it('store manager can access delivery agents', async () => {
            const { data } = await app.get('/api/store/DeliveryAgents')
                .auth('store_mgr', 'store');
            expect(data.value.length).toBeGreaterThan(0);
        });
    });
});
