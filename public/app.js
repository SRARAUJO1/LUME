// Lume — frontend (equipe + área do cliente). Sem build: JS puro.
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const money = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = localStorage.getItem('lume_token') || '';
let me = null;
let soundOn = localStorage.getItem('lume_sound') !== '0';
let lastOrderId = 0;

async function api(path, method = 'GET', body, pub = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (!pub && token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Erro ' + r.status));
  return data;
}
function show(id) { ['loginView', 'appView', 'clientView'].forEach((v) => $('#' + v).classList.toggle('hidden', v !== id)); }
function openClient() {
  const params = new URLSearchParams(location.search);
  const mesa = params.get('mesa');
  location.href = '/?cliente=1' + (mesa ? '&mesa=' + mesa : '');
}
function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem('lume_sound', soundOn ? '1' : '0');
  $('#soundBtn').textContent = soundOn ? '🔊 Modo com som' : '🔇 Modo sem som';
}
function playNotification() {
  if (!soundOn) return;
  const audio = $('#notifAudio');
  audio.play().catch(() => {
    try {
      const u = new SpeechSynthesisUtterance('Lume! Novo pedido recebido!');
      u.lang = 'pt-BR';
      speechSynthesis.speak(u);
    } catch {}
  });
}
async function pollOrders() {
  if (!me || !soundOn) return;
  try {
    const orders = await api('/api/orders?since=' + lastOrderId);
    if (orders.length) {
      const maxId = Math.max(...orders.map((o) => o.id));
      if (lastOrderId && maxId > lastOrderId) playNotification();
      lastOrderId = Math.max(lastOrderId, maxId);
    }
  } catch {}
}
function modal(html) {
  $('#modalRoot').innerHTML = '<div class="modal" onclick="if(event.target===this)closeModal()"><div class="box">' + html + '</div></div>';
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function popup(html) {
  $('#popupRoot').innerHTML = '<div class="popup">' + html + '<div style="margin-top:10px"><button onclick="document.getElementById(\'popupRoot\').innerHTML=\'\'">Fechar</button></div></div>';
}

const MODULE_LABELS = { visao: 'Visão geral', cardapio: 'Cardápio', pedidos: 'Pedidos e cozinha', mesas: 'Mesas', caixa: 'PDV & Caixa', estoque: 'Estoque', entregas: 'Entregas', relatorios: 'Relatórios', acessos: 'Acessos' };
let currentModule = 'visao';

async function initStaff() {
  try { const d = await api('/api/me'); me = d.user; }
  catch { show('loginView'); return; }
  $('#whoami').textContent = me.username + ' (' + me.role + ')';
  $('#soundBtn').textContent = soundOn ? '🔊 Modo com som' : '🔇 Modo sem som';
  const sb = $('#sidebar');
  sb.innerHTML = me.modules.map((m) => `<button class="${m === currentModule ? 'active' : ''}" onclick="go('${m}')">${MODULE_LABELS[m]}</button>`).join('');
  show('appView');
  go(currentModule);
  const orders = await api('/api/orders').catch(() => []);
  lastOrderId = orders.length ? Math.max(...orders.map((o) => o.id)) : 0;
  setInterval(pollOrders, 20000);
  const stock = await api('/api/stock').catch(() => null);
  if (stock && stock.low.length) {
    popup('<b>⚠ Estoque baixo</b><br>' + stock.low.map((s) => `${esc(s.name)}: ${s.quantity} ${esc(s.unit)} (mín. ${s.min_quantity})`).join('<br>'));
  }
}
function go(m) {
  currentModule = m;
  $$('#sidebar button').forEach((b) => b.classList.toggle('active', b.textContent === MODULE_LABELS[m]));
  ({ visao: viewVisao, cardapio: viewCardapio, pedidos: viewPedidos, mesas: viewMesas, caixa: viewCaixa, estoque: viewEstoque, entregas: viewEntregas, relatorios: viewRelatorios, acessos: viewAcessos })[m]();
}
async function doLogin() {
  try {
    const d = await api('/api/login', 'POST', { username: $('#loginUser').value.trim(), password: $('#loginPass').value });
    token = d.token; localStorage.setItem('lume_token', token);
    $('#loginErr').textContent = '';
    initStaff();
  } catch (e) { $('#loginErr').textContent = e.message; }
}
async function doLogout() { try { await api('/api/logout', 'POST'); } catch {} token = ''; localStorage.removeItem('lume_token'); me = null; show('loginView'); }

// ---------- Visão geral ----------
async function viewVisao() {
  const [orders, stock] = await Promise.all([api('/api/orders').catch(() => []), api('/api/stock').catch(() => ({ low: [] }))]);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => o.created_at.slice(0, 10) === today && o.status !== 'cancelado');
  const revenue = todayOrders.filter((o) => o.status === 'entregue').reduce((s, o) => s + o.total_cents, 0);
  $('#main').innerHTML = `<h2>Visão geral</h2><div class="grid">
    <div class="card"><h3>Pedidos hoje</h3><p style="font-size:28px">${todayOrders.length}</p></div>
    <div class="card"><h3>Faturado (entregues)</h3><p style="font-size:28px">${money(revenue)}</p></div>
    <div class="card"><h3>Em preparo / fila</h3><p style="font-size:28px">${orders.filter((o) => ['novo', 'em preparo'].includes(o.status)).length}</p></div>
    <div class="card"><h3>Alertas de estoque</h3><p style="font-size:28px">${stock.low.length}</p><p>${stock.low.map((s) => esc(s.name)).join(', ') || 'Nenhum'}</p></div>
  </div>
  <div class="card"><h3>Últimos pedidos</h3>${orders.slice(0, 8).map((o) => `<p><b>${esc(o.code)}</b> — ${esc(o.origin)} — ${esc(o.status)} — ${money(o.total_cents)}</p>`).join('') || 'Nenhum pedido ainda.'}</div>`;
}

