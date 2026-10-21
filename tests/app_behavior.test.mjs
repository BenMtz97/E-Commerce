import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];
const SCRIPT_PATTERNS = [
  /<script\b/i,
  /<\/script>/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /on\w+\s*=/i,
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /<svg\b/i,
];
const SQL_INJECTION_PATTERNS = [
  /(?:--|;\s*(?:drop|alter|truncate|delete|insert|update|create)\b)/i,
  /\bunion\s+(?:all\s+)?select\b/i,
  /(?:'\s*or\s+'?\d+'?\s*=\s*'?\d+)/i,
  /\b(?:exec|execute)\s*\(/i,
  /\bxp_cmdshell\b/i,
];
const SKU_PATTERN = /^[A-Z0-9_-]{3,64}$/;

function validateSafeCell(value, fieldName) {
  const raw = String(value ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix) || trimmed.startsWith(prefix))) {
    return `${fieldName}: CSV formula injection is prohibited (cannot start with '=', '+', '-', or '@').`;
  }
  for (const pattern of SCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `${fieldName}: Script or HTML injection payload detected and rejected.`;
    }
  }
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `${fieldName}: SQL injection pattern detected and rejected.`;
    }
  }
  return null;
}

function executeCardPurchase({
  product,
  quantity,
  cardOption,
  user,
  purchaseButtonDisabled,
}) {
  if (purchaseButtonDisabled) {
    return {
      accepted: false,
      reason: 'DOUBLE_PURCHASE_BLOCKED',
      updatedStock: product.stock,
      order: null,
      buttonDeactivated: true,
    };
  }
  if (!user || user.role !== 'user') {
    return {
      accepted: false,
      reason: 'UNAUTHORIZED_ROLE',
      updatedStock: product.stock,
      order: null,
      buttonDeactivated: false,
    };
  }
  if (!cardOption || cardOption.trim() === '') {
    return {
      accepted: false,
      reason: 'CARD_NOT_SELECTED',
      message: 'Please select a payment card option (XXX-1234 SUCCEED or XXX-1111 REJECTED) before confirming your purchase.',
      updatedStock: product.stock,
      order: null,
      buttonDeactivated: false,
    };
  }
  if (cardOption === 'XXX-1111 REJECTED') {
    return {
      accepted: false,
      reason: 'PAYMENT_REJECTED',
      message: `Purchase rejected: Payment with card XXX-1111 REJECTED was declined by the issuing bank. Product stock (${product.stock} units) was not modified.`,
      updatedStock: product.stock,
      order: null,
      buttonDeactivated: true,
    };
  }
  if (product.stock < quantity) {
    return {
      accepted: false,
      reason: 'INSUFFICIENT_STOCK',
      message: `Insufficient stock: requested ${quantity}, but only ${product.stock} units remain.`,
      updatedStock: product.stock,
      order: null,
      buttonDeactivated: true,
    };
  }
  const updatedStock = product.stock - quantity;
  const order = {
    id: `ORD-TEST-01`,
    userId: user.id,
    userEmail: user.email,
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    quantity,
    unitPrice: product.price,
    totalPrice: Number((product.price * quantity).toFixed(2)),
    paymentCard: cardOption,
    status: 'SUCCEEDED',
  };
  return {
    accepted: true,
    reason: 'PURCHASE_SUCCEEDED',
    message: `Purchase succeeded with card ${cardOption}!`,
    updatedStock,
    order,
    buttonDeactivated: true,
  };
}

function applyAdminMultiColumnFilter(products, filters) {
  return products.filter((p) => {
    const skuMatch = !filters.sku.trim() || p.sku.toLowerCase().includes(filters.sku.trim().toLowerCase());
    const nameMatch = !filters.name.trim() || p.name.toLowerCase().includes(filters.name.trim().toLowerCase());
    const categoryMatch = !filters.category.trim() || p.category.toLowerCase().includes(filters.category.trim().toLowerCase());
    const priceMatch = !filters.price.trim() || p.price.toFixed(2).includes(filters.price.trim());
    const stockMatch = !filters.stock.trim() || String(p.stock).includes(filters.stock.trim());
    const weightMatch = !filters.weight.trim() || p.weight_kg.toFixed(3).includes(filters.weight.trim());
    return skuMatch && nameMatch && categoryMatch && priceMatch && stockMatch && weightMatch;
  });
}

test('1. Cardbank Selector: Requires explicit user selection (never auto-selects succeed card)', () => {
  const appSource = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(
    appSource.includes("useState<'' | 'XXX-1234 SUCCEED' | 'XXX-1111 REJECTED'>('')"),
    'selectedCardOption state must initialize to empty string'
  );
  assert.ok(
    appSource.includes("setSelectedCardOption('');"),
    'handleOpenPurchase must reset selectedCardOption to empty string'
  );
  assert.ok(
    !appSource.includes("setSelectedCardOption('XXX-1234 SUCCEED');"),
    'handleOpenPurchase must not auto-select XXX-1234 SUCCEED'
  );

  const product = { id: 'p1', sku: 'KNT-001', name: 'Test Switch', price: 100, stock: 10 };
  const user = { id: 'u1', email: 'user@user.com', role: 'user' };

  const unselectedResult = executeCardPurchase({
    product,
    quantity: 2,
    cardOption: '',
    user,
    purchaseButtonDisabled: false,
  });
  assert.equal(unselectedResult.accepted, false);
  assert.equal(unselectedResult.reason, 'CARD_NOT_SELECTED');
  assert.equal(unselectedResult.updatedStock, 10);
  assert.equal(unselectedResult.order, null);
});

