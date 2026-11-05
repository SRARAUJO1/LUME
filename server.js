// Lume — gestão para restaurantes e lanchonetes de pequeno porte.
// Stack: Node.js + Express + SQLite (node:sqlite, sem dependências nativas).
// Rode com: npm install && npm start  (porta 3000, ou PORT no ambiente).
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'lume.db'));

// ---------------- Banco de dados ----------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  category TEXT NOT NULL,
  photo TEXT,
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stock_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'un',
  min_quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS menu_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
  qty_per_unit REAL NOT NULL DEFAULT 1,
  UNIQUE(menu_item_id, stock_item_id)
);
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'livre'
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  origin TEXT NOT NULL,
  table_number INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  notes TEXT DEFAULT '',
  total_cents INTEGER NOT NULL DEFAULT 0,
  stock_deducted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  menu_item_id INTEGER,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_by INTEGER REFERENCES users(id),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  initial_cents INTEGER NOT NULL DEFAULT 0,
  final_cents INTEGER,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  cash_session_id INTEGER REFERENCES cash_sessions(id),
  method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  driver_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'em preparo',
  origin_name TEXT DEFAULT 'Restaurante',
  dest_name TEXT DEFAULT '',
  driver_lat REAL,
  driver_lng REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Módulos visíveis por perfil (a UI usa isso; o servidor também bloqueia
// as operações sensíveis por perfil nas rotas marcadas).
const MODULES = {
  dono: ['visao', 'cardapio', 'pedidos', 'mesas', 'caixa', 'estoque', 'entregas', 'relatorios', 'acessos'],
  gerente: ['visao', 'cardapio', 'pedidos', 'mesas', 'caixa', 'estoque', 'entregas', 'relatorios'],
  caixa: ['pedidos', 'mesas', 'caixa'],
  cozinha: ['pedidos', 'estoque'],
  entregador: ['entregas'],
  atendente: ['cardapio', 'pedidos', 'mesas'],
};
const CATEGORIES = ['Lanches', 'Porções', 'Pratos', 'Bebidas', 'Sobremesas'];
const ORIGINS = ['Mesa', 'Caixa', 'Delivery', 'iFood', '99'];
const ORDER_FLOW = ['novo', 'em preparo', 'pronto', 'em rota', 'entregue'];

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function createUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)')
    .run(username, hashPassword(password, salt), salt, role);
}

// Seed inicial (só na primeira execução).
if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  createUser('dono', 'lume123', 'dono');
  createUser('gerente', 'gerente123', 'gerente');
  createUser('caixa', 'caixa123', 'caixa');
  createUser('cozinha', 'cozinha123', 'cozinha');
  createUser('entregador', 'entregador123', 'entregador');
  createUser('atendente', 'atendente123', 'atendente');
}
if (db.prepare('SELECT COUNT(*) c FROM tables').get().c === 0) {
  const ins = db.prepare('INSERT INTO tables (number) VALUES (?)');
  for (let n = 1; n <= 100; n++) ins.run(n);
}
if (db.prepare('SELECT COUNT(*) c FROM menu_items').get().c === 0) {
  const ins = db.prepare('INSERT INTO menu_items (name, price_cents, category, available) VALUES (?, ?, ?, 1)');
  ins.run('Smash Clássico', 2490, 'Lanches');
  ins.run('Smash Bacon', 2990, 'Lanches');
  ins.run('Hot Dog Completo', 1990, 'Lanches');
  ins.run('Frango Crocante', 2690, 'Porções');
  ins.run('Batata da Casa', 1800, 'Porções');
  ins.run('Prato Executivo', 3490, 'Pratos');
  ins.run('Suco de Laranja', 900, 'Bebidas');
  ins.run('Refrigerante', 800, 'Bebidas');
  ins.run('Brownie com Sorvete', 1600, 'Sobremesas');
}
if (db.prepare('SELECT COUNT(*) c FROM stock_items').get().c === 0) {
  const ins = db.prepare('INSERT INTO stock_items (name, quantity, unit, min_quantity) VALUES (?, ?, ?, ?)');
  ins.run('Pão brioche', 120, 'un', 20);
  ins.run('Blend bovino', 40, 'kg', 10);
  ins.run('Queijo cheddar', 8, 'kg', 10); // já abaixo do mínimo, para demonstrar o alerta
  ins.run('Batata', 25, 'kg', 5);
  ins.run('Refrigerante lata', 60, 'un', 12);
}
if (db.prepare("SELECT COUNT(*) c FROM settings WHERE key='credit_rate'").get().c === 0) {
  db.prepare("INSERT INTO settings VALUES ('credit_rate', '3.49')").run();
  db.prepare("INSERT INTO settings VALUES ('debit_rate', '1.49')").run();
}

