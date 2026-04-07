namespace com.dominos;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';


// ═══════════════════════════════════════════════
//  MENU / CATALOG
// ═══════════════════════════════════════════════

/**
 * Menu categories (Pizza, Sides, Drinks, Desserts, etc.)
 */
entity Categories : cuid, managed {
    code         : String(20)   @mandatory;
    name         : String(100)  @mandatory;
    description  : String(500);
    imageUrl     : String(500);
    displayOrder : Integer default 0;
    isActive     : Boolean default true;
    items        : Association to many MenuItems on items.category = $self;
}

/**
 * Menu items — every pizza, side, drink, dessert.
 */
entity MenuItems : cuid, managed {
    code         : String(30)   @mandatory;
    name         : String(200)  @mandatory;
    description  : String(1000);
    category     : Association to Categories @mandatory;
    basePrice    : Decimal(10,2) @mandatory;
    imageUrl     : String(500);
    isVeg        : Boolean default false;
    isSpicy      : Boolean default false;
    isBestseller : Boolean default false;
    isAvailable  : Boolean default true;
    calories     : Integer;
    prepTimeMin  : Integer default 15;  // minutes
    sizes        : Composition of many ItemSizes on sizes.menuItem = $self;
    toppings     : Composition of many ItemToppings on toppings.menuItem = $self;
}

/**
 * Size variants (Regular, Medium, Large, etc.)
 */
entity ItemSizes : cuid {
    menuItem     : Association to MenuItems;
    size         : String(20)    @mandatory;  // REGULAR, MEDIUM, LARGE, XLARGE
    priceAddon   : Decimal(10,2) default 0;
    isDefault    : Boolean default false;
}

/**
 * Available toppings / customizations per item.
 */
entity ItemToppings : cuid {
    menuItem     : Association to MenuItems;
    topping      : Association to Toppings;
    isDefault    : Boolean default false;
}

/**
 * Master topping list.
 */
entity Toppings : cuid, managed {
    code         : String(30)  @mandatory;
    name         : String(100) @mandatory;
    price        : Decimal(10,2) default 0;
    isVeg        : Boolean default true;
    isAvailable  : Boolean default true;
    category     : String(30); // CHEESE, MEAT, VEGGIE, SAUCE
}


// ═══════════════════════════════════════════════
//  STORES
// ═══════════════════════════════════════════════

entity Stores : cuid, managed {
    code         : String(10)  @mandatory;
    name         : String(200) @mandatory;
    address      : String(500);
    city         : String(100);
    state        : String(100);
    zipCode      : String(20);
    country      : String(3) default 'USA';
    phone        : String(20);
    email        : String(255);
    latitude     : Decimal(10,7);
    longitude    : Decimal(10,7);
    openTime     : Time;
    closeTime    : Time;
    isOpen       : Boolean default true;
    deliveryRadius : Decimal(5,2) default 5.0;  // km
    avgPrepTime  : Integer default 20;           // minutes
    rating       : Decimal(3,2);
    orders       : Association to many Orders on orders.store = $self;
}


// ═══════════════════════════════════════════════
//  CUSTOMERS
// ═══════════════════════════════════════════════

entity Customers : cuid, managed {
    firstName    : String(100) @mandatory;
    lastName     : String(100) @mandatory;
    fullName     : String(201);
    email        : String(255) @mandatory;
    phone        : String(20)  @mandatory;
    loyaltyPoints: Integer default 0;
    loyaltyTier  : String(20) default 'BRONZE';  // BRONZE, SILVER, GOLD, PLATINUM
    totalOrders  : Integer default 0;
    addresses    : Composition of many CustomerAddresses on addresses.customer = $self;
    orders       : Association to many Orders on orders.customer = $self;
}

entity CustomerAddresses : cuid {
    customer     : Association to Customers;
    label        : String(50);   // Home, Office, etc.
    addressLine1 : String(200) @mandatory;
    addressLine2 : String(200);
    city         : String(100);
    state        : String(100);
    zipCode      : String(20);
    latitude     : Decimal(10,7);
    longitude    : Decimal(10,7);
    isDefault    : Boolean default false;
}


// ═══════════════════════════════════════════════
//  ORDERS — the heart of the system
// ═══════════════════════════════════════════════