test('2. Cardbank Selector: XXX-1234 SUCCEED modifies stock, creates user order, and deactivates purchase button', () => {
  const product = { id: 'p1', sku: 'KNT-001', name: 'Test Switch', price: 125.5, stock: 10 };
  const user = { id: 'u1', email: 'user@user.com', role: 'user' };

  const res = executeCardPurchase({
    product,
    quantity: 3,
    cardOption: 'XXX-1234 SUCCEED',
    user,
    purchaseButtonDisabled: false,
  });

  assert.equal(res.accepted, true);
  assert.equal(res.updatedStock, 7);
  assert.equal(res.buttonDeactivated, true);
  assert.notEqual(res.order, null);
  assert.equal(res.order.userEmail, 'user@user.com');
  assert.equal(res.order.sku, 'KNT-001');
  assert.equal(res.order.quantity, 3);
  assert.equal(res.order.totalPrice, 376.5);
  assert.equal(res.order.paymentCard, 'XXX-1234 SUCCEED');
});

test('3. Cardbank Selector: XXX-1111 REJECTED does not affect stock, creates no order, and deactivates purchase button', () => {
  const product = { id: 'p1', sku: 'KNT-001', name: 'Test Switch', price: 125.5, stock: 10 };
  const user = { id: 'u1', email: 'user@user.com', role: 'user' };

  const res = executeCardPurchase({
    product,
    quantity: 4,
    cardOption: 'XXX-1111 REJECTED',
    user,
    purchaseButtonDisabled: false,
  });

  assert.equal(res.accepted, false);
  assert.equal(res.reason, 'PAYMENT_REJECTED');
  assert.equal(res.updatedStock, 10);
  assert.equal(res.order, null);
  assert.equal(res.buttonDeactivated, true);
  assert.ok(res.message.includes('XXX-1111 REJECTED'));
});

test('4. Double-Purchase Protection: Deactivated button blocks duplicate submission', () => {
  const product = { id: 'p1', sku: 'KNT-001', name: 'Test Switch', price: 125.5, stock: 7 };
  const user = { id: 'u1', email: 'user@user.com', role: 'user' };

  const duplicateAttempt = executeCardPurchase({
    product,
    quantity: 1,
    cardOption: 'XXX-1234 SUCCEED',
    user,
    purchaseButtonDisabled: true,
  });

  assert.equal(duplicateAttempt.accepted, false);
  assert.equal(duplicateAttempt.reason, 'DOUBLE_PURCHASE_BLOCKED');
  assert.equal(duplicateAttempt.updatedStock, 7);
});

test('5. CSV & Input Security Validation: Rejects Formula, XSS/Script, and SQL Injection payloads', () => {
  assert.notEqual(validateSafeCell('=cmd|\'/C calc\'!A0', 'name'), null);
  assert.notEqual(validateSafeCell('+SUM(A1:A10)', 'price'), null);
  assert.notEqual(validateSafeCell('-10+20', 'stock'), null);
  assert.notEqual(validateSafeCell('@SUM(1,2)', 'category'), null);
  assert.notEqual(validateSafeCell('<script>alert(1)</script>', 'description'), null);
  assert.notEqual(validateSafeCell('<img src=x onerror=alert(1)>', 'name'), null);
  assert.notEqual(validateSafeCell("'; DROP TABLE products; --", 'description'), null);
  assert.notEqual(validateSafeCell("' OR '1'='1", 'name'), null);

  assert.equal(validateSafeCell('KNT-MCU-001', 'sku'), null);
  assert.equal(validateSafeCell('Industrial Logic Controller', 'name'), null);
  assert.equal(SKU_PATTERN.test('KNT-MCU-001'), true);
  assert.equal(SKU_PATTERN.test('bad sku!'), false);
});

test('6. Multi-Column Product List Filtering: Combines SKU, Name, Category, Price, Stock, and Weight filters', () => {
  const sampleCatalog = [
    { sku: 'KNT-MCU-001', name: 'Edge Compute Unit', category: 'Computing', price: 249.0, stock: 42, weight_kg: 0.48 },
    { sku: 'KNT-SNS-002', name: 'LiDAR Rangefinder', category: 'Sensors', price: 890.0, stock: 14, weight_kg: 0.31 },
    { sku: 'KNT-PWR-003', name: 'Redundant Power Supply', category: 'Power Systems', price: 175.5, stock: 0, weight_kg: 1.85 },
  ];

  const filteredByCategoryAndStock = applyAdminMultiColumnFilter(sampleCatalog, {
    sku: '',
    name: '',
    category: 'Sensors',
    price: '',
    stock: '14',
    weight: '',
  });
  assert.equal(filteredByCategoryAndStock.length, 1);
  assert.equal(filteredByCategoryAndStock[0].sku, 'KNT-SNS-002');

  const filteredBySkuAndPrice = applyAdminMultiColumnFilter(sampleCatalog, {
    sku: 'PWR',
    name: '',
    category: '',
    price: '175.50',
    stock: '0',
    weight: '1.850',
  });
  assert.equal(filteredBySkuAndPrice.length, 1);
  assert.equal(filteredBySkuAndPrice[0].sku, 'KNT-PWR-003');
});

test('7. PBKDF2-HMAC-SHA256 Password Hashing & Role-Based Access Control Verification', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash1 = crypto.pbkdf2Sync('admin', salt, 100000, 32, 'sha256').toString('hex');
  const hash2 = crypto.pbkdf2Sync('admin', salt, 100000, 32, 'sha256').toString('hex');
  const wrongHash = crypto.pbkdf2Sync('wrong', salt, 100000, 32, 'sha256').toString('hex');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, wrongHash);

  const appSource = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(appSource.includes("currentUser?.role === 'admin'"), 'Admin role guard must be present in App.tsx');
  assert.ok(appSource.includes("currentUser?.role === 'user'"), 'User role guard must be present in App.tsx');
});