function orderCode(id) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `LUME-${ymd}-${String(id).padStart(4, '0')}`;
}

// Baixa automática de estoque quando o pedido é entregue (uma única vez).
function deductStock(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || order.stock_deducted) return;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  for (const item of items) {
    const links = db.prepare('SELECT * FROM menu_stock WHERE menu_item_id = ?').all(item.menu_item_id);
    for (const link of links) {
      db.prepare('UPDATE stock_items SET quantity = quantity - ? WHERE id = ?')
        .run(link.qty_per_unit * item.quantity, link.stock_item_id);
    }
  }
  db.prepare('UPDATE orders SET stock_deducted = 1 WHERE id = ?').run(orderId);
}

function lowStock() {
  return db.prepare('SELECT * FROM stock_items WHERE quantity <= min_quantity ORDER BY name').all();
}

// ---------------- App ----------------
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sem sessão. Faça login.' });
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1').get(token);
  if (!row) return res.status(401).json({ error: 'Sessão inválida.' });
  req.user = { id: row.id, username: row.username, role: row.role };
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Seu perfil não tem permissão para esta ação.' });
    next();
  };
}
const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, modules: MODULES[u.role] || [] });

// Login / sessão
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || hashPassword(password || '', user.salt) !== user.password_hash) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.json({ token, user: publicUser(user) });
});
app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// Usuários e perfis (só o dono gerencia)
app.get('/api/users', auth, requireRole('dono'), (req, res) => {
  res.json(db.prepare('SELECT id, username, role, active, created_at FROM users ORDER BY username').all());
});
app.post('/api/users', auth, requireRole('dono'), (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !MODULES[role]) return res.status(400).json({ error: 'Informe usuário, senha e um perfil válido.' });
  try { createUser(username, password, role); } catch { return res.status(400).json({ error: 'Nome de usuário já existe.' }); }
  res.json({ ok: true });
});
app.patch('/api/users/:id', auth, requireRole('dono'), (req, res) => {
  const { role, active } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (role && !MODULES[role]) return res.status(400).json({ error: 'Perfil inválido.' });
  db.prepare('UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?')
    .run(role || null, active === undefined ? null : (active ? 1 : 0), req.params.id);
  res.json({ ok: true });
});

// Cardápio
app.get('/api/menu', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_items ORDER BY category, name').all());
});
app.post('/api/menu', auth, requireRole('dono', 'gerente'), (req, res) => {
  const { name, price_cents, category, photo, available } = req.body || {};
  if (!name || price_cents === undefined || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Informe nome, preço e uma categoria válida.' });
  }
  const r = db.prepare('INSERT INTO menu_items (name, price_cents, category, photo, available) VALUES (?, ?, ?, ?, ?)')
    .run(name, Math.round(price_cents), category, photo || null, available === false ? 0 : 1);
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(r.lastInsertRowid));
});
app.patch('/api/menu/:id', auth, requireRole('dono', 'gerente'), (req, res) => {
  const m = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Item não encontrado.' });
  const b = req.body || {};
  db.prepare('UPDATE menu_items SET name = COALESCE(?, name), price_cents = COALESCE(?, price_cents), category = COALESCE(?, category), photo = COALESCE(?, photo), available = COALESCE(?, available) WHERE id = ?')
    .run(b.name || null, b.price_cents ?? null, b.category || null, b.photo || null, b.available === undefined ? null : (b.available ? 1 : 0), req.params.id);
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id));
});
app.delete('/api/menu/:id', auth, requireRole('dono', 'gerente'), (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
app.get('/api/categories', auth, (req, res) => res.json(CATEGORIES));

// Estoque
app.get('/api/stock', auth, (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM stock_items ORDER BY name').all(), low: lowStock() });
});
app.post('/api/stock', auth, requireRole('dono', 'gerente'), (req, res) => {
  const { name, quantity, unit, min_quantity } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Informe o nome do insumo.' });
  const r = db.prepare('INSERT INTO stock_items (name, quantity, unit, min_quantity) VALUES (?, ?, ?, ?)')
    .run(name, quantity || 0, unit || 'un', min_quantity || 0);
  res.json(db.prepare('SELECT * FROM stock_items WHERE id = ?').get(r.lastInsertRowid));
});
app.patch('/api/stock/:id', auth, requireRole('dono', 'gerente'), (req, res) => {
  const s = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Insumo não encontrado.' });
  const b = req.body || {};
  db.prepare('UPDATE stock_items SET name = COALESCE(?, name), quantity = COALESCE(?, quantity), unit = COALESCE(?, unit), min_quantity = COALESCE(?, min_quantity) WHERE id = ?')
    .run(b.name || null, b.quantity ?? null, b.unit || null, b.min_quantity ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id));
});
app.post('/api/menu-stock', auth, requireRole('dono', 'gerente'), (req, res) => {
  const { menu_item_id, stock_item_id, qty_per_unit } = req.body || {};
  db.prepare('INSERT OR REPLACE INTO menu_stock (menu_item_id, stock_item_id, qty_per_unit) VALUES (?, ?, ?)')
    .run(menu_item_id, stock_item_id, qty_per_unit || 1);
  res.json({ ok: true });
});
app.get('/api/menu-stock/:menuItemId', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_stock WHERE menu_item_id = ?').all(req.params.menuItemId));
});

