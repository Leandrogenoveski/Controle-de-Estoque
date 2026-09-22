(function () {
  const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const CAT_ORDER = ['Alimento', 'Higiene', 'Limpeza'];
  const CAT_CLASS = { Alimento: 'alimento', Higiene: 'higiene', Limpeza: 'limpeza' };
  const ROLE_LABEL = { ADM: 'ADM', GESTOR: 'Gestor', TECNICO: 'Técnico' };

  const state = {
    me: null,           // { id, username, name, role }
    permissions: null,  // { viewAll, editParams, inputStock, manageCatalog, manageUsers }
    units: [],
    unit: null,
    page: 'dashboard',
    products: [],
    counts: {},
    month: currentMonthStr(),
    search: '',
    category: 'all',
    stateFilter: 'all',
    sortBy: 'code',
    openHistory: {},
    activity: [],
    users: [],
    collapsedCats: {},
    poRows: [],
    poSkipped: [],
  };

  function api(path, opts) {
    opts = opts || {};
    return fetch('/api' + path, Object.assign({
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      credentials: 'same-origin',
    }, opts, opts.body ? { body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body) } : {}))
      .then(async function (r) {
        let data = null;
        try { data = await r.json(); } catch (e) { data = null; }
        if (!r.ok) {
          const err = new Error((data && data.message) || (data && data.error) || ('HTTP ' + r.status));
          err.code = data && data.error;
          err.status = r.status;
          err.data = data;
          throw err;
        }
        return data;
      });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }
  function currentMonthStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function monthLabel(m) {
    const parts = m.split('-');
    return MONTH_NAMES[parseInt(parts[1], 10) - 1] + ' de ' + parts[0];
  }
  function monthShort(m) {
    const parts = m.split('-');
    return MONTH_NAMES[parseInt(parts[1], 10) - 1].slice(0, 3) + '/' + parts[0].slice(2);
  }
  // Meses disponíveis no seletor: do mês atual até dezembro do mesmo ano
  // (sem meses anteriores, já que não há dados neles).
  function monthsThroughDecember() {
    const out = [];
    const now = new Date();
    for (let m = now.getMonth(); m <= 11; m++) out.push(currentMonthStr(new Date(now.getFullYear(), m, 1)));
    return out;
  }
  function unitLabel(unitId) {
    const u = state.units.find(function (x) { return x.id === unitId; });
    return u ? u.label : unitId;
  }
  function loadCollapsedCats() {
    try { const raw = localStorage.getItem('estoqueWapCollapsedCats'); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function saveCollapsedCats() {
    try { localStorage.setItem('estoqueWapCollapsedCats', JSON.stringify(state.collapsedCats)); } catch (e) {}
  }
  function toggleCategory(cat) {
    state.collapsedCats[cat] = !state.collapsedCats[cat];
    saveCollapsedCats();
    render();
  }
  function loadUnit() {
    try { return localStorage.getItem('estoqueWapUnit') || null; } catch (e) { return null; }
  }
  function saveUnit(unitId) {
    try { localStorage.setItem('estoqueWapUnit', unitId); } catch (e) {}
  }

  // ==================== AUTH / BOOTSTRAP ====================

  async function boot() {
    state.collapsedCats = loadCollapsedCats();
    // Sem tela de login: o backend libera acesso completo a quem abrir o
    // link, então /me sempre resolve e entramos direto no aplicativo.
    try {
      const me = await api('/me');
      await enterApp(me);
    } catch (e) {
      console.error('Falha ao iniciar o aplicativo:', e);
    }
  }

  async function enterApp(me) {
    state.me = me.user;
    state.permissions = me.permissions;
    document.getElementById('appShell').hidden = false;
    renderUserChip();
    applyPermissionsToUI();
    await loadUnitsAndInit();
  }

  function renderUserChip() {
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRolePill');
    const slot = document.getElementById('userAvatarSlot');
    nameEl.textContent = state.me.name || state.me.username;
    roleEl.textContent = ROLE_LABEL[state.me.role] || state.me.role;
    roleEl.className = 'role-pill ' + state.me.role;
    slot.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'user-avatar-fallback';
    span.textContent = (state.me.name || state.me.username || '?').charAt(0).toUpperCase();
    slot.appendChild(span);
  }

  function applyPermissionsToUI() {
    const p = state.permissions;
    document.getElementById('addItemBtn').hidden = !p.manageCatalog;
    document.getElementById('navUsuariosBtn').hidden = !p.manageUsers;
    document.getElementById('newUserBtn').hidden = !p.manageUsers;
  }

  // ==================== NAV / PAGES ====================

  function showPage(page) {
    if (page === 'usuarios' && !state.permissions.manageUsers) page = 'dashboard';
    state.page = page;
    document.getElementById('page-dashboard').hidden = page !== 'dashboard';
    document.getElementById('page-estoque').hidden = page !== 'estoque';
    document.getElementById('page-usuarios').hidden = page !== 'usuarios';
    document.querySelectorAll('.nav-item[data-page]').forEach(function (btn) {
      if (btn.dataset.page === page) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    if (page === 'dashboard') renderDashboard();
    if (page === 'usuarios') loadUsers();
  }

  function goToEstoque(opts) {
    opts = opts || {};
    if (opts.category !== undefined) {
      state.category = opts.category;
      const sel = document.getElementById('categorySelect');
      if (sel) sel.value = opts.category;
    }
    if (opts.stateFilter !== undefined) state.stateFilter = opts.stateFilter;
    showPage('estoque');
    render();
  }

  // ==================== BOOTSTRAP DATA ====================

  async function loadUnitsAndInit() {
    state.units = await api('/units');
    const unitSel = document.getElementById('unitSelect');
    unitSel.innerHTML = state.units.map(function (u) {
      return '<option value="' + u.id + '">' + escapeHtml(u.label) + '</option>';
    }).join('');
    const saved = loadUnit();
    state.unit = (saved && state.units.some(function (u) { return u.id === saved; })) ? saved : state.units[0].id;
    unitSel.value = state.unit;
    unitSel.addEventListener('change', function (e) { switchUnit(e.target.value); });

    populateMonthSelect();
    document.getElementById('monthSelect').value = state.month;
    document.getElementById('monthSelect').addEventListener('change', function (e) {
      state.month = e.target.value;
      state.openHistory = {};
      refreshAll();
    });

    wireStaticControls();
    await refreshAll();
  }

  function populateMonthSelect() {
    const sel = document.getElementById('monthSelect');
    sel.innerHTML = monthsThroughDecember().map(function (m) {
      return '<option value="' + m + '">' + monthLabel(m) + '</option>';
    }).join('');
  }

  function switchUnit(unitId) {
    if (unitId === state.unit) return;
    state.unit = unitId;
    saveUnit(unitId);
    state.openHistory = {};
    refreshAll();
  }

  async function refreshAll() {
    const unit = state.unit, month = state.month;
    const [products, counts, activity] = await Promise.all([
      api('/products?unit=' + encodeURIComponent(unit)),
      api('/counts?unit=' + encodeURIComponent(unit) + '&month=' + encodeURIComponent(month)),
      api('/activity?unit=' + encodeURIComponent(unit) + '&limit=8'),
    ]);
    if (state.unit !== unit || state.month !== month) return; // a newer refresh already landed
    state.products = products;
    state.counts = counts;
    state.activity = activity;
    populateCategorySelect();
    render();
  }

  function populateCategorySelect() {
    const cats = Array.from(new Set(state.products.map(function (p) { return p.category; }))).filter(Boolean);
    cats.sort(function (a, b) {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const sel = document.getElementById('categorySelect');
    const current = sel.value || 'all';
    sel.innerHTML = '<option value="all">Todas as categorias</option>' + cats.map(function (c) {
      return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
    }).join('');
    sel.value = current;
  }

  // ==================== STATIC CONTROL WIRING ====================

  function wireStaticControls() {
    document.querySelectorAll('.nav-item[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () { showPage(btn.dataset.page); });
    });
    document.getElementById('navPoBtn').addEventListener('click', openPurchaseOrder);

    document.getElementById('searchInput').addEventListener('input', function (e) {
      state.search = e.target.value.trim().toLowerCase();
      if (state.search && state.page !== 'estoque') showPage('estoque');
      render();
    });
    document.getElementById('categorySelect').addEventListener('change', function (e) {
      state.category = e.target.value;
      render();
    });
    document.getElementById('stateFilter').addEventListener('change', function (e) {
      state.stateFilter = e.target.value;
      render();
    });
    document.getElementById('sortSelect').addEventListener('change', function (e) {
      state.sortBy = e.target.value;
      render();
    });

    const kpisEl = document.getElementById('kpis');
    kpisEl.addEventListener('click', function (e) {
      const tile = e.target.closest('[data-filter]');
      if (tile) { state.stateFilter = tile.dataset.filter; render(); }
    });
    kpisEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tile = e.target.closest('[data-filter]');
      if (tile) { e.preventDefault(); state.stateFilter = tile.dataset.filter; render(); }
    });

    document.getElementById('poBtn').addEventListener('click', openPurchaseOrder);
    document.getElementById('poCloseBtn').addEventListener('click', closePurchaseOrder);
    document.getElementById('poOverlay').addEventListener('click', function (e) { if (e.target === this) closePurchaseOrder(); });
    document.getElementById('poCopyBtn').addEventListener('click', copyPurchaseOrderText);
    document.getElementById('poCsvBtn').addEventListener('click', downloadPurchaseOrderCsv);

    document.getElementById('addItemBtn').addEventListener('click', openItemForm);
    document.getElementById('itemCloseBtn').addEventListener('click', closeItemForm);
    document.getElementById('itemCancelBtn').addEventListener('click', closeItemForm);
    document.getElementById('itemOverlay').addEventListener('click', function (e) { if (e.target === this) closeItemForm(); });
    document.getElementById('itemForm').addEventListener('submit', function (e) { e.preventDefault(); submitNewItem(); });

    document.getElementById('newUserBtn').addEventListener('click', openUserForm);
    document.getElementById('userCloseBtn').addEventListener('click', closeUserForm);
    document.getElementById('userCancelBtn').addEventListener('click', closeUserForm);
    document.getElementById('userOverlay').addEventListener('click', function (e) { if (e.target === this) closeUserForm(); });
    document.getElementById('userForm').addEventListener('submit', function (e) { e.preventDefault(); submitNewUser(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closePurchaseOrder(); closeItemForm(); closeUserForm(); }
    });

    const dashKpis = document.getElementById('dashKpis');
    dashKpis.addEventListener('click', function (e) {
      const tile = e.target.closest('[data-filter]');
      if (tile) goToEstoque({ stateFilter: tile.dataset.filter });
    });
    document.getElementById('dashCategories').addEventListener('click', function (e) {
      const card = e.target.closest('[data-cat]');
      if (card) goToEstoque({ category: card.dataset.cat, stateFilter: 'all' });
    });
    const criticalLink = document.getElementById('dashCriticalLink');
    criticalLink.addEventListener('click', function () { goToEstoque({ stateFilter: 'critical' }); });
    criticalLink.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToEstoque({ stateFilter: 'critical' }); }
    });

    const sectionsEl = document.getElementById('sections');
    sectionsEl.addEventListener('change', function (e) {
      const el = e.target;
      if (!el || !el.dataset) return;
      if (el.dataset.role === 'minstock') onMinStockInput(el.dataset.code, el.value);
      else if (el.dataset.role === 'consumption') onAvgConsumptionInput(el.dataset.code, el.value);
      else if (el.dataset.role === 'qty') onQtyInput(el.dataset.code, el.value);
    });
    sectionsEl.addEventListener('click', function (e) {
      const histBtn = e.target.closest('[data-role="history"]');
      if (histBtn) { toggleHistory(histBtn.dataset.code); return; }
      const head = e.target.closest('[data-role="toggle-cat"]');
      if (head) { toggleCategory(head.dataset.cat); return; }
    });
    sectionsEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const head = e.target.closest('[data-role="toggle-cat"]');
      if (head) { e.preventDefault(); toggleCategory(head.dataset.cat); }
    });

    const usersBody = document.getElementById('usersTableBody');
    usersBody.addEventListener('change', function (e) {
      if (e.target.dataset.role === 'user-role') changeUserRole(e.target.dataset.id, e.target.value);
    });
    usersBody.addEventListener('click', function (e) {
      const resetBtn = e.target.closest('[data-role="reset-pw"]');
      if (resetBtn) { resetUserPassword(resetBtn.dataset.id); return; }
      const toggleBtn = e.target.closest('[data-role="toggle-active"]');
      if (toggleBtn) { toggleUserActive(toggleBtn.dataset.id, toggleBtn.dataset.active === '1'); return; }
    });
  }

  // ==================== PARAM / QTY EDITS ====================

  const minStockTimers = {};
  function onMinStockInput(code, value) {
    clearTimeout(minStockTimers[code]);
    const unit = state.unit;
    minStockTimers[code] = setTimeout(function () {
      const n = value === '' ? 0 : parseFloat(value);
      if (isNaN(n)) return;
      api('/products/' + encodeURIComponent(unit) + '/' + encodeURIComponent(code), { method: 'PATCH', body: { minStock: n } })
        .then(function () { if (state.unit === unit) refreshAll(); })
        .catch(function (e) { console.error(e); });
    }, 500);
  }

  const avgConsumptionTimers = {};
  function onAvgConsumptionInput(code, value) {
    clearTimeout(avgConsumptionTimers[code]);
    const unit = state.unit;
    avgConsumptionTimers[code] = setTimeout(function () {
      const n = value === '' ? 0 : parseFloat(value);
      if (isNaN(n)) return;
      api('/products/' + encodeURIComponent(unit) + '/' + encodeURIComponent(code), { method: 'PATCH', body: { avgConsumption: n } })
        .then(function () { if (state.unit === unit) refreshAll(); })
        .catch(function (e) { console.error(e); });
    }, 500);
  }

  const qtyTimers = {};
  function onQtyInput(code, value) {
    clearTimeout(qtyTimers[code]);
    const unit = state.unit, month = state.month;
    qtyTimers[code] = setTimeout(function () {
      const n = value === '' ? null : parseFloat(value);
      if (value !== '' && isNaN(n)) return;
      api('/counts/' + encodeURIComponent(unit) + '/' + encodeURIComponent(code) + '/' + encodeURIComponent(month), { method: 'PUT', body: { qty: n } })
        .then(function () { if (state.unit === unit && state.month === month) refreshAll(); })
        .catch(function (e) { console.error(e); });
    }, 500);
  }

  async function toggleHistory(code) {
    if (state.openHistory.hasOwnProperty(code)) { delete state.openHistory[code]; render(); return; }
    state.openHistory[code] = 'loading';
    render();
    const unit = state.unit;
    try {
      const rows = await api('/counts/history?unit=' + encodeURIComponent(unit) + '&code=' + encodeURIComponent(code) + '&limit=7');
      if (state.unit !== unit) return;
      state.openHistory[code] = rows.filter(function (r) { return r.month !== state.month; }).slice(0, 6);
    } catch (e) {
      console.error(e);
      if (state.unit === unit) state.openHistory[code] = [];
    }
    render();
  }

  // ==================== NEW ITEM ====================

  function openItemForm() {
    const form = document.getElementById('itemForm');
    form.reset();
    document.getElementById('itemMinStock').value = 0;
    document.getElementById('itemAvgConsumption').value = 0;
    const errorEl = document.getElementById('itemError');
    errorEl.hidden = true; errorEl.textContent = '';
    document.getElementById('itemFeedback').textContent = '';
    document.getElementById('itemSub').textContent = unitLabel(state.unit);
    populateCategoryDatalist();
    document.getElementById('itemOverlay').hidden = false;
    setTimeout(function () { document.getElementById('itemCode').focus(); }, 0);
  }
  function closeItemForm() { document.getElementById('itemOverlay').hidden = true; }
  function populateCategoryDatalist() {
    const cats = Array.from(new Set(CAT_ORDER.concat(state.products.map(function (p) { return p.category; })))).filter(Boolean);
    document.getElementById('categoryList').innerHTML = cats.map(function (c) { return '<option value="' + escapeHtml(c) + '"></option>'; }).join('');
  }
  function showItemError(msg) {
    const el = document.getElementById('itemError');
    el.textContent = msg; el.hidden = false;
  }

  async function submitNewItem() {
    const errorEl = document.getElementById('itemError');
    errorEl.hidden = true; errorEl.textContent = '';
    const rawCode = document.getElementById('itemCode').value.trim().toUpperCase();
    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value.trim();
    const unitField = document.getElementById('itemUnit').value.trim();
    const minStock = parseFloat(document.getElementById('itemMinStock').value);
    const avgConsumption = parseFloat(document.getElementById('itemAvgConsumption').value);
    if (!rawCode) { showItemError('Informe o código do produto.'); return; }
    if (!/^[A-Za-z0-9_\-.~:@+]+$/.test(rawCode)) { showItemError('O código só pode ter letras, números e os símbolos _ - . ~ : @ +, sem espaços.'); return; }
    if (!name) { showItemError('Informe a descrição do item.'); return; }
    if (!category) { showItemError('Informe a categoria.'); return; }
    if (isNaN(minStock) || minStock < 0) { showItemError('Estoque de segurança inválido.'); return; }
    if (isNaN(avgConsumption) || avgConsumption < 0) { showItemError('Consumo médio mensal inválido.'); return; }

    const saveBtn = document.getElementById('itemSaveBtn');
    saveBtn.disabled = true;
    document.getElementById('itemFeedback').textContent = 'Salvando…';
    const unitAtSubmit = state.unit;
    try {
      await api('/products', { method: 'POST', body: { unit: unitAtSubmit, code: rawCode, name: name, category: category, unitLabel: unitField, minStock: minStock, avgConsumption: avgConsumption } });
      if (state.unit === unitAtSubmit) { document.getElementById('itemFeedback').textContent = ''; closeItemForm(); refreshAll(); }
    } catch (e) {
      document.getElementById('itemFeedback').textContent = '';
      showItemError(e.message || 'Não foi possível salvar o item agora.');
    } finally {
      saveBtn.disabled = false;
    }
  }

  // ==================== PURCHASE ORDER ====================

  async function openPurchaseOrder() {
    document.getElementById('poFeedback').textContent = '';
    document.getElementById('poBody').innerHTML = '<div class="po-empty">Calculando…</div>';
    document.getElementById('poOverlay').hidden = false;
    try {
      const result = await api('/purchase-order?unit=' + encodeURIComponent(state.unit) + '&month=' + encodeURIComponent(state.month));
      state.poRows = result.rows; state.poSkipped = result.skipped;
      renderPurchaseOrderModal();
    } catch (e) {
      document.getElementById('poBody').innerHTML = '<div class="po-empty">Não foi possível calcular o pedido agora.</div>';
    }
  }
  function closePurchaseOrder() { document.getElementById('poOverlay').hidden = true; }

  function renderPurchaseOrderModal() {
    const rows = state.poRows || [], skipped = state.poSkipped || [];
    document.getElementById('poSub').textContent = unitLabel(state.unit) + ' · baseado na contagem de ' + monthLabel(state.month) + ' · itens abaixo do estoque de segurança';
    document.getElementById('poTotal').textContent = rows.length + (rows.length === 1 ? ' item para pedir' : ' itens para pedir');
    const body = document.getElementById('poBody');
    if (!rows.length) {
      body.innerHTML = '<div class="po-empty">Nenhum item abaixo do estoque de segurança em ' + monthLabel(state.month) + '.</div>';
      document.getElementById('poCsvBtn').disabled = true; document.getElementById('poCopyBtn').disabled = true;
      return;
    }
    document.getElementById('poCsvBtn').disabled = false; document.getElementById('poCopyBtn').disabled = false;
    const byCat = {};
    rows.forEach(function (r) { (byCat[r.category] = byCat[r.category] || []).push(r); });
    const cats = Object.keys(byCat).sort(function (a, b) {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    let html = '';
    cats.forEach(function (cat) {
      html += '<div class="po-cat">' + escapeHtml(cat) + '</div>';
      html += '<div class="po-table-wrap"><table class="po-table"><thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Atual</th><th>Segurança</th><th>Pedir</th></tr></thead><tbody>';
      byCat[cat].forEach(function (r) {
        html += '<tr><td class="mono">' + escapeHtml(r.code) + '</td><td class="desc">' + escapeHtml(r.name) + '</td><td>' + escapeHtml(r.unit) + '</td>' +
          '<td class="num mono">' + r.qty + '</td><td class="num mono">' + r.min + '</td><td class="num mono po-order-qty">' + r.order + '</td></tr>';
      });
      html += '</tbody></table></div>';
    });
    if (skipped.length) {
      html += '<div class="po-skipped">Sem contagem em ' + monthLabel(state.month) + ': ' + skipped.map(function (p) { return escapeHtml(p.code); }).join(', ') + '.</div>';
    }
    body.innerHTML = html;
  }

  function copyPurchaseOrderText() {
    const rows = state.poRows || [];
    if (!rows.length) return;
    const lines = ['Pedido de compra — ' + unitLabel(state.unit) + ' — ' + monthLabel(state.month)];
    let currentCat = null;
    rows.forEach(function (r) {
      if (r.category !== currentCat) { currentCat = r.category; lines.push(''); lines.push(currentCat + ':'); }
      lines.push('- ' + r.code + ' ' + r.name + ' (' + r.unit + '): pedir ' + r.order + ' (atual ' + r.qty + ', segurança ' + r.min + ')');
    });
    const text = lines.join('\n');
    const feedback = document.getElementById('poFeedback');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        feedback.textContent = 'Copiado!';
        setTimeout(function () { feedback.textContent = ''; }, 2500);
      }).catch(function () { feedback.textContent = 'Não foi possível copiar.'; });
    }
  }

  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function downloadPurchaseOrderCsv() {
    const rows = state.poRows || [];
    if (!rows.length) return;
    const header = ['Codigo', 'Descricao', 'Categoria', 'Unidade', 'Estoque atual', 'Estoque de seguranca', 'Quantidade a pedir'];
    const lines = [header.join(';')];
    rows.forEach(function (r) { lines.push([csvEscape(r.code), csvEscape(r.name), csvEscape(r.category), csvEscape(r.unit), r.qty, r.min, r.order].join(';')); });
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pedido-compra-estoque-wap-' + state.unit.toLowerCase() + '-' + state.month + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    const feedback = document.getElementById('poFeedback');
    feedback.textContent = 'Arquivo baixado.';
    setTimeout(function () { feedback.textContent = ''; }, 2500);
  }

  // ==================== USERS (admin) ====================

  function openUserForm() {
    document.getElementById('userForm').reset();
    document.getElementById('userError').hidden = true;
    document.getElementById('userTempPasswordBox').hidden = true;
    document.getElementById('userFeedback').textContent = '';
    document.getElementById('userSaveBtn').hidden = false;
    document.getElementById('userOverlay').hidden = false;
    setTimeout(function () { document.getElementById('userName_').focus(); }, 0);
  }
  function closeUserForm() { document.getElementById('userOverlay').hidden = true; }

  async function submitNewUser() {
    const errorEl = document.getElementById('userError');
    errorEl.hidden = true;
    const name = document.getElementById('userName_').value.trim();
    const username = document.getElementById('userUsername').value.trim().toLowerCase();
    const role = document.getElementById('userRole').value;
    if (!name || !username) { errorEl.textContent = 'Preencha nome e usuário.'; errorEl.hidden = false; return; }
    const btn = document.getElementById('userSaveBtn');
    btn.disabled = true;
    try {
      const result = await api('/users', { method: 'POST', body: { name, username, role } });
      document.getElementById('userTempPasswordBox').hidden = false;
      document.getElementById('userTempPasswordValue').textContent = result.tempPassword;
      document.getElementById('userFeedback').textContent = 'Usuário criado.';
      btn.hidden = true;
      loadUsers();
    } catch (e) {
      errorEl.textContent = e.message || 'Não foi possível criar o usuário.';
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  async function loadUsers() {
    try {
      state.users = await api('/users');
      renderUsersTable();
    } catch (e) { console.error(e); }
  }

  function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = state.users.map(function (u) {
      const isMe = u.id === state.me.id;
      const roleControl = isMe
        ? '<span class="role-pill ' + u.role + '">' + ROLE_LABEL[u.role] + '</span>'
        : '<select class="role-select" data-role="user-role" data-id="' + u.id + '">' +
          ['TECNICO', 'GESTOR', 'ADM'].map(function (r) {
            return '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + ROLE_LABEL[r] + '</option>';
          }).join('') + '</select>';
      const statusPill = '<span class="status-pill ' + (u.active ? 'active' : 'inactive') + '">' + (u.active ? 'ativo' : 'inativo') + '</span>';
      const actions = [];
      actions.push('<button class="link-btn" type="button" data-role="reset-pw" data-id="' + u.id + '">redefinir senha</button>');
      if (!isMe) {
        actions.push('<button class="link-btn ' + (u.active ? 'danger' : '') + '" type="button" data-role="toggle-active" data-id="' + u.id + '" data-active="' + (u.active ? '1' : '0') + '">' + (u.active ? 'desativar' : 'reativar') + '</button>');
      }
      return '<tr><td>' + escapeHtml(u.name) + (isMe ? ' <span class="coverage muted">(você)</span>' : '') + '</td>' +
        '<td class="mono">' + escapeHtml(u.username) + '</td>' +
        '<td>' + roleControl + '</td>' +
        '<td>' + statusPill + '</td>' +
        '<td class="last-count">' + new Date(u.createdAt).toLocaleDateString('pt-BR') + '</td>' +
        '<td>' + actions.join(' · ') + '</td></tr>';
    }).join('');
  }

  async function changeUserRole(id, role) {
    try { await api('/users/' + id, { method: 'PATCH', body: { role } }); loadUsers(); }
    catch (e) { alert(e.message || 'Não foi possível alterar o papel.'); loadUsers(); }
  }
  async function toggleUserActive(id, currentlyActive) {
    try { await api('/users/' + id, { method: 'PATCH', body: { active: !currentlyActive } }); loadUsers(); }
    catch (e) { alert(e.message || 'Não foi possível atualizar o usuário.'); }
  }
  async function resetUserPassword(id) {
    try {
      const result = await api('/users/' + id + '/reset-password', { method: 'POST' });
      alert('Nova senha temporária: ' + result.tempPassword + '\n\nEnvie para a pessoa — ela precisará trocar no próximo acesso.');
    } catch (e) { alert(e.message || 'Não foi possível redefinir a senha.'); }
  }

  // ==================== DASHBOARD ====================

  function classifyProduct(p) {
    const c = state.counts[p.code];
    const min = p.minStock || 0;
    if (!c || c.qty == null) return 'warn';
    if (c.qty < min) return 'crit';
    if (p.avgConsumption > 0) {
      const cov = c.qty / p.avgConsumption;
      if (cov < 1) return 'crit';
      if (cov < 2) return 'warn';
    }
    return 'ok';
  }

  function computeDashboardMetrics() {
    const total = state.products.length;
    let counted = 0, belowMin = 0, criticalCoverage = 0, zeroCount = 0;
    let okCount = 0, warnCount = 0, critCount = 0, coverageSum = 0, coverageN = 0;
    const byCat = {};
    state.products.forEach(function (p) {
      const c = state.counts[p.code];
      const cat = p.category || 'Outro';
      if (!byCat[cat]) byCat[cat] = { total: 0, crit: 0 };
      byCat[cat].total++;
      const bucket = classifyProduct(p);
      if (bucket === 'ok') okCount++; else if (bucket === 'warn') warnCount++; else { critCount++; byCat[cat].crit++; }
      if (c && c.qty != null) {
        counted++;
        if (c.qty < (p.minStock || 0)) belowMin++;
        if (c.qty === 0) zeroCount++;
        if (p.avgConsumption > 0) {
          const cov = c.qty / p.avgConsumption;
          coverageSum += cov; coverageN++;
          if (cov < 1) criticalCoverage++;
        }
      }
    });
    return { total: total, counted: counted, pending: total - counted, belowMin: belowMin, criticalCoverage: criticalCoverage,
      zeroCount: zeroCount, ok: okCount, warn: warnCount, crit: critCount, avgCoverage: coverageN ? (coverageSum / coverageN) : null, byCat: byCat };
  }

  function renderDashboard() {
    const m = computeDashboardMetrics();
    document.getElementById('dashSubtitle').textContent = unitLabel(state.unit) + ' · referência: ' + monthLabel(state.month);
    renderDashboardKpis(m);
    renderStatusBar(m);
    renderCoverageCard(m);
    renderCategoryCards(m);
    renderCriticalTable(m);
    renderDonut(m);
    renderTopConsumption();
    renderActivityFeed();
  }

  function renderDashboardKpis(m) {
    const el = document.getElementById('dashKpis');
    el.innerHTML =
      '<div class="kpi" data-filter="all" role="button" tabindex="0"><div class="num mono">' + m.total + '</div><div class="label">Itens no catálogo</div></div>' +
      '<div class="kpi' + (m.belowMin > 0 ? ' warn' : '') + '" data-filter="critical" role="button" tabindex="0"><div class="num mono">' + m.belowMin + '</div><div class="label">Abaixo da segurança</div></div>' +
      '<div class="kpi' + (m.criticalCoverage > 0 ? ' warn' : '') + '" data-filter="coverage" role="button" tabindex="0"><div class="num mono">' + m.criticalCoverage + '</div><div class="label">Cobertura &lt; 1 mês</div></div>' +
      '<div class="kpi' + (m.zeroCount > 0 ? ' warn' : '') + '" data-filter="zero" role="button" tabindex="0"><div class="num mono">' + m.zeroCount + '</div><div class="label">Zerados</div></div>' +
      '<div class="kpi' + (m.pending > 0 ? ' warn' : '') + '" data-filter="uncounted" role="button" tabindex="0"><div class="num mono">' + m.pending + '</div><div class="label">Sem contagem</div></div>';
  }

  function renderStatusBar(m) {
    const total = m.total || 0;
    const track = document.getElementById('dashStatusBar');
    document.getElementById('dashStatusSub').textContent = total + (total === 1 ? ' item' : ' itens');
    if (!total) { track.innerHTML = '<div class="empty-state">Nenhum item cadastrado ainda.</div>'; return; }
    track.innerHTML = '<div class="status-bar-track">' +
      (m.ok ? '<div class="status-bar-seg ok" style="width:' + (m.ok / total * 100) + '%"></div>' : '') +
      (m.warn ? '<div class="status-bar-seg warn" style="width:' + (m.warn / total * 100) + '%"></div>' : '') +
      (m.crit ? '<div class="status-bar-seg crit" style="width:' + (m.crit / total * 100) + '%"></div>' : '') +
      '</div><div class="status-legend" style="margin-top:10px;">' +
      '<span class="item"><span class="dot ok"></span>Saudável <span class="n">' + m.ok + '</span></span>' +
      '<span class="item"><span class="dot warn"></span>Atenção <span class="n">' + m.warn + '</span></span>' +
      '<span class="item"><span class="dot crit"></span>Crítico <span class="n">' + m.crit + '</span></span></div>';
  }

  function renderCoverageCard(m) {
    const el = document.getElementById('dashCoverage');
    if (m.avgCoverage == null) { el.innerHTML = '<div class="empty-state">Sem dados de consumo suficientes ainda.</div>'; return; }
    el.innerHTML = '<div class="coverage-big">' + m.avgCoverage.toFixed(1).replace('.', ',') + '<span class="unit-lbl">meses</span></div>' +
      '<div class="card-sub">média entre os itens com consumo médio mensal e contagem cadastrados</div>';
  }

  function renderCategoryCards(m) {
    const el = document.getElementById('dashCategories');
    const cats = Object.keys(m.byCat).sort(function (a, b) {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    if (!cats.length) { el.innerHTML = '<div class="empty-state">Nenhuma categoria cadastrada ainda.</div>'; return; }
    el.innerHTML = cats.map(function (cat) {
      const info = m.byCat[cat];
      const cls = CAT_CLASS[cat] || 'outro';
      return '<button class="cat-card" type="button" data-cat="' + escapeHtml(cat) + '">' +
        '<span class="cat-head"><span class="cat-dot" style="background:var(--cat-' + cls + ', var(--text-muted))"></span>' + escapeHtml(cat) + '</span>' +
        '<span class="cat-count mono">' + info.total + '</span>' +
        '<span class="cat-detail">' + info.crit + (info.crit === 1 ? ' item crítico' : ' itens críticos') + '</span></button>';
    }).join('');
  }

  function renderCriticalTable(m) {
    const el = document.getElementById('dashCritical');
    const rows = state.products.filter(function (p) { return classifyProduct(p) === 'crit'; })
      .map(function (p) {
        const c = state.counts[p.code];
        const cov = (c && c.qty != null && p.avgConsumption > 0) ? (c.qty / p.avgConsumption) : null;
        return { p: p, cov: cov, qty: c && c.qty != null ? c.qty : null };
      })
      .sort(function (a, b) { const av = a.cov == null ? -1 : a.cov, bv = b.cov == null ? -1 : b.cov; return av - bv; })
      .slice(0, 8);
    if (!rows.length) { el.innerHTML = '<div class="empty-state">Nenhum item crítico agora.</div>'; return; }
    el.innerHTML = '<div class="table-scroll mini"><table><thead><tr><th>Código</th><th>Descrição</th><th>Atual</th><th>Segurança</th><th>Cobertura</th></tr></thead><tbody>' +
      rows.map(function (r) {
        const covText = r.cov == null ? '—' : (r.cov.toFixed(1).replace('.', ',') + ' m');
        return '<tr><td class="code mono">' + escapeHtml(r.p.code) + '</td><td class="desc">' + escapeHtml(r.p.name) + '</td>' +
          '<td class="num-cell mono">' + (r.qty == null ? '—' : r.qty) + '</td><td class="num-cell mono">' + (r.p.minStock || 0) + '</td>' +
          '<td class="coverage crit">' + covText + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderDonut(m) {
    const el = document.getElementById('dashDonut');
    const total = m.total || 0;
    if (!total) { el.innerHTML = '<div class="empty-state">Sem dados ainda.</div>'; return; }
    const r = 46, circumference = 2 * Math.PI * r;
    let offset = 0;
    function seg(count, color) {
      const len = circumference * (count / total);
      const rotate = (offset / circumference) * 360 - 90;
      offset += len;
      return '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="16" stroke-dasharray="' + len + ' ' + (circumference - len) + '" transform="rotate(' + rotate + ' 60 60)"></circle>';
    }
    const svg = '<svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="16"></circle>' +
      (m.ok ? seg(m.ok, 'var(--ok)') : '') + (m.warn ? seg(m.warn, 'var(--warn)') : '') + (m.crit ? seg(m.crit, 'var(--danger)') : '') + '</svg>';
    el.innerHTML = '<div class="donut-wrap">' + svg + '<div class="donut-legend">' +
      '<span class="item"><span class="dot ok"></span>Saudável — ' + Math.round(m.ok / total * 100) + '%</span>' +
      '<span class="item"><span class="dot warn"></span>Atenção — ' + Math.round(m.warn / total * 100) + '%</span>' +
      '<span class="item"><span class="dot crit"></span>Crítico — ' + Math.round(m.crit / total * 100) + '%</span></div></div>';
  }

  function renderTopConsumption() {
    const el = document.getElementById('dashTopConsumption');
    const items = state.products.filter(function (p) { return (p.avgConsumption || 0) > 0; })
      .sort(function (a, b) { return (b.avgConsumption || 0) - (a.avgConsumption || 0); }).slice(0, 5);
    if (!items.length) { el.innerHTML = '<div class="empty-state">Nenhum item com consumo médio cadastrado.</div>'; return; }
    const max = items[0].avgConsumption || 1;
    el.innerHTML = items.map(function (p) {
      const pct = Math.max(4, Math.round(p.avgConsumption / max * 100));
      return '<div class="bl-row"><span class="bl-code mono">' + escapeHtml(p.code) + '</span>' +
        '<span class="bl-track"><span class="bl-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="bl-val mono">' + p.avgConsumption + '</span></div>';
    }).join('');
  }

  function renderActivityFeed() {
    const el = document.getElementById('dashActivity');
    const items = state.activity || [];
    if (!items.length) { el.innerHTML = '<div class="empty-state">Nenhuma movimentação registrada ainda.</div>'; return; }
    el.innerHTML = items.map(function (a) {
      const verb = a.type === 'add' ? 'cadastrou' : 'registrou contagem de';
      const extra = (a.type === 'count' && a.detail !== '') ? (' (' + escapeHtml(String(a.detail)) + ' un.)') : '';
      const unitTxt = a.unitId ? escapeHtml(unitLabel(a.unitId)) : '';
      const monthTxt = a.month ? escapeHtml(monthLabel(a.month)) : '';
      const context = [unitTxt, monthTxt].filter(Boolean).join(' · ');
      return '<div class="activity-row"><span class="activity-dot ' + (a.type === 'add' ? 'add' : 'count') + '"></span>' +
        '<div class="activity-body"><span class="who"></span> ' + verb + ' <span class="mono">' + escapeHtml(a.code || '') + '</span>' +
        (a.name ? ' — ' + escapeHtml(a.name) : '') + extra +
        (context ? '<div class="activity-context">' + context + '</div>' : '') +
        '<div class="when"></div></div></div>';
    }).join('');
    const rows = el.querySelectorAll('.activity-row');
    rows.forEach(function (row, i) {
      const a = items[i];
      const whoEl = row.querySelector('.who');
      if (whoEl) whoEl.textContent = a.actorName || 'Alguém';
      const whenEl = row.querySelector('.when');
      if (whenEl) whenEl.textContent = a.createdAt ? new Date(a.createdAt).toLocaleString('pt-BR') : '';
    });
  }

  // ==================== ESTOQUE PAGE ====================

  function matchesStateFilter(p) {
    const c = state.counts[p.code];
    const min = p.minStock || 0;
    switch (state.stateFilter) {
      case 'critical': return !!(c && c.qty != null && c.qty < min);
      case 'coverage': return !!(c && c.qty != null && p.avgConsumption > 0 && (c.qty / p.avgConsumption) < 1);
      case 'uncounted': return !(c && c.qty != null);
      case 'zero': return !!(c && c.qty === 0);
      default: return true;
    }
  }
  function filteredProducts() {
    return state.products.filter(function (p) {
      if (state.category !== 'all' && p.category !== state.category) return false;
      if (state.search) {
        const hay = (p.code + ' ' + p.name).toLowerCase();
        if (hay.indexOf(state.search) === -1) return false;
      }
      return matchesStateFilter(p);
    });
  }
  function sortValue(p, field) {
    const c = state.counts[p.code];
    if (field === 'coverage') {
      if (c && c.qty != null && p.avgConsumption > 0) return c.qty / p.avgConsumption;
      return Infinity;
    }
    if (field === 'minStock') return p.minStock || 0;
    if (field === 'avgConsumption') return p.avgConsumption || 0;
    return null;
  }
  function compareProducts(a, b) {
    const field = state.sortBy || 'code';
    if (field === 'code') return a.code.localeCompare(b.code);
    const va = sortValue(a, field), vb = sortValue(b, field);
    const cmp = field === 'coverage' ? (va - vb) : (vb - va);
    return cmp !== 0 ? cmp : a.code.localeCompare(b.code);
  }

  function render() {
    syncControlsWithState();
    renderSubtitle();
    renderKpis();
    renderSections();
    if (state.page === 'dashboard') renderDashboard();
  }
  function syncControlsWithState() {
    const sf = document.getElementById('stateFilter');
    if (sf && sf.value !== state.stateFilter) sf.value = state.stateFilter;
  }
  function renderSubtitle() {
    document.getElementById('subtitle').textContent = state.products.length + ' itens no catálogo · ' + unitLabel(state.unit) + ' · referência: ' + monthLabel(state.month);
  }
  function kpiTile(filterValue, value, label, warn) {
    const active = state.stateFilter === filterValue;
    const cls = 'kpi' + (warn ? ' warn' : '') + (active ? ' kpi-active' : '');
    return '<div class="' + cls + '" data-filter="' + filterValue + '" role="button" tabindex="0"><div class="num mono">' + value + '</div><div class="label">' + label + '</div></div>';
  }
  function renderKpis() {
    const total = state.products.length;
    let counted = 0, belowMin = 0, criticalCoverage = 0, zeroCount = 0;
    state.products.forEach(function (p) {
      const c = state.counts[p.code];
      if (c && c.qty != null) {
        counted++;
        if (c.qty < (p.minStock || 0)) belowMin++;
        if (p.avgConsumption > 0 && (c.qty / p.avgConsumption) < 1) criticalCoverage++;
        if (c.qty === 0) zeroCount++;
      }
    });
    const pending = total - counted;
    document.getElementById('kpis').innerHTML =
      kpiTile('all', total, 'Itens no catálogo', false) +
      kpiTile('all', counted, 'Contados em ' + monthShort(state.month), false) +
      kpiTile('uncounted', pending, 'Ainda sem contagem', pending > 0) +
      kpiTile('critical', belowMin, 'Abaixo da segurança', belowMin > 0) +
      kpiTile('coverage', criticalCoverage, 'Cobertura < 1 mês', criticalCoverage > 0) +
      kpiTile('zero', zeroCount, 'Zerados', zeroCount > 0);
  }

  function renderSections() {
    const container = document.getElementById('sections');
    const products = filteredProducts();
    if (state.products.length === 0) { container.innerHTML = '<div class="section"><div class="empty-state">Nenhum produto cadastrado ainda no catálogo.</div></div>'; return; }
    if (products.length === 0) { container.innerHTML = '<div class="section"><div class="empty-state">Nenhum item corresponde ao filtro atual.</div></div>'; return; }
    const byCat = {};
    products.forEach(function (p) { (byCat[p.category] = byCat[p.category] || []).push(p); });
    const cats = Object.keys(byCat).sort(function (a, b) {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    container.innerHTML = cats.map(function (cat) { return renderSection(cat, byCat[cat].sort(compareProducts)); }).join('');
  }

  function renderSection(cat, items) {
    const cls = CAT_CLASS[cat] || 'outro';
    const collapsed = !!state.collapsedCats[cat];
    const rows = items.map(renderRow).join('');
    return '<div class="section">' +
      '<div class="section-head" role="button" tabindex="0" aria-expanded="' + (!collapsed) + '" data-role="toggle-cat" data-cat="' + escapeHtml(cat) + '">' +
      '<span class="cat-dot" style="background: var(--cat-' + cls + ', var(--text-muted))"></span><h2>' + escapeHtml(cat) + '</h2>' +
      '<span class="count">' + items.length + ' itens</span><span class="chevron">▾</span></div>' +
      (collapsed ? '' : '<div class="table-scroll"><table><thead><tr>' +
        '<th>Código</th><th>Descrição</th><th>Un.</th><th>Segurança</th><th>Consumo/mês</th><th>Contado</th><th>Cobertura</th><th>Situação</th><th>Última contagem</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>') +
      '</div>';
  }

  function renderRow(p) {
    const c = state.counts[p.code];
    const min = p.minStock || 0;
    const consumption = p.avgConsumption || 0;
    const qtyVal = c && c.qty != null ? c.qty : '';
    const canEditParams = state.permissions.editParams;
    const canInputStock = state.permissions.inputStock;
    let badge = '<span class="badge neutral"><span class="dot"></span>sem contagem</span>';
    if (c && c.qty != null) {
      if (c.qty === 0) badge = '<span class="badge zero"><span class="dot"></span>zerado</span>';
      else if (c.qty < min) badge = '<span class="badge danger"><span class="dot"></span>abaixo da segurança</span>';
      else badge = '<span class="badge ok"><span class="dot"></span>ok</span>';
    }
    const rowClass = (c && c.qty === 0) ? ' class="row-zero"' : '';
    let coverageHtml = '<span class="coverage muted">—</span>';
    if (c && c.qty != null && consumption > 0) {
      const months = c.qty / consumption;
      const clsCov = months < 1 ? 'crit' : (months < 2 ? '' : 'muted');
      coverageHtml = '<span class="coverage ' + clsCov + '">' + months.toFixed(1).replace('.', ',') + ' meses</span>';
    }
    const lastDate = c && c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('pt-BR') : '—';
    const hist = state.openHistory[p.code];
    let histRow = '';
    if (hist !== undefined) {
      let bodyHtml;
      if (hist === 'loading') bodyHtml = '<span class="hist-empty">Carregando histórico…</span>';
      else if (!hist.length) bodyHtml = '<span class="hist-empty">Sem contagens anteriores registradas.</span>';
      else bodyHtml = '<div class="hist-list">' + hist.map(function (h) { return '<span><span class="m">' + monthShort(h.month) + ':</span> <span class="mono">' + (h.qty == null ? '—' : h.qty) + '</span></span>'; }).join('') + '</div>';
      histRow = '<tr class="hist-row"><td colspan="10">' + bodyHtml + '</td></tr>';
    }
    const minStockCell = canEditParams
      ? '<input class="num-input" type="number" min="0" step="1" value="' + min + '" aria-label="Estoque de segurança de ' + escapeHtml(p.name) + '" data-role="minstock" data-code="' + escapeHtml(p.code) + '">'
      : '<span class="mono">' + min + '</span>';
    const consumptionCell = canEditParams
      ? '<input class="num-input" type="number" min="0" step="1" value="' + consumption + '" aria-label="Consumo médio mensal de ' + escapeHtml(p.name) + '" data-role="consumption" data-code="' + escapeHtml(p.code) + '">'
      : '<span class="mono">' + consumption + '</span>';
    const qtyCell = canInputStock
      ? '<input class="num-input qty" type="number" min="0" step="1" value="' + qtyVal + '" placeholder="—" aria-label="Quantidade contada de ' + escapeHtml(p.name) + '" data-role="qty" data-code="' + escapeHtml(p.code) + '">'
      : '<span class="mono">' + (qtyVal === '' ? '—' : qtyVal) + '</span>';
    return '<tr' + rowClass + '>' +
      '<td class="code mono">' + escapeHtml(p.code) + '</td>' +
      '<td class="desc">' + escapeHtml(p.name) + '</td>' +
      '<td class="unit">' + escapeHtml(p.unit || '') + '</td>' +
      '<td class="num-cell">' + minStockCell + '</td>' +
      '<td class="num-cell">' + consumptionCell + '</td>' +
      '<td class="num-cell">' + qtyCell + '</td>' +
      '<td class="num-cell">' + coverageHtml + '</td>' +
      '<td>' + badge + '</td>' +
      '<td class="last-count">' + lastDate + '</td>' +
      '<td><button class="hist-btn" type="button" data-role="history" data-code="' + escapeHtml(p.code) + '">' + (hist !== undefined ? 'ocultar' : 'histórico') + '</button></td>' +
      '</tr>' + histRow;
  }

  boot();
})();
