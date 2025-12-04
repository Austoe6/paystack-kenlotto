## Paystack Lottery Payments API (Kenya)

Accept Paystack payments for a Kenyan lottery use-case.

### Features
- Invoice creation
- Card payments (Transaction Initialize)
- M-Pesa payments (Charge API)
- Verification by reference
- Webhooks with signature verification

## Prerequisites
- Node.js 18+
- Paystack Test Secret Key

## Setup (Local)
1. Create `.env` from `env.example` and set:
   - `PAYSTACK_SECRET_KEY=sk_test_...`
   - `APP_URL=http://localhost:4000`
   - `PORT=4000`
2. Install and run:

```bash
npm install
npm run dev
```

Server runs at `http://localhost:4000`.

## Endpoints (Postman)

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

### Initialize Card Payment
POST /api/payments/card

Body:
```json
{ "invoiceId": "inv_xxx" }
```

Response includes Paystack `authorization_url` under `paystack.data.authorization_url`.

### Initialize M-Pesa (Charge API)
POST /api/payments/mpesa

Body (simple default):
```json
{
  "invoiceId": "inv_xxx",
  "phone": "2547XXXXXXXX"
}
```

Advanced override (if your account requires explicit fields):
```json
{
  "invoiceId": "inv_xxx",
  "chargePayload": {
    "mobile_money": { "phone": "+2547XXXXXXXX", "provider": "mpesa" }
  }
}
```

Notes:
- Amounts are automatically converted to minor units (KES x100).
- Phone is normalized to E.164 (`+254...`) if provided as `07...` or `254...`.

### Verify Payment by Reference
GET /api/payments/verify/:reference

### Webhook (configure on Paystack Dashboard)
POST /api/webhooks/paystack
- Expects `x-paystack-signature` header
- Validates raw body with HMAC SHA512 using `PAYSTACK_SECRET_KEY`
- Updates invoice status to `paid` or `failed`

Local testing tip: expose `http://localhost:4000/api/webhooks/paystack` (e.g., `ngrok`) and use the public URL in Paystack Dashboard.

## Postman Quick Tests
1. Create invoice → POST /api/invoices
2. Initialize card → POST /api/payments/card
3. Initialize M-Pesa → POST /api/payments/mpesa
4. Verify → GET /api/payments/verify/{reference}

## Deploy to Vercel
- `vercel.json` is included and routes all paths to `src/server.js` via `@vercel/node`.
- In Vercel Project Settings → Environment Variables, set:
  - `PAYSTACK_SECRET_KEY`
  - `APP_URL` (after first deploy, set to the Vercel URL)
- Connect the GitHub repo and deploy.

### Notes
- For per-route serverless functions later, move logic into `api/*.js` and reuse `src/paystack.js` and `src/store.js`.
 - Serverless storage: the filesystem is read-only; this API falls back to `/tmp` or in-memory storage on Vercel. For persistence, use a database (e.g., Postgres, Supabase, KV).

## Important
- Ensure compliance with local regulations for lottery.
- Use Test keys in development; switch to Live keys for production.
- Always verify payments via webhook or the verify endpoint before fulfilling orders.