// Mesas
app.get('/api/tables', auth, (req, res) => {
  const tables = db.prepare('SELECT * FROM tables ORDER BY number').all();
  const open = db.prepare("SELECT table_number, COUNT(*) c FROM orders WHERE table_number IS NOT NULL AND status NOT IN ('entregue', 'cancelado') GROUP BY table_number").all();
  const openMap = Object.fromEntries(open.map((o) => [o.table_number, o.c]));
  res.json(tables.map((t) => ({ ...t, open_orders: openMap[t.number] || 0 })));
});
app.post('/api/tables/:number/open', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tables WHERE number = ?').get(req.params.number);
  if (!t) return res.status(404).json({ error: 'Mesa não encontrada.' });
  db.prepare("UPDATE tables SET status = 'ocupada' WHERE number = ?").run(req.params.number);
  res.json({ ok: true });
});
app.post('/api/tables/:number/transfer', auth, (req, res) => {
  const from = Number(req.params.number);
  const to = Number((req.body || {}).to_number);
  const dest = db.prepare('SELECT * FROM tables WHERE number = ?').get(to);
  if (!dest) return res.status(404).json({ error: 'Mesa de destino não encontrada.' });
  const destOpen = db.prepare("SELECT COUNT(*) c FROM orders WHERE table_number = ? AND status NOT IN ('entregue', 'cancelado')").get(to).c;
  if (destOpen > 0) return res.status(400).json({ error: 'A mesa de destino já está ocupada. Escolha uma mesa livre.' });
  db.prepare("UPDATE orders SET table_number = ? WHERE table_number = ? AND status NOT IN ('entregue', 'cancelado')").run(to, from);
  db.prepare("UPDATE tables SET status = 'livre' WHERE number = ?").run(from);
  db.prepare("UPDATE tables SET status = 'ocupada' WHERE number = ?").run(to);
  res.json({ ok: true, to_number: to });
});

