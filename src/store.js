const fs = require('fs');
const path = require('path');

// Vercel/Serverless has read-only filesystem for code; only /tmp is writable and ephemeral.
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.NOW_REGION;
const FILE_STORE_PATH = IS_SERVERLESS ? '/tmp/invoices.json' : path.join(__dirname, '..', 'data', 'invoices.json');

let useMemoryStore = false;
let memoryInvoices = [];

function ensureStore() {
	try {
		const dir = path.dirname(FILE_STORE_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		if (!fs.existsSync(FILE_STORE_PATH)) {
			fs.writeFileSync(FILE_STORE_PATH, JSON.stringify([], null, 2), 'utf8');
		}
	} catch (err) {
		useMemoryStore = true;
	}
}

function readAll() {
	if (useMemoryStore) {
		return memoryInvoices;
	}
	ensureStore();
	try {
		const raw = fs.readFileSync(FILE_STORE_PATH, 'utf8');
		return JSON.parse(raw);
	} catch (err) {
		// On any read error, fallback to memory store
		useMemoryStore = true;
		return memoryInvoices;
	}
}

function writeAll(invoices) {
	if (useMemoryStore) {
		memoryInvoices = invoices;
		return;
	}
	try {
		fs.writeFileSync(FILE_STORE_PATH, JSON.stringify(invoices, null, 2), 'utf8');
	} catch (err) {
		// Fallback to memory if writing fails (e.g., EROFS)
		useMemoryStore = true;
		memoryInvoices = invoices;
	}
}

function addInvoice(invoice) {
	const invoices = readAll();
	invoices.push(invoice);
	writeAll(invoices);
	return invoice;
}

function getInvoiceById(id) {
	const invoices = readAll();
	return invoices.find(i => i.id === id) || null;
}

function getInvoiceByReference(reference) {
	const invoices = readAll();
	return invoices.find(i => i.reference === reference) || null;
}

function updateInvoiceByReference(reference, updates) {
	const invoices = readAll();
	const idx = invoices.findIndex(i => i.reference === reference);
	if (idx === -1) return null;
	invoices[idx] = { ...invoices[idx], ...updates, updatedAt: new Date().toISOString() };
	writeAll(invoices);
	return invoices[idx];
}

module.exports = {
	addInvoice,
	getInvoiceById,
	getInvoiceByReference,
	updateInvoiceByReference,
};