// ---------- Cardápio ----------
async function viewCardapio() {
  const items = await api('/api/menu');
  const cats = await api('/api/categories');
  $('#main').innerHTML = `<h2>Cardápio digital</h2>
  <div class="card"><button class="primary" onclick="menuForm()">+ Novo item</button></div>
  <div class="grid">${items.map((it) => `<div class="card">
    ${it.photo ? `<img class="item-photo" src="${esc(it.photo)}">` : ''}
    <h3 style="margin:8px 0 2px">${esc(it.name)}</h3>
    <p style="color:var(--muted)">${esc(it.category)}</p>
    <p><b>${money(it.price_cents)}</b> <span class="badge ${it.available ? 'ok' : 'warn'}">${it.available ? 'Disponível' : 'Indisponível'}</span></p>
    <button onclick="menuForm(${it.id})">Editar</button>
    <button onclick="delMenu(${it.id})">Excluir</button>
  </div>`).join('') || '<p>Nenhum item ainda.</p>'}</div>`;
  window._menu = items; window._cats = cats;
}
function menuForm(id) {
  const it = id ? window._menu.find((x) => x.id === id) : null;
  modal(`<h3>${it ? 'Editar item' : 'Novo item'}</h3>
    <label>Nome do item</label><input id="f_name" value="${esc(it?.name || '')}" placeholder="Ex.: Smash bacon">
    <div class="row"><div><label>Preço (R$)</label><input id="f_price" type="number" step="0.01" value="${it ? (it.price_cents / 100).toFixed(2) : ''}"></div>
    <div><label>Categoria</label><select id="f_cat">${window._cats.map((c) => `<option ${it?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <label>Foto do item</label><input id="f_photo" type="file" accept="image/png,image/jpeg,image/webp">
    ${it?.photo ? `<img src="${esc(it.photo)}" class="item-photo" style="margin-top:8px">` : ''}
    <label>Disponibilidade</label><select id="f_av"><option value="1">Disponível para venda</option><option value="0">Indisponível</option></select>
    <p id="f_err" class="err"></p>
    <div class="row"><button onclick="closeModal()">Cancelar</button><button class="primary" onclick="saveMenu(${id || 0})">Salvar item</button></div>`);
  if (it) $('#f_av').value = it.available ? '1' : '0';
}
async function saveMenu(id) {
  const name = $('#f_name').value.trim();
  const price = parseFloat($('#f_price').value);
  if (!name || isNaN(price)) { $('#f_err').textContent = 'Informe o nome e o preço do item.'; return; }
  let photo = id ? (window._menu.find((x) => x.id === id)?.photo || null) : null;
  const file = $('#f_photo').files[0];
  if (file) photo = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  try {
    const body = { name, price_cents: Math.round(price * 100), category: $('#f_cat').value, photo, available: $('#f_av').value === '1' };
    if (id) await api('/api/menu/' + id, 'PATCH', body); else await api('/api/menu', 'POST', body);
    closeModal(); viewCardapio();
  } catch (e) { $('#f_err').textContent = e.message; }
}
async function delMenu(id) { if (confirm('Excluir este item?')) { await api('/api/menu/' + id, 'DELETE'); viewCardapio(); } }

// ---------- Pedidos e cozinha ----------
async function viewPedidos() {
  const [orders, menu] = await Promise.all([api('/api/orders'), api('/api/menu')]);
  window._orders = orders; window._menuAll = menu;
  const filter = window._orderFilter || 'Todos';
  const filtered = filter === 'Todos' ? orders : orders.filter((o) => o.origin === filter);
  $('#main').innerHTML = `<h2>Pedidos e cozinha</h2>
  <div class="card"><button class="primary" onclick="orderForm()">+ Novo pedido</button>
  <div style="margin-top:12px">${['Todos', 'Mesa', 'Caixa', 'Delivery', 'iFood', '99'].map((f) => `<button onclick="window._orderFilter='${f}';viewPedidos()" style="${filter === f ? 'background:var(--orange);color:#fff' : ''}">${f}</button>`).join(' ')}</div></div>
  ${filtered.map(orderCard).join('') || '<p>Nenhum pedido neste filtro.</p>'}`;
}
function orderCard(o) {
  const next = { novo: 'em preparo', 'em preparo': 'pronto', pronto: 'em rota', 'em rota': 'entregue' }[o.status];
  return `<div class="card"><div class="row"><div><b>${esc(o.code)}</b> — ${esc(o.origin)}${o.table_number ? ' • Mesa ' + o.table_number : ''} — <span class="badge">${esc(o.status)}</span></div><div style="text-align:right"><b>${money(o.total_cents)}</b></div></div>
  ${o.items.map((i) => `<p>• ${i.quantity}x ${esc(i.name)} — ${money(i.price_cents * i.quantity)}${i.notes ? ` <em style="color:var(--amber)">(${esc(i.notes)})</em>` : ''}</p>`).join('')}
  ${o.notes ? `<p><em>Obs. geral: ${esc(o.notes)}</em></p>` : ''}
  <div class="row" style="flex:none">
    ${next ? `<button class="primary" onclick="advanceOrder(${o.id},'${next}')">Avançar para ${next}</button>` : ''}
    ${o.status !== 'entregue' && o.status !== 'cancelado' ? `<button onclick="advanceOrder(${o.id},'cancelado')">Cancelar</button>` : ''}
    ${o.table_number && o.status !== 'entregue' ? `<button onclick="closeTableOrder(${o.id})">Fechar conta da mesa</button>` : ''}
  </div></div>`;
}
async function advanceOrder(id, status) {
  try { await api('/api/orders/' + id + '/status', 'POST', { status }); viewPedidos(); }
  catch (e) { alert(e.message); }
}
async function closeTableOrder(id) {
  try { const r = await api('/api/orders/' + id + '/close-table', 'POST'); alert('Conta fechada: ' + money(r.total_cents)); viewPedidos(); }
  catch (e) { alert(e.message); }
}
function orderForm() {
  const menu = window._menuAll || [];
  modal(`<h3>Novo pedido</h3>
    <label>Origem</label><select id="o_origin"><option>Mesa</option><option>Caixa</option><option>Delivery</option><option>iFood</option><option>99</option></select>
    <label>Mesa (se origem Mesa)</label><input id="o_table" type="number" min="1" max="100" placeholder="Ex.: 12">
    <label>Cliente / telefone / endereço (delivery)</label><input id="o_customer" placeholder="Nome"><input id="o_phone" placeholder="Telefone" style="margin-top:6px"><input id="o_addr" placeholder="Endereço" style="margin-top:6px">
    <label>Itens — escolha cada item e a quantidade</label>
    <div id="o_items">${menu.filter((m) => m.available).map((m) => `<div class="row" style="align-items:center"><div><b>${esc(m.name)}</b> — ${money(m.price_cents)}</div><div style="flex:none"><input type="number" min="0" value="0" data-id="${m.id}" style="width:70px"></div><div><input placeholder="Obs. do item (ex.: sem cebola)" data-notes="${m.id}"></div></div>`).join('') || 'Nenhum item disponível.'}</div>
    <label>Observação geral do pedido</label><textarea id="o_notes" rows="2"></textarea>
    <p id="o_err" class="err"></p>
    <div class="row"><button onclick="closeModal()">Cancelar</button><button class="primary" onclick="saveOrder()">Enviar para a cozinha</button></div>`);
}
async function saveOrder() {
  const items = [];
  $$('#o_items input[type=number]').forEach((inp) => {
    const qty = parseInt(inp.value, 10);
    if (qty > 0) {
      const notes = $(`#o_items input[data-notes="${inp.dataset.id}"]`).value.trim();
      items.push({ menu_item_id: Number(inp.dataset.id), quantity: qty, notes });
    }
  });
  if (!items.length) { $('#o_err').textContent = 'Escolha pelo menos um item.'; return; }
  try {
    await api('/api/orders', 'POST', {
      origin: $('#o_origin').value,
      table_number: $('#o_table').value ? Number($('#o_table').value) : null,
      items, notes: $('#o_notes').value.trim(),
      customer_name: $('#o_customer').value.trim(), customer_phone: $('#o_phone').value.trim(), address: $('#o_addr').value.trim(),
    });
    closeModal(); viewPedidos();
  } catch (e) { $('#o_err').textContent = e.message; }
}

