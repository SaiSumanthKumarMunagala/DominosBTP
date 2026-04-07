using com.dominos from '../db/schema/pizza-model';


// ═══════════════════════════════════════════════
//  ORDERING SERVICE  (customer-facing)
// ═══════════════════════════════════════════════

@path: '/api/order'
@requires: 'authenticated-user'
service OrderingService {

    // ── Menu (read-only for customers) ──
    @readonly entity Categories  as projection on dominos.Categories;
    @readonly entity MenuItems   as projection on dominos.MenuItems;
    @readonly entity ItemSizes   as projection on dominos.ItemSizes;
    @readonly entity Toppings    as projection on dominos.Toppings;
    @readonly entity Stores      as projection on dominos.Stores;
    @readonly entity Coupons     as projection on dominos.Coupons;

    // ── Customer profile ──
    entity Customers             as projection on dominos.Customers;
    entity CustomerAddresses     as projection on dominos.CustomerAddresses;

    // ── Orders ──
    @odata.draft.enabled
    entity Orders as projection on dominos.Orders;
    entity OrderItems            as projection on dominos.OrderItems;

    // ── Actions: Order lifecycle ──
    action placeOrder(
        customerId     : UUID,
        storeId        : UUID,
        addressId      : UUID,
        orderType      : String,
        items          : array of OrderItemInput,
        couponCode     : String,
        paymentMethod  : String,
        tipAmount      : Decimal,
        specialInstructions : String
    ) returns Orders;

    action cancelOrder(orderId : UUID, reason : String) returns Orders;
    action rateOrder(orderId : UUID, rating : Integer, feedback : String) returns Orders;

    // ── Functions ──
    function getMenuByCategory(categoryId : UUID) returns array of MenuItems;
    function getNearestStore(lat : Decimal, lng : Decimal) returns Stores;
    function validateCoupon(code : String, subtotal : Decimal) returns CouponValidation;
    function trackOrder(orderId : UUID) returns OrderTrackingInfo;
    function getOrderHistory(customerId : UUID) returns array of Orders;

    // ── Types ──
    type OrderItemInput {
        menuItemId     : UUID;
        size           : String;
        quantity       : Integer;
        customizations : String;
        specialNotes   : String;
    };

    type CouponValidation {
        isValid        : Boolean;
        discountAmount : Decimal;
        message        : String;
    };

    type OrderTrackingInfo {
        orderId        : UUID;
        orderNumber    : String;
        status         : String;
        statusMessage  : String;
        estimatedDelivery : DateTime;
        agentName      : String;
        agentPhone     : String;
        currentStep    : Integer;   // 1-6
        totalSteps     : Integer;
        history        : array of StatusEntry;
    };

    type StatusEntry {
        status    : String;
        timestamp : DateTime;
        message   : String;
    };
}


// ═══════════════════════════════════════════════
//  STORE OPERATIONS SERVICE  (kitchen / store mgr)
// ═══════════════════════════════════════════════

@path: '/api/store'
@requires: 'store_manager'
service StoreService {

    entity Orders as projection on dominos.Orders;
    entity OrderItems as projection on dominos.OrderItems;
    entity OrderStatusHistory as projection on dominos.OrderStatusHistory;
    entity DeliveryAgents as projection on dominos.DeliveryAgents;
    entity Stores as projection on dominos.Stores;

    // ── Kitchen actions ──
    action confirmOrder(orderId : UUID)      returns Orders;
    action startPreparing(orderId : UUID)    returns Orders;
    action markBaking(orderId : UUID)        returns Orders;
    action qualityCheck(orderId : UUID)      returns Orders;
    action readyForPickup(orderId : UUID)    returns Orders;
    action dispatchOrder(orderId : UUID, agentId : UUID) returns Orders;
    action markDelivered(orderId : UUID)     returns Orders;

    // ── Functions ──
    function getActiveOrders(storeId : UUID) returns array of Orders;
    function getAvailableAgents(storeId : UUID) returns array of DeliveryAgents;
    function getStoreMetrics(storeId : UUID) returns StoreMetrics;

    type StoreMetrics {
        totalOrdersToday    : Integer;
        activeOrders        : Integer;
        avgPrepTime         : Decimal;
        avgDeliveryTime     : Decimal;
        revenue             : Decimal;
        topSellingItem      : String;
    };
}


// ═══════════════════════════════════════════════
//  ADMIN / ANALYTICS SERVICE
// ═══════════════════════════════════════════════

@path: '/api/admin'
@requires: 'admin'
service AdminService {

    entity Categories     as projection on dominos.Categories;
    entity MenuItems      as projection on dominos.MenuItems;
    entity Toppings       as projection on dominos.Toppings;
    entity Stores         as projection on dominos.Stores;
    entity Coupons        as projection on dominos.Coupons;
    entity DeliveryAgents as projection on dominos.DeliveryAgents;
    @readonly entity IntegrationLogs as projection on dominos.IntegrationLogs;
    @readonly entity Customers       as projection on dominos.Customers;
    @readonly entity Orders          as projection on dominos.Orders;

    // ── Reporting ──
    function getSalesReport(storeId : UUID, fromDate : Date, toDate : Date) returns SalesReport;
    function getPopularItems(storeId : UUID, limit : Integer) returns array of PopularItem;
    function getDeliveryPerformance(storeId : UUID) returns DeliveryPerformance;

    type SalesReport {
        totalOrders    : Integer;
        totalRevenue   : Decimal;
        avgOrderValue  : Decimal;
        cancelRate     : Decimal;
        topCoupon      : String;
    };

    type PopularItem {
        itemName   : String;
        totalSold  : Integer;
        revenue    : Decimal;
    };

    type DeliveryPerformance {
        avgDeliveryMin : Decimal;
        onTimeRate     : Decimal;
        avgRating      : Decimal;
    };
}
