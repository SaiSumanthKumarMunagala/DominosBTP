using OrderingService from './pizza-service';

// ── Menu Items List ──
annotate OrderingService.MenuItems with @(UI: {
    HeaderInfo: {
        TypeName: 'Menu Item', TypeNamePlural: 'Menu',
        Title: { Value: name }, Description: { Value: description },
        ImageUrl: imageUrl
    },
    SelectionFields: [ category_ID, isVeg, isBestseller, isAvailable ],
    LineItem: [
        { Value: name,         Label: 'Item',      Position: 10 },
        { Value: category.name, Label: 'Category', Position: 20 },
        { Value: basePrice,    Label: 'Price',      Position: 30 },
        { Value: isVeg,        Label: 'Veg',        Position: 40 },
        { Value: isBestseller, Label: 'Bestseller', Position: 50 },
        { Value: calories,     Label: 'Calories',   Position: 60 },
        { Value: prepTimeMin,  Label: 'Prep (min)', Position: 70 },
        { Value: isAvailable,  Label: 'Available',  Position: 80 }
    ]
});

// ── Orders List ──
annotate OrderingService.Orders with @(UI: {
    HeaderInfo: {
        TypeName: 'Order', TypeNamePlural: 'Orders',
        Title: { Value: orderNumber },
        Description: { Value: status }
    },
    SelectionFields: [ orderNumber, status, orderType, paymentStatus, customer_ID, store_ID ],
    LineItem: [
        { Value: orderNumber,     Label: 'Order #',   Position: 10 },
        { Value: customer.fullName, Label: 'Customer', Position: 20 },
        { Value: store.name,      Label: 'Store',      Position: 30 },
        { Value: orderType,       Label: 'Type',       Position: 40 },
        { Value: status,          Label: 'Status',     Position: 50, Criticality: status_criticality },
        { Value: totalAmount,     Label: 'Total',      Position: 60 },
        { Value: paymentStatus,   Label: 'Payment',    Position: 70 },
        { Value: orderPlacedAt,   Label: 'Placed At',  Position: 80 }
    ],
    HeaderFacets: [
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#OrderStatus', Label: 'Status' },
        { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Pricing',     Label: 'Pricing' }
    ],
    Facets: [
        { $Type: 'UI.CollectionFacet', ID: 'OrderDetails', Label: 'Order Details', Facets: [
            { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#General',  Label: 'General' },
            { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Delivery', Label: 'Delivery' }
        ]},
        { $Type: 'UI.ReferenceFacet', Target: 'items/@UI.LineItem',          Label: 'Order Items' },
        { $Type: 'UI.ReferenceFacet', Target: 'statusHistory/@UI.LineItem',  Label: 'Status History' }
    ],
    FieldGroup#General: { Data: [
        { Value: orderNumber }, { Value: customer_ID }, { Value: store_ID },
        { Value: orderType }, { Value: specialInstructions }, { Value: couponCode }
    ]},
    FieldGroup#OrderStatus: { Data: [
        { Value: status }, { Value: paymentStatus }, { Value: paymentMethod }
    ]},
    FieldGroup#Pricing: { Data: [
        { Value: subtotal }, { Value: discountAmount }, { Value: taxAmount },
        { Value: deliveryFee }, { Value: tipAmount }, { Value: totalAmount }
    ]},
    FieldGroup#Delivery: { Data: [
        { Value: orderPlacedAt }, { Value: estimatedDelivery },
        { Value: actualDelivery }, { Value: deliveryAgent.name }
    ]}
});

extend projection OrderingService.Orders with {
    virtual status_criticality : Integer;
};

// ── Order Items ──
annotate OrderingService.OrderItems with @(UI: {
    LineItem: [
        { Value: menuItem.name,  Label: 'Item',     Position: 10 },
        { Value: size,           Label: 'Size',     Position: 20 },
        { Value: quantity,       Label: 'Qty',      Position: 30 },
        { Value: unitPrice,      Label: 'Unit Price', Position: 40 },
        { Value: totalPrice,     Label: 'Total',    Position: 50 },
        { Value: specialNotes,   Label: 'Notes',    Position: 60 }
    ]
});

// ── Status History ──
annotate OrderingService.OrderStatusHistory with @(UI: {
    LineItem: [
        { Value: timestamp, Label: 'Time',     Position: 10 },
        { Value: status,    Label: 'Status',   Position: 20 },
        { Value: notes,     Label: 'Details',  Position: 30 },
        { Value: updatedBy, Label: 'Updated By', Position: 40 }
    ]
});

// ── Value Helps ──
annotate OrderingService.Orders with {
    customer @(Common: { Text: customer.fullName, TextArrangement: #TextOnly });
    store    @(Common: { Text: store.name, TextArrangement: #TextOnly });
};
