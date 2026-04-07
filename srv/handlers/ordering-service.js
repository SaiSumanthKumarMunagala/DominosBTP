const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

class OrderingServiceHandler extends cds.ApplicationService {

    async init() {
        const {
            Orders, OrderItems, OrderStatusHistory,
            MenuItems, ItemSizes, Customers, Coupons,
            Stores, CustomerAddresses
        } = this.entities;

        const db = await cds.connect.to('db');
        const integrationHelper = require('../utils/integration-helper');

        // ─────────────────────────────────────
        //  placeOrder — main customer action
        // ─────────────────────────────────────
        this.on('placeOrder', async (req) => {
            const {
                customerId, storeId, addressId, orderType,
                items, couponCode, paymentMethod, tipAmount,
                specialInstructions
            } = req.data;

            // 1. Validate customer
            const customer = await SELECT.one.from('com.dominos.Customers').where({ ID: customerId });
            if (!customer) return req.error(404, 'Customer not found.');

            // 2. Validate store
            const store = await SELECT.one.from('com.dominos.Stores').where({ ID: storeId });
            if (!store || !store.isOpen) return req.error(400, 'Store is currently closed.');

            // 3. Build order items with pricing
            let subtotal = 0;
            const orderItems = [];

            for (const item of items) {
                const menuItem = await SELECT.one.from('com.dominos.MenuItems').where({ ID: item.menuItemId });
                if (!menuItem || !menuItem.isAvailable) {
                    return req.error(400, `Item ${item.menuItemId} is not available.`);
                }

                // Get size price addon
                let sizeAddon = 0;
                if (item.size) {
                    const sizeRecord = await SELECT.one.from('com.dominos.ItemSizes')
                        .where({ menuItem_ID: item.menuItemId, size: item.size });
                    if (sizeRecord) sizeAddon = sizeRecord.priceAddon || 0;
                }

                const unitPrice = parseFloat(menuItem.basePrice) + parseFloat(sizeAddon);
                const qty = item.quantity || 1;
                const totalPrice = unitPrice * qty;
                subtotal += totalPrice;

                orderItems.push({
                    ID: uuidv4(),
                    menuItem_ID: item.menuItemId,
                    size: item.size || 'MEDIUM',
                    quantity: qty,
                    unitPrice,
                    totalPrice,
                    customizations: item.customizations || null,
                    specialNotes: item.specialNotes || null
                });
            }

            // 4. Apply coupon
            let discountAmount = 0;
            if (couponCode) {
                const couponResult = await this._validateCoupon(couponCode, subtotal);
                if (couponResult.isValid) {
                    discountAmount = couponResult.discountAmount;
                    // Increment coupon usage
                    await UPDATE('com.dominos.Coupons')
                        .set({ usedCount: { '+=': 1 } })
                        .where({ code: couponCode });
                }
            }

            // 5. Calculate totals
            const TAX_RATE = 0.08;
            const DELIVERY_FEE = orderType === 'DELIVERY' ? 4.99 : 0;
            const taxAmount = Math.round((subtotal - discountAmount) * TAX_RATE * 100) / 100;
            const tip = parseFloat(tipAmount) || 0;
            const totalAmount = Math.round((subtotal - discountAmount + taxAmount + DELIVERY_FEE + tip) * 100) / 100;

            // 6. Generate order number
            const orderNumber = await this._generateOrderNumber(store.code);

            // 7. Estimate delivery time
            const now = new Date();
            const prepMin = store.avgPrepTime || 20;
            const deliveryMin = orderType === 'DELIVERY' ? 15 : 0;
            const estimatedDelivery = new Date(now.getTime() + (prepMin + deliveryMin) * 60000);

            // 8. Create order
            const orderId = uuidv4();
            const orderData = {
                ID: orderId,
                orderNumber,
                customer_ID: customerId,
                store_ID: storeId,
                deliveryAddress_ID: addressId || null,
                orderType: orderType || 'DELIVERY',
                status: 'PLACED',
                subtotal,
                taxAmount,
                deliveryFee: DELIVERY_FEE,
                discountAmount,
                tipAmount: tip,
                totalAmount,
                currency: 'USD',
                couponCode: couponCode || null,
                paymentMethod: paymentMethod || 'CARD',
                paymentStatus: 'PENDING',
                orderPlacedAt: now.toISOString(),
                estimatedDelivery: estimatedDelivery.toISOString(),
                specialInstructions: specialInstructions || null
            };

            await INSERT.into('com.dominos.Orders').entries(orderData);

            // 9. Insert order items
            for (const oi of orderItems) {
                oi.order_ID = orderId;
                await INSERT.into('com.dominos.OrderItems').entries(oi);
            }

            // 10. Add status history entry
            await this._addStatusHistory(orderId, 'PLACED', 'Order placed by customer', req.user.id);

            // 11. Process payment (Integration Suite → Payment Gateway)
            try {
                const paymentResult = await integrationHelper.processPayment({
                    orderId,
                    orderNumber,
                    amount: totalAmount,
                    currency: 'USD',
                    method: paymentMethod,
                    customerEmail: customer.email
                });

                await UPDATE('com.dominos.Orders', orderId).with({
                    paymentStatus: paymentResult.success ? 'PAID' : 'FAILED',
                    paymentRef: paymentResult.transactionId || null
                });

                // Log integration
                await integrationHelper.logIntegration({
                    system: 'PAYMENT_GW', endpoint: '/payments/charge',
                    method: 'POST', orderId, statusCode: paymentResult.success ? 200 : 400,
                    requestBody: JSON.stringify({ amount: totalAmount, method: paymentMethod }),
                    responseBody: JSON.stringify(paymentResult)
                });
            } catch (e) {
                console.error('Payment processing error:', e.message);
                await UPDATE('com.dominos.Orders', orderId).with({ paymentStatus: 'FAILED' });
            }

            // 12. Send SMS notification (Integration Suite → SMS Gateway)
            try {
                await integrationHelper.sendSMS({
                    phone: customer.phone,
                    message: `Your Domino's order #${orderNumber} has been placed! Estimated delivery: ${estimatedDelivery.toLocaleTimeString()}.`
                });
            } catch (e) {
                console.error('SMS notification error:', e.message);
            }

            // 13. Update customer stats
            await UPDATE('com.dominos.Customers', customerId).with({
                totalOrders: { '+=': 1 },
                loyaltyPoints: { '+=': Math.floor(totalAmount * 10) }
            });

            return SELECT.one.from('com.dominos.Orders').where({ ID: orderId });
        });


        // ─────────────────────────────────────
        //  cancelOrder
        // ─────────────────────────────────────
        this.on('cancelOrder', async (req) => {
            const { orderId, reason } = req.data;
            const order = await SELECT.one.from('com.dominos.Orders').where({ ID: orderId });
            if (!order) return req.error(404, 'Order not found.');

            const cancellableStatuses = ['PLACED', 'CONFIRMED'];
            if (!cancellableStatuses.includes(order.status)) {
                return req.error(400, `Cannot cancel order in "${order.status}" status. Order is already being prepared.`);
            }

            await UPDATE('com.dominos.Orders', orderId).with({ status: 'CANCELLED' });
            await this._addStatusHistory(orderId, 'CANCELLED', reason || 'Cancelled by customer', req.user.id);

            // Trigger refund via Integration Suite
            if (order.paymentStatus === 'PAID') {
                try {
                    await integrationHelper.processRefund({
                        orderId, paymentRef: order.paymentRef, amount: order.totalAmount
                    });
                    await UPDATE('com.dominos.Orders', orderId).with({ paymentStatus: 'REFUNDED' });
                } catch (e) {
                    console.error('Refund error:', e.message);
                }
            }

            return SELECT.one.from('com.dominos.Orders').where({ ID: orderId });
        });


        // ─────────────────────────────────────
        //  rateOrder
        // ─────────────────────────────────────
        this.on('rateOrder', async (req) => {
            const { orderId, rating, feedback } = req.data;
            if (rating < 1 || rating > 5) return req.error(400, 'Rating must be between 1 and 5.');

            await UPDATE('com.dominos.Orders', orderId).with({ rating, feedback });
            return SELECT.one.from('com.dominos.Orders').where({ ID: orderId });
        });


        // ─────────────────────────────────────
        //  Functions
        // ─────────────────────────────────────

        this.on('getMenuByCategory', async (req) => {
            const { categoryId } = req.data;
            return SELECT.from('com.dominos.MenuItems')
                .where({ category_ID: categoryId, isAvailable: true })
                .orderBy('isBestseller desc', 'name asc');
        });

        this.on('getNearestStore', async (req) => {
            const { lat, lng } = req.data;
            const stores = await SELECT.from('com.dominos.Stores').where({ isOpen: true });

            let nearest = null;
            let minDist = Infinity;
            for (const store of stores) {
                if (store.latitude && store.longitude) {
                    const dist = this._haversineDistance(lat, lng, store.latitude, store.longitude);
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = store;
                    }
                }
            }
            return nearest;
        });