// Pedidos (lançamento manual: nada entra sem escolha explícita)
function createOrder(body, isPublic) {
  const { origin, table_number, items, notes, customer_name, customer_phone, address } = body || {};
  if (!ORIGINS.includes(origin)) throw { status: 400, message: 'Origem inválida. Use Mesa, Caixa, Delivery, iFood ou 99.' };
  if (!Array.isArray(items) || items.length === 0) throw { status: 400, message: 'Escolha pelo menos um item para o pedido.' };
  let total = 0;
  const lines = [];
  for (const it of items) {
    const menu = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1').get(it.menu_item_id);
    if (!menu) throw { status: 400, message: `Item ${it.menu_item_id} indisponível.` };
    const qty = Math.max(1, Math.floor(it.quantity || 1));
    total += menu.price_cents * qty;
    lines.push({ menu_item_id: menu.id, name: menu.name, price_cents: menu.price_cents, quantity: qty, notes: it.notes || '' });
  }
  const r = db.prepare('INSERT INTO orders (origin, table_number, customer_name, customer_phone, address, status, notes, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(origin, table_number || null, customer_name || null, customer_phone || null, address || null, 'novo', notes || '', total);
  const id = r.lastInsertRowid;
  db.prepare('UPDATE orders SET code = ? WHERE id = ?').run(orderCode(id), id);
  const ins = db.prepare('INSERT INTO order_items (order_id, menu_item_id, name, price_cents, quantity, notes) VALUES (?, ?, ?, ?, ?, ?)');
  for (const l of lines) ins.run(id, l.menu_item_id, l.name, l.price_cents, l.quantity, l.notes);
  if (table_number) db.prepare("UPDATE tables SET status = 'ocupada' WHERE number = ?").run(table_number);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}
app.post('/api/orders', auth, (req, res) => {
  try { res.json(createOrder(req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message || 'Erro ao criar pedido.' }); }
});
app.get('/api/orders', auth, (req, res) => {
  const { origin, status, since } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (origin) { sql += ' AND origin = ?'; params.push(origin); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (since) { sql += ' AND id > ?'; params.push(Number(since)); }
  sql += ' ORDER BY id DESC LIMIT 200';
  const orders = db.prepare(sql).all(...params);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY id DESC LIMIT 200)').all();
  const byOrder = {};
  for (const it of items) (byOrder[it.order_id] = byOrder[it.order_id] || []).push(it);
  res.json(orders.map((o) => ({ ...o, items: byOrder[o.id] || [] })));
});
app.get('/api/orders/:id', auth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  res.json(o);
});
app.post('/api/orders/:id/status', auth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const next = (req.body || {}).status;
  const curIdx = ORDER_FLOW.indexOf(o.status);
  const nextIdx = ORDER_FLOW.indexOf(next);
  if (next === 'cancelado') {
    db.prepare("UPDATE orders SET status = 'cancelado', updated_at = datetime('now') WHERE id = ?").run(o.id);
    if (o.table_number) maybeFreeTable(o.table_number);
    return res.json({ ok: true });
  }
  if (nextIdx < 0 || nextIdx !== curIdx + 1) {
    return res.status(400).json({ error: `Transição inválida: de "${o.status}" só é possível avançar para "${ORDER_FLOW[curIdx + 1] || '—'}".` });
  }
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, o.id);
  if (next === 'entregue') {
    deductStock(o.id);
    if (o.table_number) maybeFreeTable(o.table_number);
  }
  res.json({ ok: true, status: next });
});
function maybeFreeTable(number) {
  const open = db.prepare("SELECT COUNT(*) c FROM orders WHERE table_number = ? AND status NOT IN ('entregue', 'cancelado')").get(number).c;
  if (open === 0) db.prepare("UPDATE tables SET status = 'livre' WHERE number = ?").run(number);
}
app.post('/api/orders/:id/close-table', auth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const open = db.prepare("SELECT * FROM orders WHERE table_number = ? AND status NOT IN ('entregue', 'cancelado') ORDER BY id").all(o.table_number);
  if (open.length === 0) return res.status(400).json({ error: 'Não há pedidos abertos nesta mesa.' });
  const total = open.reduce((s, x) => s + x.total_cents, 0);
  for (const x of open) {
    db.prepare("UPDATE orders SET status = 'entregue', updated_at = datetime('now') WHERE id = ?").run(x.id);
    deductStock(x.id);
  }
  if (o.table_number) db.prepare("UPDATE tables SET status = 'livre' WHERE number = ?").run(o.table_number);
  return res.json({ ok: true, closed_orders: open.map((x) => x.code), total_cents: total });
});

