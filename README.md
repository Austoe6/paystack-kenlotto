# Paystack Lottery Payments API (Kenya)

Express API to accept payments via Paystack for a Kenyan lottery use-case. Supports:
- Invoice creation
- Card payments (transaction initialize)
- M-Pesa payments (via Charge API)
- Verification by reference
- Webhooks with signature verification

Test locally with Postman; deploy later to Vercel (serverless migration notes below).

## Prerequisites
- Node.js 18+
- Paystack Test Secret Key

## Setup
1. Clone or copy this folder.
2. Create `.env` from `env.example` and set:
   - `PAYSTACK_SECRET_KEY=sk_test_...`
   - `APP_URL=http://localhost:4000`
   - `PORT=4000`
3. Install dependencies:

```bash
npm install
npm run dev
```

Server runs at `http://localhost:4000`.

## Endpoints

### Health
GET /health

### Create Invoice
POST /api/invoices

Body:
```json
{
  "email": "buyer@example.com",
  "phone": "2547XXXXXXXX",
  "amount": 199.5,
  "currency": "KES",
  "description": "2x Lottery Tickets",
  "items": [{ "sku": "LOTTO-001", "qty": 2 }],
  "metadata": { "customerId": "abc123" }
}
```

Response:
```json
{
  "invoice": {
    "id": "inv_xxx",
    "reference": "ref_xxx",
    "status": "pending",
    "...": "..."
  }
}
```

### Initialize Card Payment
POST /api/payments/card

Body:
```json
{
  "invoiceId": "inv_xxx"
}
```

Response includes Paystack `authorization_url` under `paystack.data.authorization_url`. Open this URL to complete card payment.

### Initialize M-Pesa (via Charge API)
POST /api/payments/mpesa

Body (simple default):
```json
{
  "invoiceId": "inv_xxx",
  "phone": "2547XXXXXXXX"
}
```

Advanced: You can pass `chargePayload` to fully control the Paystack Charge payload (this is useful if your account requires a specific schema).
```json
{
  "invoiceId": "inv_xxx",
  "chargePayload": {
    "authorization": { "type": "mpesa", "phone": "2547XXXXXXXX" }
  }
}
```

Notes:
- Amounts are automatically converted to minor units (KES x100) for Paystack.
- The exact M-Pesa fields may vary depending on Paystack’s current API and your account configuration. The default uses `authorization.type=mpesa`, which you can override with `chargePayload`.

### Verify Payment by Reference
GET /api/payments/verify/:reference

Response includes the raw Paystack verification payload.

### Webhook (configure on Paystack Dashboard)
POST /api/webhooks/paystack
- Expects `x-paystack-signature` header
- Raw JSON body is validated with HMAC SHA512 using your `PAYSTACK_SECRET_KEY`
- Updates invoice status to `paid` or `failed` when applicable

Local testing tip: use a tunneling tool (e.g., `ngrok`) to expose `http://localhost:4000/api/webhooks/paystack` and paste the public URL in your Paystack Dashboard webhook settings.

## Postman Quick Tests
1. Create invoice:
   - POST http://localhost:4000/api/invoices
2. Initialize card:
   - POST http://localhost:4000/api/payments/card
3. Initialize M-Pesa:
   - POST http://localhost:4000/api/payments/mpesa
4. Verify:
   - GET http://localhost:4000/api/payments/verify/{reference}

## Vercel Deployment (Notes)
This project uses a single Express server. Vercel prefers serverless functions. When ready:
- Migrate each route to a function under `api/*.js` using `@vercel/node`.
- Reuse logic in `src/paystack.js` and `src/store.js`.
- Update webhook URL in Paystack Dashboard to your Vercel function path.

## Important
- Ensure your business type complies with local regulations for lottery.
- Use Test keys in development; switch to Live keys for production.
- Always verify payments via webhook or the verify endpoint before fulfilling orders.