// ---------- Mesas ----------
async function viewMesas() {
  const tables = await api('/api/tables');
  $('#main').innerHTML = `<h2>Salão — 100 mesas</h2><p style="color:var(--muted)">Clique numa mesa para abrir e lançar pedidos. Mesas ocupadas aparecem em laranja.</p>
  <div class="table-grid">${tables.map((t) => `<div class="mesa ${t.open_orders ? 'ocupada' : ''}" onclick="openTable(${t.number})">Mesa ${t.number}${t.open_orders ? `<br><small>${t.open_orders} pedido(s)</small>` : ''}</div>`).join('')}</div>`;
}
async function openTable(number) {
  const orders = await api('/api/orders');
  const open = orders.filter((o) => o.table_number === number && !['entregue', 'cancelado'].includes(o.status));
  const tables = await api('/api/tables');
  const free = tables.filter((t) => !t.open_orders && t.number !== number);
  modal(`<h3>Mesa ${number}</h3>
    ${open.length ? open.map(orderCard).join('') : '<p>Mesa livre — nenhum pedido aberto.</p>'}
    <div class="row"><button class="primary" onclick="closeModal();window._menuAll=null;orderFormForTable(${number})">+ Lançar pedido</button>
    <button onclick="transferForm(${number})">Transferir mesa</button></div>
    <label>Transferir para a mesa livre:</label>
    <select id="t_dest">${free.map((t) => `<option value="${t.number}">Mesa ${t.number}</option>`).join('') || '<option value="">Nenhuma mesa livre</option>'}</select>
    <button style="margin-top:8px" onclick="doTransfer(${number})">Confirmar transferência</button>`);
}
async function orderFormForTable(number) {
  const menu = await api('/api/menu');
  window._menuAll = menu;
  orderForm();
  setTimeout(() => { $('#o_origin').value = 'Mesa'; $('#o_table').value = number; }, 50);
}
function transferForm(number) { const sel = $('#t_dest'); if (sel) sel.focus(); }
async function doTransfer(from) {
  const to = $('#t_dest').value;
  if (!to) { alert('Não há mesa livre para transferir.'); return; }
  try { await api(`/api/tables/${from}/transfer`, 'POST', { to_number: Number(to) }); closeModal(); viewMesas(); }
  catch (e) { alert(e.message); }
}