// Caixa / PDV
app.get('/api/cash/open', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').get() || null);
});
app.post('/api/cash/open', auth, requireRole('dono', 'gerente', 'caixa'), (req, res) => {
  const existing = db.prepare('SELECT * FROM cash_sessions WHERE closed_at IS NULL').get();
  if (existing) return res.status(400).json({ error: 'Já existe um caixa aberto.' });
  const r = db.prepare('INSERT INTO cash_sessions (opened_by, initial_cents, notes) VALUES (?, ?, ?)')
    .run(req.user.id, (req.body || {}).initial_cents || 0, (req.body || {}).notes || '');
  res.json(db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(r.lastInsertRowid));
});
app.post('/api/cash/close', auth, requireRole('dono', 'gerente', 'caixa'), (req, res) => {
  const open = db.prepare('SELECT * FROM cash_sessions WHERE closed_at IS NULL').get();
  if (!open) return res.status(400).json({ error: 'Não há caixa aberto para fechar.' });
  const sum = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) s FROM payments WHERE cash_session_id = ?').get(open.id).s;
  const final = open.initial_cents + sum;
  db.prepare("UPDATE cash_sessions SET closed_at = datetime('now'), final_cents = ? WHERE id = ?").run(final, open.id);
  res.json({ ok: true, final_cents: final, payments_cents: sum });
});
app.post('/api/payments', auth, requireRole('dono', 'gerente', 'caixa'), (req, res) => {
  const { order_id, method, amount_cents } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const paid = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) s FROM payments WHERE order_id = ?').get(order_id).s;
  const remaining = order.total_cents - paid;
  if (amount_cents > remaining) {
    return res.status(400).json({ error: `Pagamento maior que o restante. Falta R$ ${(remaining / 100).toFixed(2).replace('.', ',')}.` });
  }
  const open = db.prepare('SELECT * FROM cash_sessions WHERE closed_at IS NULL').get();
  const credit = Number(db.prepare("SELECT value FROM settings WHERE key='credit_rate'").get().value);
  const debit = Number(db.prepare("SELECT value FROM settings WHERE key='debit_rate'").get().value);
  const rate = method === 'credito' ? credit : method === 'debito' ? debit : 0;
  const fee = Math.round(amount_cents * rate / 100);
  const r = db.prepare('INSERT INTO payments (order_id, cash_session_id, method, amount_cents, fee_cents, net_cents) VALUES (?, ?, ?, ?, ?, ?)')
    .run(order_id, open ? open.id : null, method, amount_cents, fee, amount_cents - fee);
  res.json(db.prepare('SELECT * FROM payments WHERE id = ?').get(r.lastInsertRowid));
});
app.get('/api/payments/:orderId', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id').all(req.params.orderId));
});
app.get('/api/settings/fees', auth, (req, res) => {
  res.json({
    credit_rate: Number(db.prepare("SELECT value FROM settings WHERE key='credit_rate'").get().value),
    debit_rate: Number(db.prepare("SELECT value FROM settings WHERE key='debit_rate'").get().value),
  });
});
app.post('/api/settings/fees', auth, requireRole('dono', 'gerente'), (req, res) => {
  const { credit_rate, debit_rate } = req.body || {};
  if (credit_rate !== undefined) db.prepare("UPDATE settings SET value = ? WHERE key='credit_rate'").run(String(credit_rate));
  if (debit_rate !== undefined) db.prepare("UPDATE settings SET value = ? WHERE key='debit_rate'").run(String(debit_rate));
  res.json({ ok: true });
});
app.post('/api/calc-fee', auth, (req, res) => {
  const { amount_cents, method } = req.body || {};
  const credit = Number(db.prepare("SELECT value FROM settings WHERE key='credit_rate'").get().value);
  const debit = Number(db.prepare("SELECT value FROM settings WHERE key='debit_rate'").get().value);
  const rate = method === 'credito' ? credit : method === 'debito' ? debit : 0;
  const fee = Math.round((amount_cents || 0) * rate / 100);
  res.json({ gross_cents: amount_cents || 0, rate, fee_cents: fee, net_cents: (amount_cents || 0) - fee });
});
app.post('/api/split', auth, (req, res) => {
  const { total_cents, parts } = req.body || {};
  const n = Math.max(1, Math.floor(parts || 1));
  const base = Math.floor((total_cents || 0) / n);
  const out = Array(n).fill(base);
  out[n - 1] += (total_cents || 0) - base * n;
  res.json({ parts: out });
});

