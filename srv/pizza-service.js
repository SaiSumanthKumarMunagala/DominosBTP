const OrderingServiceHandler = require('./handlers/ordering-service');
const StoreServiceHandler    = require('./handlers/store-service');
const AdminServiceHandler    = require('./handlers/admin-service');

module.exports = {
    OrderingService : OrderingServiceHandler,
    StoreService    : StoreServiceHandler,
    AdminService    : AdminServiceHandler
};