// ---------- PDV & Caixa ----------
async function viewCaixa() {
  const [open, fees] = await Promise.all([api('/api/cash/open'), api('/api/settings/fees')]);
  const orders = await api('/api/orders');
  const unpaid = orders.filter((o) => o.status !== 'cancelado');
  $('#main').innerHTML = `<h2>PDV & Caixa</h2>
  <div class="card"><h3>Caixa</h3>${open ? `<p>Caixa aberto desde ${esc(open.opened_at)} — abertura ${money(open.initial_cents)}</p><button class="primary" onclick="closeCash()">Fechar caixa</button>` : `<div class="row"><div><label>Valor inicial (R$)</label><input id="cash_init" type="number" step="0.01" value="0"></div></div><button class="primary" onclick="openCash()">Abrir caixa</button>`}<p id="cash_msg"></p></div>
  <div class="card"><h3>Calculadora de taxa da maquininha</h3>
    <div class="row"><div><label>Valor bruto (R$)</label><input id="fee_val" type="number" step="0.01"></div>
    <div><label>Forma</label><select id="fee_method"><option value="credito">Crédito (${fees.credit_rate}%)</option><option value="debito">Débito (${fees.debit_rate}%)</option><option value="dinheiro">Dinheiro (sem taxa)</option></select></div></div>
    <button onclick="calcFee()">Calcular</button><p id="fee_out"></p>
    <div class="row"><div><label>Taxa crédito (%)</label><input id="fee_c" type="number" step="0.01" value="${fees.credit_rate}"></div><div><label>Taxa débito (%)</label><input id="fee_d" type="number" step="0.01" value="${fees.debit_rate}"></div></div>
    <button onclick="saveFees()">Salvar taxas</button></div>
  <div class="card"><h3>Receber pagamento / dividir conta</h3>
    <label>Pedido</label><select id="pay_order">${unpaid.map((o) => `<option value="${o.id}">${esc(o.code)} — ${money(o.total_cents)}</option>`).join('')}</select>
    <div class="row"><div><label>Valor (R$)</label><input id="pay_val" type="number" step="0.01"></div>
    <div><label>Forma</label><select id="pay_method"><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option><option value="pix">Pix</option></select></div></div>
    <button class="primary" onclick="doPay()">Receber</button>
    <div class="row" style="margin-top:12px"><div><label>Dividir em quantas partes?</label><input id="split_n" type="number" min="1" value="2"></div></div>
    <button onclick="doSplit()">Calcular divisão</button><p id="split_out"></p><p id="pay_msg"></p></div>`;
}
async function openCash() { try { await api('/api/cash/open', 'POST', { initial_cents: Math.round(parseFloat($('#cash_init').value || 0) * 100) }); viewCaixa(); } catch (e) { $('#cash_msg').textContent = e.message; } }
async function closeCash() { try { const r = await api('/api/cash/close', 'POST'); $('#cash_msg').textContent = 'Caixa fechado. Total: ' + money(r.final_cents); viewCaixa(); } catch (e) { $('#cash_msg').textContent = e.message; } }
async function calcFee() {
  const r = await api('/api/calc-fee', 'POST', { amount_cents: Math.round(parseFloat($('#fee_val').value || 0) * 100), method: $('#fee_method').value });
  $('#fee_out').innerHTML = `Bruto: <b>${money(r.gross_cents)}</b> • Taxa (${r.rate}%): <b>${money(r.fee_cents)}</b> • Líquido: <b>${money(r.net_cents)}</b>`;
}
async function saveFees() { await api('/api/settings/fees', 'POST', { credit_rate: parseFloat($('#fee_c').value), debit_rate: parseFloat($('#fee_d').value) }); alert('Taxas salvas.'); }
async function doPay() {
  try {
    const r = await api('/api/payments', 'POST', { order_id: Number($('#pay_order').value), method: $('#pay_method').value, amount_cents: Math.round(parseFloat($('#pay_val').value || 0) * 100) });
    $('#pay_msg').innerHTML = `<span class="ok">Recebido ${money(r.amount_cents)} (${r.method}) — taxa ${money(r.fee_cents)}, líquido ${money(r.net_cents)}.</span>`;
  } catch (e) { $('#pay_msg').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
}
async function doSplit() {
  const orderId = Number($('#pay_order').value);
  const orders = await api('/api/orders');
  const o = orders.find((x) => x.id === orderId);
  const r = await api('/api/split', 'POST', { total_cents: o.total_cents, parts: Number($('#split_n').value) });
  $('#split_out').textContent = 'Cada parte: ' + r.parts.map(money).join(' • ');
}

// ---------- Estoque ----------
async function viewEstoque() {
  const { items, low } = await api('/api/stock');
  const menu = await api('/api/menu');
  $('#main').innerHTML = `<h2>Estoque</h2>
  ${low.length ? `<div class="card" style="border-color:var(--amber)"><b>⚠ ${low.length} insumo(s) no mínimo ou abaixo:</b> ${low.map((s) => `${esc(s.name)} (${s.quantity} ${esc(s.unit)})`).join(', ')}</div>` : ''}
  <div class="card"><button class="primary" onclick="stockForm()">+ Novo insumo</button></div>
  <div class="grid">${items.map((s) => `<div class="card" style="${s.quantity <= s.min_quantity ? 'border-color:var(--amber)' : ''}">
    <h3>${esc(s.name)}</h3><p><b>${s.quantity} ${esc(s.unit)}</b> • Mínimo: ${s.min_quantity} ${esc(s.unit)}</p>
    ${s.quantity <= s.min_quantity ? '<span class="badge warn">Estoque baixo</span>' : ''}
    <div class="row" style="margin-top:8px"><button onclick="stockForm(${s.id})">Editar / mínimo</button>
    <button onclick="stockAdjust(${s.id},1)">+1</button><button onclick="stockAdjust(${s.id},-1)">−1</button></div>
    <label>Vincular ao item do cardápio (baixa automática)</label>
    <select onchange="linkStock(${s.id},this.value)"><option value="">—</option>${menu.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
  </div>`).join('') || '<p>Nenhum insumo.</p>'}</div>`;
  window._stock = items;
}
function stockForm(id) {
  const s = id ? window._stock.find((x) => x.id === id) : null;
  modal(`<h3>${s ? 'Editar insumo' : 'Novo insumo'}</h3>
    <label>Nome</label><input id="s_name" value="${esc(s?.name || '')}">
    <div class="row"><div><label>Quantidade</label><input id="s_qty" type="number" step="0.01" value="${s?.quantity ?? 0}"></div>
    <div><label>Unidade</label><input id="s_unit" value="${esc(s?.unit || 'un')}"></div>
    <div><label>Quantidade mínima (alerta)</label><input id="s_min" type="number" step="0.01" value="${s?.min_quantity ?? 0}"></div></div>
    <p id="s_err" class="err"></p>
    <div class="row"><button onclick="closeModal()">Cancelar</button><button class="primary" onclick="saveStock(${id || 0})">Salvar</button></div>`);
}
async function saveStock(id) {
  try {
    const body = { name: $('#s_name').value.trim(), quantity: parseFloat($('#s_qty').value || 0), unit: $('#s_unit').value.trim() || 'un', min_quantity: parseFloat($('#s_min').value || 0) };
    if (id) await api('/api/stock/' + id, 'PATCH', body); else await api('/api/stock', 'POST', body);
    closeModal(); viewEstoque();
  } catch (e) { $('#s_err').textContent = e.message; }
}
async function stockAdjust(id, delta) {
  const s = window._stock.find((x) => x.id === id);
  await api('/api/stock/' + id, 'PATCH', { quantity: s.quantity + delta });
  viewEstoque();
}
async function linkStock(stockId, menuId) {
  if (!menuId) return;
  const qty = parseFloat(prompt('Quantas unidades deste insumo cada unidade do item consome? Ex.: 0.2', '1') || '1');
  await api('/api/menu-stock', 'POST', { menu_item_id: Number(menuId), stock_item_id: stockId, qty_per_unit: qty });
  alert('Vínculo salvo. A baixa acontece automaticamente ao entregar o pedido.');
}

// ---------- Entregas ----------
async function viewEntregas() {
  const [deliveries, drivers, orders] = await Promise.all([api('/api/deliveries'), api('/api/drivers'), api('/api/orders')]);
  const openOrders = orders.filter((o) => ['Delivery', 'Mesa'].includes(o.origin) && !['entregue', 'cancelado'].includes(o.status));
  $('#main').innerHTML = `<h2>Entregas próprias</h2>
  <div class="card"><h3>Nova entrega</h3>
    <div class="row"><div><label>Pedido</label><select id="d_order">${openOrders.map((o) => `<option value="${o.id}">${esc(o.code)} — ${esc(o.customer_name || 'sem nome')}</option>`).join('') || '<option value="">Nenhum pedido disponível</option>'}</select></div>
    <div><label>Entregador</label><select id="d_driver"><option value="">Sem entregador</option>${drivers.map((d) => `<option value="${d.id}">${esc(d.username)}</option>`).join('')}</select></div></div>
    <button class="primary" onclick="createDelivery()">Criar entrega</button></div>
  ${deliveries.map((d) => {
    const next = { 'em preparo': 'pronto', pronto: 'em rota', 'em rota': 'entregue' }[d.status];
    return `<div class="card"><b>Entrega #${d.id}</b> — pedido ${esc(d.order_code)} — <span class="badge">${esc(d.status)}</span> — entregador: ${esc(d.driver_name || '—')}
    <br><small>Destino: ${esc(d.dest_name || '—')}</small>
    <div class="row" style="margin-top:8px">
      ${next ? `<button class="primary" onclick="advanceDelivery(${d.id},'${next}')">Avançar para ${next}</button>` : ''}
      <button onclick="shareLocation(${d.id})">📍 Compartilhar minha localização (GPS)</button>
      <button onclick="showTrack('${esc(d.order_code)}')">Ver rastreio do cliente</button>
    </div></div>`;
  }).join('') || '<p>Nenhuma entrega.</p>'}`;
}
async function createDelivery() {
  const orderId = $('#d_order').value;
  if (!orderId) { alert('Escolha um pedido.'); return; }
  try { await api('/api/deliveries', 'POST', { order_id: Number(orderId), driver_id: $('#d_driver').value ? Number($('#d_driver').value) : null }); viewEntregas(); }
  catch (e) { alert(e.message); }
}
async function advanceDelivery(id, status) {
  try { await api('/api/deliveries/' + id + '/status', 'POST', { status }); viewEntregas(); }
  catch (e) { alert(e.message); }
}
function shareLocation(id) {
  if (!navigator.geolocation) { alert('GPS indisponível neste dispositivo.'); return; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    await api('/api/deliveries/' + id + '/location', 'POST', { lat: pos.coords.latitude, lng: pos.coords.longitude });
    alert('Localização compartilhada.');
  }, () => alert('Permissão de localização negada.'));
}
function showTrack(code) {
  modal(`<h3>Rastreio — ${esc(code)}</h3><div id="trackMap" style="height:300px;border-radius:10px"></div><p id="trackInfo"></p>`);
  loadTracking(code);
}
async function loadTracking(code) {
  try {
    const { order, delivery } = await api('/api/public/tracking/' + code, 'GET', null, true);
    $('#trackInfo').innerHTML = `Status: <b>${esc(order.status)}</b>${delivery ? ` • Entrega: ${esc(delivery.status)}` : ''}`;
    const mapEl = $('#trackMap');
    if (!mapEl) return;
    // Fortaleza como referência; rota simulada restaurante -> cliente.
    const origin = [-3.7319, -38.5267];
    const dest = [-3.7619, -38.5067];
    const map = L.map(mapEl).setView(origin, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    const line = L.polyline([origin, dest], { color: '#ff6a00', weight: 4 }).addTo(map);
    L.marker(origin).addTo(map).bindPopup('Restaurante');
    L.marker(dest).addTo(map).bindPopup('Cliente');
    let pos = delivery && delivery.driver_lat ? [delivery.driver_lat, delivery.driver_lng] : origin;
    const bike = L.marker(pos).addTo(map).bindPopup('Entregador');
    if (delivery && delivery.status === 'em rota' && !delivery.driver_lat) {
      // Animação simulada ao longo da rota quando não há GPS real.
      let t = 0;
      setInterval(() => {
        t = (t + 0.02) % 1;
        bike.setLatLng([origin[0] + (dest[0] - origin[0]) * t, origin[1] + (dest[1] - origin[1]) * t]);
      }, 1000);
    }
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
  } catch (e) { const el = $('#trackInfo'); if (el) el.textContent = e.message; }
}

// ---------- Relatórios ----------
async function viewRelatorios() {
  const menu = await api('/api/menu');
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  $('#main').innerHTML = `<h2>Relatórios — curva de vendas</h2>
  <div class="card"><div class="row">
    <div><label>De</label><input id="r_from" type="date" value="${from}"></div>
    <div><label>Até</label><input id="r_to" type="date" value="${to}"></div>
    <div><label>Produto (curva individual)</label><select id="r_product"><option value="">Todos os produtos</option>${menu.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
  </div><button class="primary" onclick="loadReport()">Atualizar</button></div>
  <div id="r_out"></div>`;
  loadReport();
}
async function loadReport() {
  const from = $('#r_from').value, to = $('#r_to').value, pid = $('#r_product').value;
  const r = await api(`/api/reports/sales?from=${from}&to=${to}${pid ? '&product_id=' + pid : ''}`);
  const maxRev = Math.max(1, ...r.series.map((s) => s.revenue_cents));
  $('#r_out').innerHTML = `<div class="card"><h3>Curva de vendas (${from} → ${to})</h3>
    ${r.series.length ? r.series.map((s) => `<div class="bar-row"><span style="width:90px">${s.day}</span><div class="bar" style="width:${Math.round(s.revenue_cents / maxRev * 100)}%"></div><span>${money(s.revenue_cents)} • ${s.units} un.</span></div>`).join('') : '<p>Sem vendas entregues neste período.</p>'}</div>
  <div class="card"><h3>Produtos mais vendidos no período</h3>
    ${r.ranking.map((x, i) => `<p><b>${i + 1}.</b> ${esc(x.name)} — ${x.qty} un. — ${money(x.revenue_cents)}</p>`).join('') || '<p>Sem dados.</p>'}</div>`;
}

// ---------- Acessos ----------
async function viewAcessos() {
  let users = [];
  try { users = await api('/api/users'); } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  $('#main').innerHTML = `<h2>Acessos</h2><p style="color:var(--muted)">Só o dono gerencia usuários. Cada perfil vê apenas os módulos permitidos.</p>
  <div class="card"><div class="row">
    <div><label>Usuário</label><input id="u_name"></div>
    <div><label>Senha</label><input id="u_pass" type="password"></div>
    <div><label>Perfil</label><select id="u_role"><option value="gerente">Gerente</option><option value="caixa">Caixa</option><option value="cozinha">Cozinha</option><option value="entregador">Entregador</option><option value="atendente">Atendente</option></select></div>
  </div><button class="primary" onclick="createUser()">Criar usuário</button><p id="u_msg"></p></div>
  ${users.map((u) => `<div class="card"><b>${esc(u.username)}</b> — ${esc(u.role)} — ${u.active ? '<span class="badge ok">Ativo</span>' : '<span class="badge warn">Inativo</span>'}
    <button onclick="toggleUser(${u.id},${u.active ? 0 : 1})">${u.active ? 'Desativar' : 'Ativar'}</button></div>`).join('')}`;
}
async function createUser() {
  try { await api('/api/users', 'POST', { username: $('#u_name').value.trim(), password: $('#u_pass').value, role: $('#u_role').value }); viewAcessos(); }
  catch (e) { $('#u_msg').textContent = e.message; }
}
async function toggleUser(id, active) { await api('/api/users/' + id, 'PATCH', { active: active === 1 }); viewAcessos(); }

// ---------- Área do cliente (pública, sem login) ----------
let cart = [];
async function viewClient() {
  show('clientView');
  const params = new URLSearchParams(location.search);
  const mesa = params.get('mesa');
  const menu = await api('/api/public/menu', 'GET', null, true);
  const cats = [...new Set(menu.map((m) => m.category))];
  $('#clientMain').innerHTML = `
    <h2>Cardápio</h2>
    ${mesa ? `<p><span class="badge ok">Mesa ${esc(mesa)} identificada pelo QR Code</span></p>` : '<p style="color:var(--muted)">Pedido para delivery — informe endereço no checkout.</p>'}
    <div style="margin-bottom:12px">${['Todas', ...cats].map((c) => `<button onclick="window._cat='${c}';viewClient()">${c}</button>`).join(' ')}</div>
    <div class="grid">${menu.filter((m) => !window._cat || window._cat === 'Todas' || m.category === window._cat).map((m) => `<div class="card">
      ${m.photo ? `<img class="item-photo" src="${esc(m.photo)}">` : ''}
      <h3>${esc(m.name)}</h3><p>${money(m.price_cents)}</p>
      <input placeholder="Obs. (ex.: sem cebola)" id="notes-${m.id}">
      <button class="primary" style="margin-top:8px" onclick="addToCart(${m.id})">Adicionar</button></div>`).join('')}</div>
    <div class="card"><h3>Seu pedido</h3><div id="cartBox"></div>
      <label>Nome</label><input id="c_name"><label>Telefone</label><input id="c_phone">
      ${mesa ? '' : '<label>Endereço de entrega</label><input id="c_addr">'}
      <label>Observação geral</label><textarea id="c_notes" rows="2"></textarea>
      <button class="primary" onclick="checkoutClient(${mesa ? Number(mesa) : null})">Enviar pedido</button><p id="c_msg"></p></div>
    <div class="card"><h3>Acompanhar pedido</h3>
      <label>Código do pedido</label><input id="t_code" placeholder="Ex.: LUME-20251105-0001">
      <button onclick="trackClient()">Acompanhar</button><div id="t_out" style="margin-top:10px"></div></div>`;
  window._menuClient = menu;
  renderCart();
}
function addToCart(id) {
  const m = window._menuClient.find((x) => x.id === id);
  const notes = ($('#notes-' + id)?.value || '').trim();
  const existing = cart.find((c) => c.menu_item_id === id && c.notes === notes);
  if (existing) existing.quantity++;
  else cart.push({ menu_item_id: id, name: m.name, price_cents: m.price_cents, quantity: 1, notes });
  renderCart();
}
function renderCart() {
  const box = $('#cartBox');
  if (!box) return;
  const total = cart.reduce((s, c) => s + c.price_cents * c.quantity, 0);
  box.innerHTML = cart.length ? cart.map((c, i) => `<p>${c.quantity}x ${esc(c.name)} — ${money(c.price_cents * c.quantity)}${c.notes ? ` <em>(${esc(c.notes)})</em>` : ''} <button onclick="cart.splice(${i},1);renderCart()">×</button></p>`).join('') + `<p><b>Total: ${money(total)}</b></p>` : '<p>Carrinho vazio.</p>';
}
async function checkoutClient(mesa) {
  if (!cart.length) { $('#c_msg').textContent = 'Adicione itens ao pedido.'; return; }
  try {
    const o = await api('/api/public/orders', 'POST', {
      table_number: mesa || null,
      items: cart, notes: $('#c_notes').value.trim(),
      customer_name: $('#c_name').value.trim(), customer_phone: $('#c_phone').value.trim(),
      address: mesa ? '' : ($('#c_addr')?.value.trim() || ''),
    }, true);
    cart = []; renderCart();
    $('#c_msg').innerHTML = `<span class="ok">Pedido enviado! Código: <b>${esc(o.code)}</b> — guarde para acompanhar.</span>`;
  } catch (e) { $('#c_msg').textContent = e.message; }
}
async function trackClient() {
  const code = $('#t_code').value.trim();
  if (!code) return;
  try {
    const { order, delivery } = await api('/api/public/tracking/' + code, 'GET', null, true);
    $('#t_out').innerHTML = `<p>Pedido <b>${esc(order.code)}</b> — status: <b>${esc(order.status)}</b></p>
      ${delivery ? `<p>Entrega: ${esc(delivery.status)}</p><div id="trackMap" style="height:280px;border-radius:10px"></div><p id="trackInfo"></p>` : ''}`;
    if (delivery) setTimeout(() => loadTracking(code).catch(() => {}), 50);
  } catch (e) { $('#t_out').textContent = e.message; }
}

// ---------- Init ----------
(function init() {
  const params = new URLSearchParams(location.search);
  if (params.get('cliente') === '1' || params.get('mesa')) { viewClient(); return; }
  if (token) initStaff(); else show('loginView');
  const u = $('#loginUser'), p = $('#loginPass');
  if (p) p.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
})();