// Entregas
app.get('/api/deliveries', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, o.code AS order_code, o.status AS order_status, o.customer_name, o.address,
           u.username AS driver_name
    FROM deliveries d JOIN orders o ON o.id = d.order_id LEFT JOIN users u ON u.id = d.driver_id
    ORDER BY d.id DESC LIMIT 200`).all();
  res.json(rows);
});
app.post('/api/deliveries', auth, requireRole('dono', 'gerente', 'atendente', 'caixa'), (req, res) => {
  const { order_id, driver_id } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const driver = driver_id ? db.prepare("SELECT * FROM users WHERE id = ? AND role = 'entregador' AND active = 1").get(driver_id) : null;
  if (driver_id && !driver) return res.status(400).json({ error: 'Entregador inválido.' });
  const r = db.prepare('INSERT INTO deliveries (order_id, driver_id, dest_name) VALUES (?, ?, ?)')
    .run(order_id, driver_id || null, order.address || '');
  res.json(db.prepare('SELECT * FROM deliveries WHERE id = ?').get(r.lastInsertRowid));
});
const DELIVERY_FLOW = ['em preparo', 'pronto', 'em rota', 'entregue'];
app.post('/api/deliveries/:id/status', auth, (req, res) => {
  const d = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Entrega não encontrada.' });
  const next = (req.body || {}).status;
  const cur = DELIVERY_FLOW.indexOf(d.status);
  const nxt = DELIVERY_FLOW.indexOf(next);
  if (nxt !== cur + 1) return res.status(400).json({ error: `Transição inválida: de "${d.status}" só é possível avançar para "${DELIVERY_FLOW[cur + 1] || '—'}".` });
  if (next === 'em rota' && !d.driver_id) return res.status(400).json({ error: 'Atribua um entregador antes de sair para rota.' });
  db.prepare("UPDATE deliveries SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, d.id);
  const orderStatus = next === 'em rota' ? 'em rota' : next === 'entregue' ? 'entregue' : next;
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(orderStatus, d.order_id);
  if (next === 'entregue') deductStock(d.order_id);
  res.json({ ok: true, status: next });
});
app.post('/api/deliveries/:id/location', auth, (req, res) => {
  const d = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Entrega não encontrada.' });
  if (req.user.role === 'entregador' && d.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Esta entrega não está atribuída a você.' });
  }
  const { lat, lng } = req.body || {};
  db.prepare("UPDATE deliveries SET driver_lat = ?, driver_lng = ?, updated_at = datetime('now') WHERE id = ?").run(lat, lng, d.id);
  res.json({ ok: true });
});
app.get('/api/drivers', auth, (req, res) => {
  res.json(db.prepare("SELECT id, username FROM users WHERE role = 'entregador' AND active = 1 ORDER BY username").all());
});

// Relatórios
app.get('/api/reports/sales', auth, (req, res) => {
  const from = req.query.from || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const productId = req.query.product_id ? Number(req.query.product_id) : null;
  let itemFilter = '';
  const params = [from, to];
  if (productId) { itemFilter = ' AND oi.menu_item_id = ?'; params.push(productId); }
  const series = db.prepare(`
    SELECT substr(o.created_at, 1, 10) AS day, COUNT(DISTINCT o.id) AS orders,
           COALESCE(SUM(oi.price_cents * oi.quantity), 0) AS revenue_cents,
           COALESCE(SUM(oi.quantity), 0) AS units
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status = 'entregue' AND substr(o.created_at, 1, 10) BETWEEN ? AND ? ${itemFilter}
    GROUP BY day ORDER BY day`).all(...params);
  const ranking = db.prepare(`
    SELECT oi.menu_item_id, oi.name, SUM(oi.quantity) AS qty, SUM(oi.price_cents * oi.quantity) AS revenue_cents
    FROM orders o JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status = 'entregue' AND substr(o.created_at, 1, 10) BETWEEN ? AND ?
    GROUP BY oi.menu_item_id, oi.name ORDER BY qty DESC LIMIT 20`).all(from, to);
  res.json({ from, to, series, ranking });
});

// ---------------- Área pública do cliente (sem login) ----------------
app.get('/api/public/menu', (req, res) => {
  res.json(db.prepare('SELECT id, name, price_cents, category, photo FROM menu_items WHERE available = 1 ORDER BY category, name').all());
});
app.post('/api/public/orders', (req, res) => {
  try {
    const body = { ...(req.body || {}), origin: 'Delivery' };
    if (body.table_number) body.origin = 'Mesa';
    res.json(createOrder(body, true));
  } catch (e) { res.status(e.status || 500).json({ error: e.message || 'Erro ao criar pedido.' }); }
});
app.get('/api/public/orders/:code', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(req.params.code);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  res.json(o);
});
app.get('/api/public/tracking/:code', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(req.params.code);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const d = db.prepare('SELECT * FROM deliveries WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(o.id);
  res.json({ order: o, delivery: d || null });
});
app.get('/api/public/low-stock', (req, res) => res.json(lowStock()));

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'lume', version: '1.0.0' }));

app.listen(PORT, () => {
  console.log(`Lume rodando em http://localhost:${PORT}`);
  console.log('Login inicial do dono: dono / lume123 (troque a senha no primeiro uso).');
});
