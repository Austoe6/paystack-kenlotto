const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const dotenv = require('dotenv');
dotenv.config();
const crypto = require('crypto');
const {
	addInvoice,
	getInvoiceById,
	getInvoiceByReference,
	updateInvoiceByReference,
} = require('./store');
const {
	initializeTransaction,
	verifyTransaction,
	charge,
	verifyWebhookSignature,
} = require('./paystack');

function generateId(len) {
	// Generate a hex string of desired length using secure random bytes
	return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

const app = express();
const PORT = process.env.PORT || 4000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Logging
app.use(morgan('dev'));

// Use raw body ONLY for Paystack webhook route to enable signature verification
app.use('/api/webhooks/paystack', express.raw({ type: 'application/json' }));

// Regular JSON for all other routes
app.use(bodyParser.json());

// Health
app.get('/health', (req, res) => {
	return res.json({ ok: true, service: 'paystack-lottery-api' });
});

// Create invoice
app.post('/api/invoices', (req, res) => {
	const { email, phone, amount, currency = 'KES', description, items = [], metadata = {} } = req.body || {};
	if (!email || !amount) {
		return res.status(400).json({ error: 'Missing required fields: email, amount' });
	}
	if (typeof amount !== 'number' || amount <= 0) {
		return res.status(400).json({ error: 'amount must be a positive number in KES' });
	}

	const id = `inv_${generateId(12)}`;
	const reference = `ref_${generateId(14)}`;
	const now = new Date().toISOString();

	const invoice = {
		id,
		reference,
		email,
		phone: phone || null,
		amount,
		currency,
		description: description || 'Lottery purchase',
		items,
		metadata,
		status: 'pending',
		createdAt: now,
		updatedAt: now,
	};

	addInvoice(invoice);
	return res.status(201).json({ invoice });
});

// Initialize card payment
app.post('/api/payments/card', async (req, res) => {
	try {
		const { invoiceId, callbackPath = '/api/payments/callback' } = req.body || {};
		if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });
		const invoice = getInvoiceById(invoiceId);
		if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
		if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice already paid' });

		const amountMinor = Math.round(invoice.amount * 100); // Paystack uses minor units
		const initPayload = {
			email: invoice.email,
			amount: amountMinor,
			currency: invoice.currency || 'KES',
			reference: invoice.reference,
			callback_url: `${APP_URL}${callbackPath}`,
			channels: ['card'],
			metadata: {
				invoiceId: invoice.id,
				description: invoice.description,
				...invoice.metadata,
			},
		};
		const data = await initializeTransaction(initPayload);
		return res.json({ invoiceId: invoice.id, reference: invoice.reference, paystack: data });
	} catch (err) {
		const status = err.response?.status || 500;
		return res.status(status).json({ error: err.response?.data || err.message || 'Paystack error' });
	}
});

// Initialize M-Pesa (via Paystack Charge API)
app.post('/api/payments/mpesa', async (req, res) => {
	try {
		const { invoiceId, phone, email, chargePayload } = req.body || {};
		if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });
		// Normalize phone to E.164 (+2547XXXXXXXX) if provided
		function normalizeKenyanMsisdn(input) {
			if (!input || typeof input !== 'string') return null;
			const digits = input.replace(/[^\d]/g, '');
			if (digits.startsWith('0')) {
				// 07XXXXXXXX -> +2547XXXXXXXX
				return `+254${digits.slice(1)}`;
			}
			if (digits.startsWith('254')) {
				// 2547XXXXXXXX -> +2547XXXXXXXX
				return `+${digits}`;
			}
			if (input.startsWith('+254')) {
				return input;
			}
			// Fallback: if it already looks like +XXXXXXXXXXX keep, else null
			return input.startsWith('+') ? input : null;
		}
		const normalizedPhone = phone ? normalizeKenyanMsisdn(String(phone)) : null;
		if (phone && !normalizedPhone) {
			return res.status(400).json({ error: 'Invalid phone. Use Kenyan format e.g. +2547XXXXXXXX or 2547XXXXXXXX or 07XXXXXXXX' });
		}
		const invoice = getInvoiceById(invoiceId);
		if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
		if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice already paid' });

		const useEmail = email || invoice.email;
		if (!useEmail) return res.status(400).json({ error: 'email is required for Paystack charge' });

		const amountMinor = Math.round(invoice.amount * 100);

		// Base payload
		const payload = {
			email: useEmail,
			amount: amountMinor,
			currency: invoice.currency || 'KES',
			reference: invoice.reference,
			metadata: {
				invoiceId: invoice.id,
				description: invoice.description,
				...invoice.metadata,
			},
		};

		// Default mobile money object for M-Pesa if phone is provided and no override
		if (normalizedPhone && !chargePayload) {
			payload.mobile_money = {
				phone: normalizedPhone,
				provider: 'mpesa',
			};
		}

		// Allow caller to override/add fields explicitly
		if (chargePayload && typeof chargePayload === 'object') {
			Object.assign(payload, chargePayload);
		}

		const data = await charge(payload);
		return res.json({ invoiceId: invoice.id, reference: invoice.reference, paystack: data });
	} catch (err) {
		const status = err.response?.status || 500;
		return res.status(status).json({ error: err.response?.data || err.message || 'Paystack error' });
	}
});

// Verify by reference
app.get('/api/payments/verify/:reference', async (req, res) => {
	try {
		const reference = req.params.reference;
		const data = await verifyTransaction(reference);
		return res.json({ reference, paystack: data });
	} catch (err) {
		const status = err.response?.status || 500;
		return res.status(status).json({ error: err.response?.data || err.message || 'Paystack error' });
	}
});

// Webhook: needs raw body for signature verification
app.post('/api/webhooks/paystack', (req, res) => {
	const signature = req.headers['x-paystack-signature'];
	const rawBody = req.body; // Buffer (provided by express.raw for this route)
	const isValid = verifyWebhookSignature(rawBody, signature);
	if (!isValid) {
		return res.status(400).send('Invalid signature');
	}
	let event;
	try {
		event = JSON.parse(rawBody.toString('utf8'));
	} catch {
		return res.status(400).send('Invalid JSON');
	}

	// Handle events
	// Common events: charge.success, charge.failed, invoice.payment_failed, invoice.payment_succeeded
	const evt = event?.event;
	const data = event?.data || {};
	const reference = data?.reference || data?.transaction_reference || null;

	if (reference) {
		if (evt === 'charge.success' || evt === 'invoice.payment_succeeded') {
			updateInvoiceByReference(reference, { status: 'paid', paystackData: data });
		} else if (evt === 'charge.failed' || evt === 'invoice.payment_failed') {
			updateInvoiceByReference(reference, { status: 'failed', paystackData: data });
		} else {
			// Store last event
			updateInvoiceByReference(reference, { lastEvent: evt, paystackData: data });
		}
	}

	return res.status(200).send('ok');
});

// Fallback route
app.use((req, res) => {
	return res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
	// eslint-disable-next-line no-console
	console.log(`Paystack Lottery API running on ${APP_URL} (port ${PORT})`);
});