        this.on('validateCoupon', async (req) => {
            return this._validateCoupon(req.data.code, req.data.subtotal);
        });

        this.on('trackOrder', async (req) => {
            const { orderId } = req.data;
            const order = await SELECT.one.from('com.dominos.Orders').where({ ID: orderId });
            if (!order) return req.error(404, 'Order not found.');

            const history = await SELECT.from('com.dominos.OrderStatusHistory')
                .where({ order_ID: orderId })
                .orderBy('timestamp asc');

            let agentName = null, agentPhone = null;
            if (order.deliveryAgent_ID) {
                const agent = await SELECT.one.from('com.dominos.DeliveryAgents')
                    .where({ ID: order.deliveryAgent_ID });
                if (agent) {
                    agentName = agent.name;
                    agentPhone = agent.phone;
                }
            }

            const stepMap = {
                'PLACED': 1, 'CONFIRMED': 2, 'PREPARING': 3,
                'BAKING': 4, 'QUALITY_CHECK': 5,
                'OUT_FOR_DELIVERY': 6, 'DELIVERED': 7,
                'READY_FOR_PICKUP': 6, 'PICKED_UP': 7,
                'CANCELLED': 0
            };

            const statusMessages = {
                'PLACED': 'Your order has been received!',
                'CONFIRMED': 'Your order is confirmed by the store.',
                'PREPARING': 'Our chefs are crafting your order.',
                'BAKING': 'Your pizza is in the oven — almost there!',
                'QUALITY_CHECK': 'Final quality check in progress.',
                'OUT_FOR_DELIVERY': 'Your order is on its way!',
                'DELIVERED': 'Enjoy your meal!',
                'READY_FOR_PICKUP': 'Your order is ready! Come pick it up.',
                'PICKED_UP': 'Order picked up. Enjoy!',
                'CANCELLED': 'This order has been cancelled.'
            };

            return {
                orderId: order.ID,
                orderNumber: order.orderNumber,
                status: order.status,
                statusMessage: statusMessages[order.status] || order.status,
                estimatedDelivery: order.estimatedDelivery,
                agentName,
                agentPhone,
                currentStep: stepMap[order.status] || 0,
                totalSteps: order.orderType === 'PICKUP' ? 7 : 7,
                history: history.map(h => ({
                    status: h.status,
                    timestamp: h.timestamp,
                    message: statusMessages[h.status] || h.notes
                }))
            };
        });

