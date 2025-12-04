require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

if (!PAYSTACK_SECRET_KEY) {
	// eslint-disable-next-line no-console
	console.warn('[paystack] PAYSTACK_SECRET_KEY is not set. Set it in .env (sk_test_... in development).');
}

const client = axios.create({
	baseURL: 'https://api.paystack.co',
	headers: {
		Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	},
	timeout: 30000,
});

function assertSecretKey() {
	if (!PAYSTACK_SECRET_KEY || !PAYSTACK_SECRET_KEY.trim().startsWith('sk_')) {
		const hint = 'Missing or invalid PAYSTACK_SECRET_KEY. Set a valid Paystack Secret Key (sk_test_... for test or sk_live_... for live) in your .env and restart the server.';
		const err = new Error(hint);
		err.code = 'PAYSTACK_SECRET_KEY_MISSING';
		throw err;
	}
}

async function initializeTransaction(data) {
	assertSecretKey();
	const res = await client.post('/transaction/initialize', data);
	return res.data;
}

async function verifyTransaction(reference) {
	assertSecretKey();
	const res = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
	return res.data;
}

async function charge(data) {
	assertSecretKey();
	const res = await client.post('/charge', data);
	return res.data;
}

function verifyWebhookSignature(rawBody, signatureHeader) {
	if (!PAYSTACK_SECRET_KEY) return false;
	if (!signatureHeader) return false;
	try {
		const computed = crypto
			.createHmac('sha512', PAYSTACK_SECRET_KEY)
			.update(rawBody)
			.digest('hex');
		return computed === signatureHeader;
	} catch {
		return false;
	}
}

module.exports = {
	initializeTransaction,
	verifyTransaction,
	charge,
	verifyWebhookSignature,
};


