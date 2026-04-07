const cds = require('@sap/cds');

class AdminServiceHandler extends cds.ApplicationService {

    async init() {

        this.on('getSalesReport', async (req) => {
            const { storeId, fromDate, toDate } = req.data;
            let query = SELECT.from('com.dominos.Orders');

            if (storeId) query = query.where({ store_ID: storeId });

            const orders = await query;
            const filtered = orders.filter(o => {
                const placed = o.orderPlacedAt ? o.orderPlacedAt.split('T')[0] : null;
                if (!placed) return false;
                if (fromDate && placed < fromDate) return false;
                if (toDate && placed > toDate) return false;
                return true;
            });

            const completed = filtered.filter(o => ['DELIVERED', 'PICKED_UP'].includes(o.status));
            const cancelled = filtered.filter(o => o.status === 'CANCELLED');
            const totalRevenue = completed.reduce((s, o) => s + parseFloat(o.totalAmount || 0), 0);

            // Find top coupon
            const couponCounts = {};
            filtered.forEach(o => {
                if (o.couponCode) couponCounts[o.couponCode] = (couponCounts[o.couponCode] || 0) + 1;
            });
            const topCoupon = Object.entries(couponCounts).sort((a, b) => b[1] - a[1])[0];

            return {
                totalOrders: filtered.length,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                avgOrderValue: filtered.length > 0 ? Math.round((totalRevenue / completed.length) * 100) / 100 : 0,
                cancelRate: filtered.length > 0 ? Math.round((cancelled.length / filtered.length) * 10000) / 100 : 0,
                topCoupon: topCoupon ? topCoupon[0] : 'None'
            };
        });

        this.on('getPopularItems', async (req) => {
            const { storeId, limit } = req.data;
            const maxItems = limit || 10;

            let orderIds;
            if (storeId) {
                const orders = await SELECT.from('com.dominos.Orders')
                    .columns('ID')
                    .where({ store_ID: storeId, status: { in: ['DELIVERED', 'PICKED_UP'] } });
                orderIds = orders.map(o => o.ID);
            }

            const items = await SELECT.from('com.dominos.OrderItems');
            const filtered = orderIds ? items.filter(i => orderIds.includes(i.order_ID)) : items;

            const itemMap = {};
            filtered.forEach(i => {
                if (!itemMap[i.menuItem_ID]) itemMap[i.menuItem_ID] = { qty: 0, revenue: 0 };
                itemMap[i.menuItem_ID].qty += i.quantity || 1;
                itemMap[i.menuItem_ID].revenue += parseFloat(i.totalPrice || 0);
            });

            const menuItems = await SELECT.from('com.dominos.MenuItems');
            const miMap = {};
            menuItems.forEach(m => { miMap[m.ID] = m.name; });

            return Object.entries(itemMap)
                .map(([id, data]) => ({
                    itemName: miMap[id] || id,
                    totalSold: data.qty,
                    revenue: Math.round(data.revenue * 100) / 100
                }))
                .sort((a, b) => b.totalSold - a.totalSold)
                .slice(0, maxItems);
        });

        this.on('getDeliveryPerformance', async (req) => {
            const { storeId } = req.data;
            const orders = await SELECT.from('com.dominos.Orders')
                .where({ store_ID: storeId, status: 'DELIVERED' });

            if (orders.length === 0) {
                return { avgDeliveryMin: 0, onTimeRate: 0, avgRating: 0 };
            }

            let totalMin = 0, onTime = 0, totalRating = 0, ratedCount = 0;
            orders.forEach(o => {
                if (o.orderPlacedAt && o.actualDelivery) {
                    const min = (new Date(o.actualDelivery) - new Date(o.orderPlacedAt)) / 60000;
                    totalMin += min;
                    if (o.estimatedDelivery && new Date(o.actualDelivery) <= new Date(o.estimatedDelivery)) {
                        onTime++;
                    }
                }
                if (o.rating) {
                    totalRating += o.rating;
                    ratedCount++;
                }
            });

            return {
                avgDeliveryMin: Math.round((totalMin / orders.length) * 10) / 10,
                onTimeRate: Math.round((onTime / orders.length) * 10000) / 100,
                avgRating: ratedCount > 0 ? Math.round((totalRating / ratedCount) * 10) / 10 : 0
            };
        });

        await super.init();
    }
}

module.exports = AdminServiceHandler;
