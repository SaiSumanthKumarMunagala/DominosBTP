const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

class StoreServiceHandler extends cds.ApplicationService {

    async init() {
        const integrationHelper = require('../utils/integration-helper');

        // ── Status transitions (each action advances status) ──

        const statusFlow = {
            confirmOrder:    { from: 'PLACED',          to: 'CONFIRMED',         msg: 'Order confirmed by store' },
            startPreparing:  { from: 'CONFIRMED',       to: 'PREPARING',         msg: 'Preparation started' },
            markBaking:      { from: 'PREPARING',       to: 'BAKING',            msg: 'Pizza is in the oven' },
            qualityCheck:    { from: 'BAKING',          to: 'QUALITY_CHECK',     msg: 'Quality check in progress' },
            readyForPickup:  { from: 'QUALITY_CHECK',   to: 'READY_FOR_PICKUP',  msg: 'Order ready for pickup' },
            dispatchOrder:   { from: 'QUALITY_CHECK',   to: 'OUT_FOR_DELIVERY',  msg: 'Order dispatched for delivery' },
            markDelivered:   { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED',        msg: 'Order delivered to customer' }
        };

        // Register all status transition actions
        for (const [actionName, config] of Object.entries(statusFlow)) {
            this.on(actionName, async (req) => {
                const { orderId, agentId } = req.data;

                const order = await SELECT.one.from('com.dominos.Orders').where({ ID: orderId });
                if (!order) return req.error(404, 'Order not found.');
                if (order.status !== config.from) {
                    return req.error(400, `Cannot ${actionName}: order is in "${order.status}" status, expected "${config.from}".`);
                }

                const updateData = { status: config.to };

                // Special logic per action
                if (actionName === 'startPreparing') {
                    updateData.prepStartedAt = new Date().toISOString();
                }

                if (actionName === 'qualityCheck') {
                    updateData.prepCompletedAt = new Date().toISOString();
                }

                if (actionName === 'dispatchOrder' && agentId) {
                    updateData.deliveryAgent_ID = agentId;
                    // Mark agent as unavailable
                    await UPDATE('com.dominos.DeliveryAgents', agentId).with({ isAvailable: false });
                }

                if (actionName === 'markDelivered') {
                    updateData.actualDelivery = new Date().toISOString();
                    // Release delivery agent
                    if (order.deliveryAgent_ID) {
                        await UPDATE('com.dominos.DeliveryAgents', order.deliveryAgent_ID).with({
                            isAvailable: true,
                            totalDeliveries: { '+=': 1 }
                        });
                    }
                }

                await UPDATE('com.dominos.Orders', orderId).with(updateData);

                // Add to status history
                await INSERT.into('com.dominos.OrderStatusHistory').entries({
                    ID: uuidv4(),
                    order_ID: orderId,
                    status: config.to,
                    timestamp: new Date().toISOString(),
                    updatedBy: req.user.id,
                    notes: config.msg
                });

                // SMS notification for key milestones
                const notifyStatuses = ['CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP'];
                if (notifyStatuses.includes(config.to)) {
                    try {
                        const customer = await SELECT.one.from('com.dominos.Customers')
                            .where({ ID: order.customer_ID });
                        if (customer) {
                            const smsMessages = {
                                'CONFIRMED': `Order #${order.orderNumber} confirmed! We're getting it ready.`,
                                'OUT_FOR_DELIVERY': `Order #${order.orderNumber} is on its way! Track it live.`,
                                'DELIVERED': `Order #${order.orderNumber} delivered. Enjoy!`,
                                'READY_FOR_PICKUP': `Order #${order.orderNumber} is ready for pickup!`
                            };
                            await integrationHelper.sendSMS({
                                phone: customer.phone,
                                message: smsMessages[config.to]
                            });
                        }
                    } catch (e) {
                        console.error('SMS notification error:', e.message);
                    }
                }

                // Push event to SAP Event Mesh (Integration Suite)
                try {
                    await integrationHelper.publishEvent({
                        topic: `dominos/order/${config.to.toLowerCase()}`,
                        data: { orderId, orderNumber: order.orderNumber, status: config.to, storeId: order.store_ID }
                    });
                } catch (e) {
                    console.error('Event publish error:', e.message);
                }

                return SELECT.one.from('com.dominos.Orders').where({ ID: orderId });
            });
        }


        // ── getActiveOrders ──
        this.on('getActiveOrders', async (req) => {
            const { storeId } = req.data;
            const activeStatuses = ['PLACED', 'CONFIRMED', 'PREPARING', 'BAKING', 'QUALITY_CHECK', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'];
            return SELECT.from('com.dominos.Orders')
                .where({ store_ID: storeId, status: { in: activeStatuses } })
                .orderBy('orderPlacedAt asc');
        });

        // ── getAvailableAgents ──
        this.on('getAvailableAgents', async (req) => {
            const { storeId } = req.data;
            return SELECT.from('com.dominos.DeliveryAgents')
                .where({ store_ID: storeId, isAvailable: true });
        });

        // ── getStoreMetrics ──
        this.on('getStoreMetrics', async (req) => {
            const { storeId } = req.data;
            const today = new Date().toISOString().split('T')[0];

            const todaysOrders = await SELECT.from('com.dominos.Orders')
                .where({ store_ID: storeId })
                .and(`orderPlacedAt >= '${today}'`);

            const activeStatuses = ['PLACED', 'CONFIRMED', 'PREPARING', 'BAKING', 'QUALITY_CHECK', 'OUT_FOR_DELIVERY'];
            const active = todaysOrders.filter(o => activeStatuses.includes(o.status));
            const completed = todaysOrders.filter(o => o.status === 'DELIVERED' || o.status === 'PICKED_UP');

            const revenue = completed.reduce((sum, o) => sum + parseFloat(o.totalAmount || 0), 0);

            let avgPrep = 0;
            const withPrep = completed.filter(o => o.prepStartedAt && o.prepCompletedAt);
            if (withPrep.length > 0) {
                avgPrep = withPrep.reduce((sum, o) => {
                    return sum + (new Date(o.prepCompletedAt) - new Date(o.prepStartedAt)) / 60000;
                }, 0) / withPrep.length;
            }

            return {
                totalOrdersToday: todaysOrders.length,
                activeOrders: active.length,
                avgPrepTime: Math.round(avgPrep * 10) / 10,
                avgDeliveryTime: 0,
                revenue: Math.round(revenue * 100) / 100,
                topSellingItem: 'Pepperoni Feast'  // simplified
            };
        });

        await super.init();
    }
}

module.exports = StoreServiceHandler;
