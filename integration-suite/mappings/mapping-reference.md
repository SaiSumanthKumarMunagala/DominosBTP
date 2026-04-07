# Integration Suite — Message Mapping Reference
# ═══════════════════════════════════════════════════════════

## 1. Payment_Processing Mapping

### CAP → Stripe
| Source (CAP)        | Target (Stripe)              | Transformation           |
|---------------------|------------------------------|--------------------------|
| amount              | amount                       | × 100 (dollars → cents)  |
| currency            | currency                     | toLowerCase()            |
| orderNumber         | description                  | "Dominos Order " + value |
| customerEmail       | receipt_email                | direct                   |
| orderId             | metadata.orderId             | direct                   |
| method              | payment_method_types[]       | mapMethodType()          |

### Stripe → CAP
| Source (Stripe)               | Target (CAP)      | Transformation           |
|-------------------------------|--------------------|--------------------------|
| status == 'succeeded'         | success            | boolean                  |
| id                            | transactionId      | direct                   |
| last_payment_error.message    | message            | on failure               |

---

## 2. SMS_Notification Mapping

### CAP → Twilio
| Source (CAP)  | Target (Twilio)   | Format                    |
|---------------|-------------------|---------------------------|
| phone         | To                | URL-encoded               |
| message       | Body              | URL-encoded               |
| (config)      | From              | Twilio phone number       |

---

## 3. ERP_Revenue_Posting Mapping

### CAP Order → S/4HANA Journal Entry
| Source (CAP)          | Target (S/4HANA)             | Notes                     |
|-----------------------|------------------------------|---------------------------|
| storeCode             | CompanyCode                  | Lookup: store → company   |
| orderDate             | DocumentDate, PostingDate    | format YYYY-MM-DD         |
| "RV"                  | DocumentType                 | constant                  |
| orderNumber           | DocumentHeaderText           | "Pizza Order " + value    |
| totalAmount - tax     | Items[0].AmountInTransCrcy   | Revenue line              |
| taxAmount             | Items[1].AmountInTransCrcy   | Tax payable line          |
| totalAmount           | Items[2].AmountInTransCrcy   | Cash/AR line (debit)      |
| "400000"              | Items[0].GLAccount           | Revenue GL                |
| "154000"              | Items[1].GLAccount           | Tax GL                    |
| "113100"              | Items[2].GLAccount           | AR / Cash GL              |

---

## 4. Delivery_Dispatch Mapping

### CAP → DoorDash Drive
| Source (CAP)        | Target (DoorDash)              | Notes                   |
|---------------------|--------------------------------|-------------------------|
| orderId             | external_delivery_id           | direct                  |
| store.address       | pickup_address                 | full address string     |
| store.phone         | pickup_phone_number            | direct                  |
| customer.address    | dropoff_address                | full address string     |
| customer.phone      | dropoff_phone_number           | direct                  |
| totalAmount         | order_value                    | × 100 (cents)          |
| items[].name        | items[].name                   | direct                  |
| items[].quantity     | items[].quantity              | direct                  |

---

## Destination Configuration (SAP BTP Cockpit)

| Destination Name  | URL                                          | Auth Type         |
|-------------------|----------------------------------------------|-------------------|
| PaymentGateway    | https://api.stripe.com/v1                    | OAuth2            |
| SMSGateway        | https://api.twilio.com/2010-04-01            | Basic             |
| DeliveryPartner   | https://openapi.doordash.com/drive/v2        | Bearer Token      |
| S4HC_BACKEND      | https://my-s4hana.s4hana.cloud.sap          | OAuth2SAMLBearer  |
| EventMesh         | (auto-configured via service binding)        | Service Key       |
