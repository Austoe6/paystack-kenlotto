const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'invoices.json');

function ensureStore() {
	if (!fs.existsSync(STORE_PATH)) {
		fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
		fs.writeFileSync(STORE_PATH, JSON.stringify([], null, 2), 'utf8');
	}
}

function readAll() {
	ensureStore();
	const raw = fs.readFileSync(STORE_PATH, 'utf8');
	try {
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

function writeAll(invoices) {
	fs.writeFileSync(STORE_PATH, JSON.stringify(invoices, null, 2), 'utf8');
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