        this.on('getOrderHistory', async (req) => {
            const { customerId } = req.data;
            return SELECT.from('com.dominos.Orders')
                .where({ customer_ID: customerId })
                .orderBy('orderPlacedAt desc')
                .limit(20);
        });


        // ─────────────────────────────────────
        //  Private Helpers
        // ─────────────────────────────────────

        await super.init();
    }

    async _validateCoupon(code, subtotal) {
        if (!code) return { isValid: false, discountAmount: 0, message: 'No coupon code provided.' };

        const coupon = await SELECT.one.from('com.dominos.Coupons').where({ code, isActive: true });
        if (!coupon) return { isValid: false, discountAmount: 0, message: 'Invalid coupon code.' };

        const today = new Date().toISOString().split('T')[0];
        if (coupon.validFrom && today < coupon.validFrom) return { isValid: false, discountAmount: 0, message: 'Coupon is not yet active.' };
        if (coupon.validTo && today > coupon.validTo) return { isValid: false, discountAmount: 0, message: 'Coupon has expired.' };
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return { isValid: false, discountAmount: 0, message: 'Coupon usage limit reached.' };
        if (subtotal < coupon.minOrderValue) return { isValid: false, discountAmount: 0, message: `Minimum order value is $${coupon.minOrderValue}.` };

        let discountAmount = 0;
        if (coupon.discountType === 'PERCENT') {
            discountAmount = Math.round(subtotal * (coupon.discountValue / 100) * 100) / 100;
        } else if (coupon.discountType === 'FLAT') {
            discountAmount = coupon.discountValue;
        } else if (coupon.discountType === 'BOGO') {
            discountAmount = 0; // handled in item logic
        }

        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
            discountAmount = coupon.maxDiscount;
        }

        return { isValid: true, discountAmount, message: `Coupon applied! You save $${discountAmount}.` };
    }

    async _generateOrderNumber(storeCode) {
        const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        return `${storeCode}-${datePart}-${random}`;
    }

    async _addStatusHistory(orderId, status, notes, userId) {
        await INSERT.into('com.dominos.OrderStatusHistory').entries({
            ID: uuidv4(),
            order_ID: orderId,
            status,
            timestamp: new Date().toISOString(),
            updatedBy: userId || 'SYSTEM',
            notes
        });
    }

    _haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}

module.exports = OrderingServiceHandler;