entity Orders : cuid, managed {
    orderNumber     : String(20)  @mandatory;
    customer        : Association to Customers @mandatory;
    store           : Association to Stores @mandatory;
    deliveryAddress : Association to CustomerAddresses;

    // Order meta
    orderType       : String(20) default 'DELIVERY';  // DELIVERY, PICKUP, DINEIN
    status          : String(30) default 'PLACED';
    // PLACED → CONFIRMED → PREPARING → BAKING → QUALITY_CHECK → OUT_FOR_DELIVERY → DELIVERED
    // PLACED → CONFIRMED → PREPARING → BAKING → QUALITY_CHECK → READY_FOR_PICKUP → PICKED_UP
    // PLACED → CANCELLED

    // Pricing
    subtotal        : Decimal(10,2) default 0;
    taxAmount       : Decimal(10,2) default 0;
    deliveryFee     : Decimal(10,2) default 0;
    discountAmount  : Decimal(10,2) default 0;
    tipAmount       : Decimal(10,2) default 0;
    totalAmount     : Decimal(10,2) default 0;
    currency        : String(3) default 'USD';

    // Coupon
    couponCode      : String(30);
    coupon          : Association to Coupons on coupon.code = couponCode;

    // Payment
    paymentMethod   : String(30);  // CARD, CASH, WALLET, UPI
    paymentStatus   : String(20) default 'PENDING'; // PENDING, PAID, FAILED, REFUNDED
    paymentRef      : String(100); // external payment gateway reference

    // Timing
    orderPlacedAt   : DateTime;
    estimatedDelivery: DateTime;
    actualDelivery  : DateTime;
    prepStartedAt   : DateTime;
    prepCompletedAt : DateTime;

    // Delivery agent
    deliveryAgent   : Association to DeliveryAgents;

    // Feedback
    rating          : Integer;  // 1-5
    feedback        : String(1000);

    // Special instructions
    specialInstructions : String(500);

    // Line items
    items           : Composition of many OrderItems on items.order = $self;
    statusHistory   : Composition of many OrderStatusHistory on statusHistory.order = $self;
}

entity OrderItems : cuid {
    order        : Association to Orders;
    menuItem     : Association to MenuItems @mandatory;
    size         : String(20)  default 'MEDIUM';
    quantity     : Integer     default 1 @mandatory;
    unitPrice    : Decimal(10,2);
    totalPrice   : Decimal(10,2);
    customizations : String(1000); // JSON of selected toppings
    specialNotes : String(500);
}

entity OrderStatusHistory : cuid {
    order        : Association to Orders;
    status       : String(30);
    timestamp    : DateTime;
    updatedBy    : String(255);
    notes        : String(500);
}


// ═══════════════════════════════════════════════
//  DELIVERY AGENTS
// ═══════════════════════════════════════════════

entity DeliveryAgents : cuid, managed {
    name         : String(200) @mandatory;
    phone        : String(20)  @mandatory;
    email        : String(255);
    vehicleType  : String(30);  // BIKE, SCOOTER, CAR
    vehicleNumber: String(30);
    isAvailable  : Boolean default true;
    currentLat   : Decimal(10,7);
    currentLng   : Decimal(10,7);
    rating       : Decimal(3,2);
    totalDeliveries : Integer default 0;
    store        : Association to Stores;
}


// ═══════════════════════════════════════════════
//  COUPONS & PROMOTIONS
// ═══════════════════════════════════════════════

entity Coupons : cuid, managed {
    code         : String(30)  @mandatory;
    name         : String(200) @mandatory;
    description  : String(500);
    discountType : String(20);  // PERCENT, FLAT, BOGO
    discountValue: Decimal(10,2);
    minOrderValue: Decimal(10,2) default 0;
    maxDiscount  : Decimal(10,2);
    validFrom    : Date;
    validTo      : Date;
    usageLimit   : Integer;
    usedCount    : Integer default 0;
    isActive     : Boolean default true;
    applicableCategories : String(500); // comma-separated category IDs
}


// ═══════════════════════════════════════════════
//  INTEGRATION LOG (audit trail for ext. calls)
// ═══════════════════════════════════════════════

entity IntegrationLogs : cuid {
    timestamp    : DateTime;
    direction    : String(10);  // INBOUND, OUTBOUND
    system       : String(50);  // PAYMENT_GW, DELIVERY_API, SMS_GW, ERP
    endpoint     : String(500);
    method       : String(10);  // GET, POST, PUT
    requestBody  : LargeString;
    responseBody : LargeString;
    statusCode   : Integer;
    duration     : Integer;     // ms
    orderId      : String(36);
    errorMessage : String(1000);
    retryCount   : Integer default 0;
}
