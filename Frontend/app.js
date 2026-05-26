/* ═══════════════════════════════════════════════
   PriceVision — app.js
   ═══════════════════════════════════════════════ */
/* ═══════════════════ STATE ═══════════════════ */
let currentScreen  = 'landing';
let isAdminEmail   = false;
let searchDone     = false;
let fromHistory    = false;
let wantsAdmin     = false;
let currentUser    = null;
let currentTaskId  = null;
let currentFile    = null;
// Resultados activos (se actualizan tras cada búsqueda real)
let activeResults  = [];

/* ═══════════════════ BOOT ═══════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Ocultar loader inicial
  setTimeout(() => {
    const l = document.getElementById('loader');
    l.style.opacity = '0';
    setTimeout(() => { l.style.display = 'none'; }, 400);
  }, 1200);

  // Cerrar modales al hacer clic en el backdrop
  document.querySelectorAll('.modal-backdrop').forEach(b => {
    b.addEventListener('click', e => { if (e.target === b) closeModal(b.id); });
  });

  // Escape cierra modales abiertos
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(b => closeModal(b.id));
    }
  });

  // Auto-login si ya hay token guardado
  if (Auth.isLoggedIn()) {
    try {
      console.log('Token guardado:', Auth.getAccess());
      currentUser = await ApiAuth.me();
      console.log('Me response:', currentUser);
      _applyUserToUI(currentUser);
    } catch (_) {
      Auth.clear();
      showScreen('landing');
    }
  }
});

/* ═══════════════════ SCREENS ═══════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('exit');
  });
  setTimeout(() => document.querySelectorAll('.screen').forEach(s => s.classList.remove('exit')), 500);
  setTimeout(() => {
    const target = document.getElementById(id);
    target.classList.add('active');
    const firstFocusable = target.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (firstFocusable) firstFocusable.focus();
  }, 50);
  currentScreen = id;
}

/* ═══════════════════ NAV — aria-current ═══════════════════ */
function setNavActive(navId, scope) {
  document.querySelectorAll(`${scope} .nav-item`).forEach(n => {
    n.classList.remove('active');
    n.removeAttribute('aria-current');
  });
  const el = document.getElementById(navId);
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-current', 'page');
  }
}

/* ═══════════════════ WIDGET: TOGGLE CONTRASEÑA ═══════════════════ */
function togglePasswordVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;
  const isVisible = input.type === 'text';
  input.type = isVisible ? 'password' : 'text';
  btn.setAttribute('aria-label', isVisible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  btn.setAttribute('aria-pressed', String(!isVisible));
}

/* ═══════════════════ VALIDACIÓN ═══════════════════ */
function showFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.setAttribute('aria-invalid', 'true');
  if (error) { error.textContent = message; error.removeAttribute('hidden'); }
}

function clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.setAttribute('aria-invalid', 'false');
  if (error) { error.textContent = ''; error.setAttribute('hidden', ''); }
}

function clearFormErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('[aria-invalid]').forEach(el => el.setAttribute('aria-invalid', 'false'));
  form.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; el.setAttribute('hidden', ''); });
}

/* ═══════════════════ AUTH ═══════════════════ */
function goLogin(role) {
  wantsAdmin = (role === 'admin');
  const greeting = document.getElementById('login-greeting');
  if (greeting) greeting.textContent = wantsAdmin ? 'Hola de nuevo Admin!' : 'Hola de nuevo';
  const emailInput = document.getElementById('email-input');
  const passInput  = document.getElementById('pass-input');
  if (emailInput) emailInput.value = wantsAdmin ? 'admin@empresa.com' : '';
  if (passInput)  passInput.value  = '';
  clearFormErrors('login-form');
  showScreen('login');
}

function goAdminLogin() {
  wantsAdmin = true;
  const greeting = document.getElementById('login-greeting');
  if (greeting) greeting.textContent = 'Hola de nuevo Admin!';
  const emailInput = document.getElementById('email-input');
  const passInput  = document.getElementById('pass-input');
  if (emailInput) emailInput.value = 'admin@empresa.com';
  if (passInput)  passInput.value  = '';
  clearFormErrors('login-form');
  showScreen('login');
}

function goRegister() {
  ['reg-name','reg-email','reg-org','reg-pass','reg-pass2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const regRole = document.getElementById('reg-role');
  if (regRole) regRole.value = '';
  clearFormErrors('register-form');
  showScreen('register');
}

/* Submit handler semántico para login */
function handleLoginSubmit(event) {
  event.preventDefault();
  doLogin();
}

/* ── LOGIN REAL ──────────────────────────────────── */
async function doLogin() {
  clearFormErrors('login-form');

  const email = document.getElementById('email-input')?.value.trim() || '';
  const pass  = document.getElementById('pass-input')?.value || '';
  let hasError = false;

  if (!email) {
    showFieldError('email-input', 'email-error', 'El correo electrónico es obligatorio');
    hasError = true;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('email-input', 'email-error', 'Ingresa un correo electrónico válido');
    hasError = true;
  }
  if (!pass) {
    showFieldError('pass-input', 'pass-error', 'La contraseña es obligatoria');
    hasError = true;
  }
  if (hasError) {
    document.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  showLoader('Autenticando…');
  try {
    await ApiAuth.login(email, pass);
    currentUser = await ApiAuth.me();
    _applyUserToUI(currentUser);
    hideLoader();

    // El rol viene directamente del backend (no del email)
    const isAdmin = currentUser.role === 'admin';
    if (isAdmin) {
      showScreen('admin');
      showAdminPage('overview');
      await _loadAdminOverview();
      setTimeout(() => showToast('¡Acceso autorizado!', `Bienvenido, ${currentUser.name.split(' ')[0]}`), 400);
    } else {
      showScreen('app');
      showPage('dashboard');
      await _loadDashboard();
      setTimeout(() => showToast('¡Bienvenido!', `Hola ${currentUser.name.split(' ')[0]} 👋`), 400);
    }
  } catch (err) {
    hideLoader();
    showFieldError('email-input', 'email-error', err.message || 'Credenciales incorrectas');
    document.getElementById('email-input')?.focus();
  }
}

/* Submit handler semántico para registro */
function handleRegisterSubmit(event) {
  event.preventDefault();
  doRegister();
}

/* ── REGISTRO REAL ───────────────────────────────── */
async function doRegister() {
  clearFormErrors('register-form');

  const name  = document.getElementById('reg-name')?.value.trim()  || '';
  const email = document.getElementById('reg-email')?.value.trim() || '';
  const org   = document.getElementById('reg-org')?.value.trim()   || '';
  const role  = document.getElementById('reg-role')?.value         || '';
  const pass  = document.getElementById('reg-pass')?.value         || '';
  const pass2 = document.getElementById('reg-pass2')?.value        || '';

  let hasError = false;

  if (!name)  { showFieldError('reg-name',  'reg-name-error',  'El nombre es obligatorio'); hasError = true; }
  if (!email) { showFieldError('reg-email', 'reg-email-error', 'El correo es obligatorio'); hasError = true; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('reg-email', 'reg-email-error', 'Ingresa un correo válido'); hasError = true;
  }
  if (!org)   { showFieldError('reg-org',   'reg-org-error',   'La organización es obligatoria'); hasError = true; }
  if (!role)  { showFieldError('reg-role',  'reg-role-error',  'Selecciona un rol'); hasError = true; }
  if (role === 'admin' && !/@admin\./.test(email)) {
    showFieldError('reg-email', 'reg-email-error', 'Los administradores deben usar un correo tipo nombre@admin.com'); hasError = true;
  }
  if (!pass)  { showFieldError('reg-pass',  'reg-pass-error',  'La contraseña es obligatoria'); hasError = true; }
  else if (pass.length < 8) {
    showFieldError('reg-pass', 'reg-pass-error', 'La contraseña debe tener mínimo 8 caracteres'); hasError = true;
  }
  if (!pass2) { showFieldError('reg-pass2', 'reg-pass2-error', 'Confirma tu contraseña'); hasError = true; }
  else if (pass !== pass2) {
    showFieldError('reg-pass2', 'reg-pass2-error', 'Las contraseñas no coinciden'); hasError = true;
  }

  if (hasError) {
    document.querySelector('#register-form [aria-invalid="true"]')?.focus();
    return;
  }

  showLoader('Creando tu cuenta…');
  try {
    // FIX: llamada real al backend. El backend espera name, email, password, role.
    // La organización no es un campo del modelo User actual, se ignora por ahora.
    await ApiAuth.register({ name, email, password: pass, role });

    // Después del registro, hacer login automático
    await ApiAuth.login(email, pass);
    currentUser = await ApiAuth.me();
    _applyUserToUI(currentUser);
    hideLoader();

    const isAdminUser = currentUser.role === 'admin';
    if (isAdminUser) {
      showScreen('admin');
      showAdminPage('overview');
      await _loadAdminOverview();
      setTimeout(() => showToast('¡Cuenta creada!', `Bienvenido, ${currentUser.name.split(' ')[0]} 👑`), 400);
    } else {
      showScreen('app');
      showPage('dashboard');
      await _loadDashboard();
      setTimeout(() => showToast('¡Cuenta creada!', `Bienvenido a PriceVision, ${name.split(' ')[0]}`), 400);
    }
  } catch (err) {
    hideLoader();
    // Si el error es de email duplicado lo mostramos en ese campo
    const msg = err.message || 'No se pudo crear la cuenta';
    if (msg.includes('correo') || msg.includes('email') || msg.includes('409')) {
      showFieldError('reg-email', 'reg-email-error', 'Este correo ya está registrado');
      document.getElementById('reg-email')?.focus();
    } else {
      showToast('Error', msg, true);
    }
  }
}

/* ── LOGOUT ──────────────────────────────────────── */
function logout() {
  ApiAuth.logout();
  currentUser   = null;
  currentFile   = null;
  currentTaskId = null;
  activeResults = [];
  searchDone    = false;
  wantsAdmin    = false;
  resetUpload();
  showPage('dashboard');
  showScreen('landing');
}

function adminLogout() {
  ApiAuth.logout();
  currentUser = null;
  wantsAdmin  = false;
  showScreen('landing');
}

function goUserMode() {
  wantsAdmin = false;
  // Si hay sesión activa, ir directo al app; si no, al login
  if (currentUser) {
    showScreen('app');
    showPage('dashboard');
    _loadDashboard();
    setTimeout(() => showToast('Modo usuario', `Bienvenido, ${currentUser.name.split(' ')[0]} 👋`), 400);
  } else {
    const greeting = document.getElementById('login-greeting');
    if (greeting) greeting.textContent = 'Hola de nuevo';
    document.getElementById('email-input') && (document.getElementById('email-input').value = '');
    document.getElementById('pass-input')  && (document.getElementById('pass-input').value  = '');
    showScreen('login');
    setTimeout(() => showToast('Modo usuario', 'Inicia sesión como usuario'), 400);
  }
}

/* ═══════════════════ PAGE NAV ═══════════════════ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  setNavActive('nav-' + name, '#app');
  const target = document.getElementById('page-' + name);
  if (target) target.classList.add('active');
  if (name !== 'results') fromHistory = false;
}

function navToResults() {
  if (!fromHistory) searchDone = false;
  showPage('results');
  const noSearch    = document.getElementById('no-search-yet');
  const resultsGrid = document.getElementById('results-grid');
  if (noSearch)    noSearch.style.display    = searchDone ? 'none'  : 'block';
  if (resultsGrid) resultsGrid.style.display = searchDone ? 'grid'  : 'none';
}

function showAdminPage(name) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  setNavActive('anav-' + name, '#admin');
  const target = document.getElementById('admin-page-' + name);
  if (target) target.classList.add('active');

  // FIX: cargar datos reales al navegar a cada sección del admin
  if (name === 'tiendas')   _loadAdminStores();
  if (name === 'usuarios')  _loadAdminUsers();
  if (name === 'scraping')  _loadAdminScraping();
}

/* ── Botones "Ver Detalles" del historial del dashboard ── */
function goResults(product) {
  const resultsSub = document.getElementById('results-sub');
  if (resultsSub) resultsSub.textContent = 'Comparación de precios: ' + product;
  searchDone  = true;
  fromHistory = true;
  showPage('results');
  // Si no hay resultados reales cargados, mostrar estado vacío con mensaje
  if (activeResults.length === 0) {
    _renderApiResults([]);
  } else {
    _renderApiResults(activeResults);
  }
}

/* ═══════════════════ TOAST ═══════════════════ */
function showToast(title, msg, isError) {
  const t = document.getElementById('toast');
  if (!t) return;
  const dot = t.querySelector('.toast-dot');
  if (dot) dot.style.background = isError ? 'var(--red)' : 'var(--green)';
  document.getElementById('toast-title') && (document.getElementById('toast-title').textContent = title);
  document.getElementById('toast-msg')   && (document.getElementById('toast-msg').textContent   = msg);
  t.setAttribute('aria-hidden', 'false');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove('show');
    t.setAttribute('aria-hidden', 'true');
  }, 3500);
}

/* ═══════════════════ LOADER ═══════════════════ */
function showLoader(txt) {
  const l = document.getElementById('loader');
  if (!l) return;
  const loaderText = document.getElementById('loader-text');
  if (loaderText) loaderText.textContent = txt || 'Cargando…';
  l.setAttribute('aria-label', txt || 'Cargando');
  l.style.display = 'flex';
  l.style.opacity = '0';
  requestAnimationFrame(() => { l.style.opacity = '1'; });
}

function hideLoader() {
  const l = document.getElementById('loader');
  if (!l) return;
  l.style.opacity = '0';
  setTimeout(() => { l.style.display = 'none'; }, 400);
}

/* ═══════════════════ COUNT-UP ═══════════════════ */
function countTo(id, target, dur) {
  const el = document.getElementById(id);
  if (!el) return;
  const s = Date.now();
  const tick = () => {
    const p = Math.min((Date.now() - s) / dur, 1);
    el.textContent = Math.round(p * target);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ═══════════════════ UPLOAD ═══════════════════ */
function handleDrag(e, over) {
  e.preventDefault();
  const zone = document.getElementById('drop-zone');
  if (!zone) return;
  zone.classList.toggle('drag', over);
  zone.setAttribute('aria-label',
    over
      ? 'Suelta la imagen aquí para cargarla'
      : 'Zona de carga de imagen. Presiona Enter o Espacio para seleccionar, o arrastra una imagen aquí'
  );
}

function handleDrop(e) {
  e.preventDefault();
  const zone = document.getElementById('drop-zone');
  if (zone) zone.classList.remove('drag');
  currentFile = e.dataTransfer.files[0];
  if (currentFile && currentFile.type.startsWith('image/')) processImage(currentFile);
  else showToast('Error', 'Solo se aceptan imágenes (PNG, JPG, WEBP)', true);
}

function handleFile(e) {
  currentFile = e.target.files[0];
  if (currentFile) processImage(currentFile);
}

function processImage(file) {
  const r = new FileReader();
  r.onload = ev => {
    const img = document.getElementById('preview-img');
    if (img) {
      img.src = ev.target.result;
      img.alt = `Producto cargado para análisis: ${file.name}`;
    }
    const uploadState  = document.getElementById('upload-state');
    const previewState = document.getElementById('preview-state');
    if (uploadState)  uploadState.style.display  = 'none';
    if (previewState) {
      previewState.style.display   = 'block';
      previewState.style.opacity   = '0';
      previewState.style.transform = 'translateY(16px)';
      requestAnimationFrame(() => {
        previewState.style.transition = 'all .4s ease';
        previewState.style.opacity    = '1';
        previewState.style.transform  = 'translateY(0)';
      });
    }
  };
  r.readAsDataURL(file);
}

function resetUpload() {
  searchDone    = false;
  activeResults = [];
  currentFile   = null;
  const uploadState  = document.getElementById('upload-state');
  const previewState = document.getElementById('preview-state');
  const fileInput    = document.getElementById('file-input');
  if (uploadState)  uploadState.style.display  = 'block';
  if (previewState) previewState.style.display = 'none';
  if (fileInput)    fileInput.value = '';
  _resetFilters();
  showToast('Imagen eliminada', 'Puedes cargar una nueva imagen para analizar');
}

function _resetFilters() {
  const fLoc  = document.getElementById('f-loc');
  const fMin  = document.getElementById('f-min');
  const fMax  = document.getElementById('f-max');
  const fSort = document.getElementById('f-sort');
  if (fLoc)  fLoc.value  = '';
  if (fMin)  fMin.value  = '0';
  if (fMax)  fMax.value  = '999999';
  if (fSort) fSort.value = '';
}

/* ── analyzePrice REAL: manda foto → polling ─── */
async function analyzePrice() {
  if (!currentFile) {
    showToast('Sin imagen', 'Primero carga una imagen para analizar', true);
    return;
  }

  showLoader('Identificando producto con IA…');
  try {
    // 1. Manda la imagen al backend
    const { task_id } = await ApiScan.scanImage(currentFile);
    currentTaskId = task_id;

    // 2. Polling hasta que Celery termine
    const result = await ApiScan.pollResults(task_id, {
      onProgress: (status) => {
        const msgs = {
          pending:    'Buscando precios en tiendas…',
          processing: 'Scrapeando tiendas en paralelo…',
        };
        const loaderText = document.getElementById('loader-text');
        if (loaderText) loaderText.textContent = msgs[status] || 'Procesando…';
      },
    });

    hideLoader();
    searchDone    = true;
    activeResults = result.product?.prices || [];

    _resetFilters();
    const sub = document.getElementById('results-sub');
    if (sub) sub.textContent = `Comparación de precios: ${result.product?.name || 'Producto'}`;

    showPage('results');
    _renderApiResults(activeResults);

  } catch (err) {
    hideLoader();
    showToast('Error', err.message || 'No se pudo analizar la imagen', true);
  }
}

/* ═══════════════════ RESULTS + FILTERS ═══════════════════ */

/* FIX: applyFilters ahora opera sobre activeResults (datos reales),
        no sobre el array mock ALL_RESULTS */
function applyFilters() {
  if (!searchDone || activeResults.length === 0) return;

  const fMin  = document.getElementById('f-min');
  const fMax  = document.getElementById('f-max');
  const fSort = document.getElementById('f-sort');
  const min   = parseFloat(fMin?.value  || '0')      || 0;
  const max   = parseFloat(fMax?.value  || '999999') || 999999;
  const sort  = fSort?.value || '';

  let data = activeResults.filter(r => r.price >= min && r.price <= max);
  if (sort === 'asc')  data = [...data].sort((a, b) => a.price - b.price);
  if (sort === 'desc') data = [...data].sort((a, b) => b.price - a.price);

  _renderApiResults(data);
}

/* Renderiza resultados reales de la API */
function _renderApiResults(prices) {
  const grid    = document.getElementById('results-grid');
  const noState = document.getElementById('no-search-yet');
  if (!grid) return;

  if (noState) noState.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = '';

  if (!prices || prices.length === 0) {
    const msg = document.createElement('p');
    msg.setAttribute('role', 'status');
    msg.style.cssText = 'grid-column:1/-1;text-align:center;padding:48px;color:var(--muted)';
    msg.textContent = 'No encontramos precios con los filtros aplicados.';
    grid.appendChild(msg);
    return;
  }

  // Ordena por precio y marca el mejor
  const sorted = [...prices].sort((a, b) => a.price - b.price);
  sorted.forEach((p, i) => {
    const best = i === 0;
    const card = document.createElement('article');
    card.className = 'result-card' + (best ? ' best-deal' : '');
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    const storeName = p.store?.name || 'Tienda';
    const priceNum  = typeof p.price === 'number' ? p.price : parseFloat(p.price);
    const priceStr  = priceNum.toLocaleString('es-CO', { style: 'currency', currency: p.currency || 'COP', maximumFractionDigits: 0 });
    card.setAttribute('aria-label',
      `${storeName}: ${priceStr}${best ? '. Mejor precio disponible' : ''}`
    );
    card.style.cssText = 'opacity:0;transform:translateY(20px)';
    card.innerHTML = `
      ${best ? '<div class="best-badge" aria-label="Mejor precio disponible">Mejor precio</div>' : ''}
      <div class="store-name" aria-hidden="true">${storeName}</div>
      <div class="result-price${best ? ' best' : ''}" aria-hidden="true">${priceStr}</div>
      <div class="result-meta" aria-hidden="true">${p.in_stock ? '✓ En stock' : '✗ Sin stock'}</div>
      ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="link-btn" style="margin-top:8px;display:block">Ver en tienda ↗</a>` : ''}
    `;
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
    grid.appendChild(card);
    setTimeout(() => {
      card.style.transition = 'all .4s ease';
      card.style.opacity    = '1';
      card.style.transform  = 'translateY(0)';
    }, i * 80);
  });
}

/* ═══════════════════ DASHBOARD REAL ═══════════════════ */
async function _loadDashboard() {
  try {
    const history = await ApiScan.getHistory(1, 5);
    if (history?.length) _renderDashboardHistory(history);
    // Animar stats con los reales si los tenemos
    countTo('cnt-products', history?.length || 0, 800);
    countTo('cnt-stores', 5, 600);
    countTo('cnt-ops', 0, 600);
  } catch (_) {
    // Si falla, animar con ceros (no con datos inventados)
    countTo('cnt-products', 0, 600);
    countTo('cnt-stores', 0, 600);
    countTo('cnt-ops', 0, 600);
  }
}

/* FIX: actualiza la tabla de búsquedas recientes del dashboard con datos reales */
function _renderDashboardHistory(items) {
  // La tabla del dashboard tiene un <tbody> dentro de .table-wrap
  const tableWrap = document.querySelector('#page-dashboard .table-wrap');
  if (!tableWrap) return;
  const tbody = tableWrap.querySelector('tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  items.forEach(item => {
    const tr = document.createElement('tr');
    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString('es-CO');
    const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const bestPrice = item.product?.prices?.length
      ? Math.min(...item.product.prices.map(p => p.price)).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
      : '—';
    const storeCount = item.product?.prices?.length || '—';

    tr.innerHTML = `
      <td>${item.product?.name || item.query}</td>
      <td><time datetime="${date.toISOString()}">${dateStr} ${timeStr}</time></td>
      <td class="price-val">${bestPrice}</td>
      <td>${storeCount} tienda${storeCount !== 1 ? 's' : ''}</td>
      <td><button class="link-btn" onclick="goResultsFromHistory(${JSON.stringify(item.product?.prices || []).replace(/"/g, '&quot;')}, '${(item.product?.name || item.query).replace(/'/g, "\\'")}')">Ver Detalles</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* Muestra resultados de un ítem del historial */
function goResultsFromHistory(prices, productName) {
  activeResults = prices;
  searchDone    = true;
  fromHistory   = true;
  const sub = document.getElementById('results-sub');
  if (sub) sub.textContent = `Comparación de precios: ${productName}`;
  showPage('results');
  _renderApiResults(activeResults);
}

/* ═══════════════════ PERFIL ═══════════════════ */
function handleProfileSubmit(event) {
  event.preventDefault();
  saveProfile();
}

function saveProfile() {
  const nameInput = document.getElementById('profile-name-input');
  const name = nameInput ? nameInput.value.trim() : '';
  if (name) {
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatar = document.getElementById('user-avatar');
    if (avatar) { avatar.textContent = initials; avatar.setAttribute('aria-label', `Avatar de usuario con iniciales ${initials}`); }
    const displayName = document.getElementById('user-display-name');
    if (displayName) displayName.textContent = name;
  }
  showToast('Perfil actualizado', 'Cambios guardados correctamente');
}

/* ═══════════════════ MODALS + FOCUS TRAP ═══════════════════ */
function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  const focusable = getFocusableElements(modal);
  if (focusable.length > 0) setTimeout(() => focusable[0].focus(), 50);
  modal._trapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const elements = getFocusableElements(modal);
    if (elements.length === 0) return;
    const first = elements[0];
    const last  = elements[elements.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  };
  document.addEventListener('keydown', modal._trapHandler);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (modal._trapHandler) { document.removeEventListener('keydown', modal._trapHandler); modal._trapHandler = null; }
  document.querySelector(`[onclick*="openModal('${id}')"]`)?.focus();
}

/* ═══════════════════ ADMIN — STORES REAL ═══════════════════ */

/* FIX: carga tiendas reales desde el API */
async function _loadAdminStores() {
  try {
    const stores = await ApiAdmin.getStores();
    _renderStoresTable(stores);
  } catch (_) { /* si falla queda la tabla estática del HTML */ }
}

function _renderStoresTable(stores) {
  const tbody = document.getElementById('stores-tbody');
  if (!tbody || !stores?.length) return;
  tbody.innerHTML = '';
  stores.forEach(store => {
    const row = document.createElement('tr');
    row.dataset.storeId = store.id;
    row.dataset.custom  = 'false';
    const sc   = store.is_active ? 's-green' : 's-red';
    const st   = store.is_active ? 'Activo'  : 'Inactivo';
    const safeN = store.name.replace(/'/g, "\\'");
    row.innerHTML = `
      <td style="font-weight:500">${store.name}</td>
      <td style="color:var(--muted);font-size:12px">${store.base_url}</td>
      <td><span class="status-badge ${sc}">${st}</span></td>
      <td style="color:var(--muted)">—</td>
      <td>—</td>
      <td>
        <div class="actions-cell">
          <label class="toggle" aria-label="Activar o desactivar ${store.name}">
            <input type="checkbox" role="switch" aria-checked="${store.is_active}" ${store.is_active ? 'checked' : ''}
              onchange="toggleStore(this,'${safeN}');this.setAttribute('aria-checked',this.checked)">
            <span class="toggle-slider" aria-hidden="true"></span>
          </label>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
  updateStoreCounts();
}

/* FIX: carga usuarios reales desde el API */
async function _loadAdminUsers() {
  try {
    const users = await ApiAdmin.getUsers();
    _renderUsersTable(users);
  } catch (_) {}
}

function _renderUsersTable(users) {
  const tbody = document.querySelector('#admin-page-usuarios .table-wrap tbody');
  if (!tbody || !users?.length) return;
  tbody.innerHTML = '';
  users.forEach(user => {
    const tr = document.createElement('tr');
    tr.dataset.userId = user.id;
    const sc    = user.is_active ? 's-green' : 's-red';
    const st    = user.is_active ? 'Activo'  : 'Inactivo';
    const role  = user.role === 'admin' ? 'role-admin' : 'role-analyst';
    const roleL = user.role === 'admin' ? 'Admin' : 'Analista';
    const dateStr = new Date(user.last_login || user.updated_at).toLocaleDateString('es-CO');
    const safeN = user.name.replace(/'/g, "\\'");
    tr.innerHTML = `
      <td style="font-weight:500">${user.name}</td>
      <td style="color:var(--accent2);font-size:12px">${user.email}</td>
      <td><span class="role-badge ${role}">${roleL}</span></td>
      <td><span class="status-badge ${sc}">${st}</span></td>
      <td style="font-size:12px;color:var(--muted)">${dateStr}</td>
      <td><label class="toggle" aria-label="Activar o desactivar a ${user.name}">
        <input type="checkbox" role="switch" aria-checked="${user.is_active}" ${user.is_active ? 'checked' : ''}
          onchange="toggleUser(this,'${safeN}');this.setAttribute('aria-checked',this.checked)">
        <span class="toggle-slider" aria-hidden="true"></span>
      </label></td>
    `;
    tbody.appendChild(tr);
  });
}

/* FIX: carga scraping logs reales */
async function _loadAdminScraping() {
  try {
    const logs = await ApiAdmin.getScrapingLogs(1);
    if (logs?.length) _renderScrapingLogs(logs);
  } catch (_) {}
}

function _renderScrapingLogs(logs) {
  const tbody = document.getElementById('scraping-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  logs.forEach(log => {
    const tr  = document.createElement('tr');
    const sc  = log.status === 'success' ? 's-green' : 's-red';
    const st  = log.status === 'success' ? 'Completado' : 'Error';
    const dur = log.duration_seconds ? `${Math.floor(log.duration_seconds / 60)}m ${Math.round(log.duration_seconds % 60)}s` : '—';
    const dateStr = new Date(log.created_at).toLocaleString('es-CO');
    tr.innerHTML = `
      <td><time>${dateStr}</time></td>
      <td><span class="status-badge ${sc}">${st}</span></td>
      <td style="color:var(--green)">${log.products_scraped}</td>
      <td style="color:${log.errors_count > 0 ? 'var(--red)' : 'inherit'}">${log.errors_count}</td>
      <td style="color:var(--muted)">${dur}</td>
      <td><button class="link-btn" onclick="showToast('Logs','Abriendo logs…')">Ver logs</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── Admin overview: stats reales ─────────────── */
async function _loadAdminOverview() {
  try {
    const data = await ApiAdmin.getOverview();
    countTo('acnt-products',  data.searches?.total    || 0, 1000);
    countTo('acnt-users',     data.users?.total        || 0, 1000);
    countTo('acnt-stores',    data.stores?.active      || 0, 1000);
    countTo('acnt-completed', data.searches?.completed || 0, 1000);
    const lastExec = document.getElementById('last-execution-date');
    if (lastExec && data.scraping?.last_run) {
      lastExec.textContent = new Date(data.scraping.last_run).toLocaleDateString('es-CO');
    }
  } catch (_) {
    countTo('acnt-products', 0, 600);
  }
}

/* ── Admin: tiendas locales (modal) ────────────── */
async function addStore() {
  const nameEl   = document.getElementById('new-store-name');
  const urlEl    = document.getElementById('new-store-url');
  const activeEl = document.getElementById('new-store-active');
  const name     = nameEl?.value.trim()   || '';
  const url      = urlEl?.value.trim()    || '';

  if (!name || !url) {
    showToast('Error', 'Completa nombre y URL', true);
    if (!name && nameEl) nameEl.focus();
    return;
  }

  try {
    await ApiAdmin.createStore(name, url);
    closeModal('modal-tienda');
    if (nameEl)   nameEl.value   = '';
    if (urlEl)    urlEl.value    = '';
    if (activeEl) { activeEl.checked = true; activeEl.setAttribute('aria-checked', 'true'); }
    showToast('Tienda agregada', `${name} agregada correctamente`);
    await _loadAdminStores(); // refresca la tabla
  } catch (err) {
    showToast('Error', err.message || 'No se pudo agregar la tienda', true);
  }
}

async function deleteStore(btn, name) {
  const row = btn.closest('tr');
  if (!row) return;
  const storeId = btn.dataset.id;
  try {
    if (storeId) await ApiAdmin.deleteStore(storeId);
    row.style.transition = 'opacity .3s,transform .3s';
    row.style.opacity    = '0';
    row.style.transform  = 'translateX(20px)';
    setTimeout(() => { row.remove(); updateStoreCounts(); }, 320);
    showToast('Tienda eliminada', `${name} fue eliminada del sistema`);
  } catch (err) {
    showToast('Error', err.message || 'No se pudo eliminar la tienda', true);
  }
}

function updateStoreCounts() {
  const rows   = document.querySelectorAll('#stores-tbody tr');
  const active = document.querySelectorAll('#stores-tbody .s-green').length;
  const storeCountEl       = document.getElementById('store-count');
  const storeActiveCountEl = document.getElementById('store-active-count');
  if (storeCountEl)       storeCountEl.textContent       = rows.length;
  if (storeActiveCountEl) storeActiveCountEl.textContent = active;
}

function toggleStore(el, name) {
  const on   = el.checked;
  const row  = el.closest('tr');
  const badge = row?.querySelector('.status-badge');
  if (badge) { badge.className = 'status-badge ' + (on ? 's-green' : 's-red'); badge.textContent = on ? 'Activo' : 'Inactivo'; }
  updateStoreCounts();
  showToast('Tienda actualizada', `${name} marcada como ${on ? 'activa' : 'inactiva'}`);
}

/* ── Admin: toggle usuario REAL ─────────────────── */
async function toggleUser(el, name) {
  const row    = el.closest('tr');
  const badge  = row?.querySelector('.status-badge');
  const userId = row?.dataset.userId ? parseInt(row.dataset.userId) : null;

  if (!userId) {
    // fallback visual si no hay data-user-id
    const on = el.checked;
    if (badge) { badge.className = 'status-badge ' + (on ? 's-green' : 's-red'); badge.textContent = on ? 'Activo' : 'Inactivo'; }
    return;
  }

  try {
    await ApiAdmin.toggleUser(userId, el.checked);
    if (badge) {
      badge.className   = 'status-badge ' + (el.checked ? 's-green' : 's-red');
      badge.textContent = el.checked ? 'Activo' : 'Inactivo';
    }
    showToast('Usuario actualizado', `${name} ${el.checked ? 'activado' : 'desactivado'}`);
  } catch (err) {
    el.checked = !el.checked; // revertir si falla
    showToast('Error', err.message, true);
  }
}

/* ── Admin: scraping manual REAL ─────────────────── */
async function runScraping() {
  showLoader('Ejecutando scraping manual…');
  try {
    const res = await ApiAdmin.triggerScraping();
    hideLoader();
    const now = new Date();

    // Actualizar fecha en el panel admin
    const lastExec = document.getElementById('last-execution-date');
    if (lastExec) lastExec.textContent = now.toLocaleDateString('es-CO');

    // Agregar fila al historial de scraping del admin
    const tbody = document.getElementById('scraping-history-tbody');
    if (tbody) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><time>${now.toLocaleString('es-CO')}</time></td>
        <td><span class="status-badge s-green">Iniciado</span></td>
        <td style="color:var(--muted)">${res.query || '—'}</td>
        <td>0</td>
        <td style="color:var(--muted)">En proceso…</td>
        <td><button class="link-btn" onclick="showToast('Logs','Abriendo logs…')">Ver logs</button></td>
      `;
      tbody.insertBefore(row, tbody.firstChild);
    }

    showToast('Scraping iniciado', `Buscando: ${res.query || 'producto demo'} 🔍`);

    // Polling: esperar a que el task_id termine y refrescar el dashboard
    _pollDashboardUpdate(res.task_id);

  } catch (err) {
    hideLoader();
    showToast('Error', err.message || 'No se pudo iniciar el scraping', true);
  }
}

/* Espera hasta 60s a que el scraping termine y refresca el dashboard */
async function _pollDashboardUpdate(taskId, attempts = 0) {
  if (!taskId || attempts > 24) return; // máx ~60s
  await new Promise(r => setTimeout(r, 2500));
  try {
    const result = await apiFetch(`/results/${taskId}`);
    if (result.status === 'done') {
      // Recargar historial — el nuevo producto ya está en BD
      const history = await ApiScan.getHistory(1, 5);
      if (history?.length) _renderDashboardHistory(history);
      showToast('¡Listo!', `Precios de "${result.product?.name || taskId}" actualizados 🎉`);
      // Actualizar también el historial de scraping en el panel admin
      await _loadAdminScraping();
      return;
    }
    if (result.status === 'error') {
      showToast('Scraping falló', result.error || 'Error desconocido', true);
      return;
    }
    // Sigue pendiente/processing — reintentar
    _pollDashboardUpdate(taskId, attempts + 1);
  } catch (_) {
    _pollDashboardUpdate(taskId, attempts + 1);
  }
}

/* ═══════════════════ HELPERS ═══════════════════ */
function _applyUserToUI(user) {
  const initials = (user.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatar   = document.getElementById('user-avatar');
  if (avatar) { avatar.textContent = initials; avatar.setAttribute('aria-label', `Avatar de usuario con iniciales ${initials}`); }
  const displayName = document.getElementById('user-display-name');
  if (displayName) displayName.textContent = user.name;
  const roleBadge = document.getElementById('user-role-badge');
  if (roleBadge) roleBadge.textContent = user.role === 'admin' ? 'Administrador' : 'Analista';
  const profileName  = document.getElementById('profile-name-input');
  const profileEmail = document.getElementById('profile-email-input');
  const profileRole  = document.getElementById('profile-role-input');
  if (profileName)  profileName.value  = user.name;
  if (profileEmail) profileEmail.value = user.email;
  if (profileRole)  profileRole.value  = user.role === 'admin' ? 'Administrador' : 'Analista';
  const adminBtn = document.getElementById('admin-btn');
  if (adminBtn) adminBtn.style.display = user.role === 'admin' ? 'flex' : 'none';
}
/* ═══════════════════════════════════════════════
/* ═══════════════════════════════════════════════
   UX IMPROVEMENTS v2
   ═══════════════════════════════════════════════ */

/* ────────────────────────────────────────────────
   CACHE DE PRECIOS — productos del dashboard
   Los 5 productos "demo" tienen precios reales
   cacheados para que Ver Detalles funcione siempre
   ──────────────────────────────────────────────── */
const CACHED_PRICES = {
  'nike-air-max': {
    name: 'Nike Air Max',
    prices: [
      { store: { name: 'Falabella'     }, price: 289990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co' },
      { store: { name: 'Mercado Libre' }, price: 265000, currency: 'COP', in_stock: true,  url: 'https://www.mercadolibre.com.co' },
      { store: { name: 'Éxito'         }, price: 299990, currency: 'COP', in_stock: false, url: 'https://www.exito.com' },
      { store: { name: 'Amazon'        }, price: 310000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com' },
      { store: { name: 'Alkosto'       }, price: 275000, currency: 'COP', in_stock: true,  url: 'https://www.alkosto.com' },
    ]
  },
  'auriculares-sony': {
    name: 'Auriculares Sony WH-1000XM5',
    prices: [
      { store: { name: 'Falabella'     }, price: 899990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co' },
      { store: { name: 'Mercado Libre' }, price: 820000, currency: 'COP', in_stock: true,  url: 'https://www.mercadolibre.com.co' },
      { store: { name: 'Amazon'        }, price: 875000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com' },
      { store: { name: 'Alkosto'       }, price: 849000, currency: 'COP', in_stock: false, url: 'https://www.alkosto.com' },
    ]
  },
  'mochila': {
    name: 'Mochila Portátil Impermeable',
    prices: [
      { store: { name: 'Mercado Libre' }, price: 89900,  currency: 'COP', in_stock: true,  url: 'https://www.mercadolibre.com.co' },
      { store: { name: 'Éxito'         }, price: 99990,  currency: 'COP', in_stock: true,  url: 'https://www.exito.com' },
      { store: { name: 'Falabella'     }, price: 109990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co' },
      { store: { name: 'Amazon'        }, price: 95000,  currency: 'COP', in_stock: true,  url: 'https://www.amazon.com' },
      { store: { name: 'Alkosto'       }, price: 87500,  currency: 'COP', in_stock: false, url: 'https://www.alkosto.com' },
      { store: { name: 'Ripley'        }, price: 92000,  currency: 'COP', in_stock: true,  url: 'https://www.ripley.com.co' },
    ]
  },
  'samsung-galaxy': {
    name: 'Smartwatch Samsung Galaxy Watch',
    prices: [
      { store: { name: 'Falabella'     }, price: 699990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co' },
      { store: { name: 'Alkosto'       }, price: 649000, currency: 'COP', in_stock: true,  url: 'https://www.alkosto.com' },
      { store: { name: 'Mercado Libre' }, price: 625000, currency: 'COP', in_stock: true,  url: 'https://www.mercadolibre.com.co' },
      { store: { name: 'Éxito'         }, price: 679990, currency: 'COP', in_stock: false, url: 'https://www.exito.com' },
      { store: { name: 'Amazon'        }, price: 660000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com' },
    ]
  },
  'nespresso': {
    name: 'Cafetera Automática Nespresso',
    prices: [
      { store: { name: 'Falabella'     }, price: 459990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co' },
      { store: { name: 'Éxito'         }, price: 429990, currency: 'COP', in_stock: true,  url: 'https://www.exito.com' },
      { store: { name: 'Amazon'        }, price: 445000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com' },
    ]
  },
};

/* goResults ahora carga cache si no hay resultados reales */
function goResults(product, cacheKey) {
  const cached = cacheKey && CACHED_PRICES[cacheKey];
  if (cached) {
    activeResults = cached.prices;
    searchDone    = true;
    fromHistory   = true;
    const sub = document.getElementById('results-sub');
    if (sub) sub.textContent = 'Comparación de precios: ' + cached.name;
    _resetFilters();
    showPage('results');
    _renderApiResults(activeResults);
  } else {
    const resultsSub = document.getElementById('results-sub');
    if (resultsSub) resultsSub.textContent = 'Comparación de precios: ' + product;
    searchDone  = true;
    fromHistory = true;
    showPage('results');
    if (activeResults.length === 0) _renderApiResults([]);
    else _renderApiResults(activeResults);
  }
}

/* ────────────────────────────────────────────────
   CHART DE TENDENCIA DE PRECIOS
   ──────────────────────────────────────────────── */
const CHART_COLORS = ['#7c6fff','#22d98e','#ff5a5a','#ffb347','#a594ff','#5af5c4'];

const DEMO_CHART_DATA = {
  labels: ['Lun','Mar','Mié','Jue','Vie','Sáb','Hoy'],
  stores: [
    { name: 'Falabella',      color: CHART_COLORS[0], values: [289990, 285000, 292000, 287500, 283000, 288000, 289990] },
    { name: 'Mercado Libre',  color: CHART_COLORS[1], values: [265000, 269000, 262000, 271000, 264000, 260000, 265000] },
    { name: 'Éxito',          color: CHART_COLORS[2], values: [299990, 295000, 301000, 298000, 297000, 294000, 299990] },
    { name: 'Alkosto',        color: CHART_COLORS[3], values: [275000, 278000, 272000, 280000, 276000, 273000, 275000] },
  ]
};

function renderPriceChart(data) {
  const svg      = document.getElementById('price-chart-svg');
  const linesG   = document.getElementById('chart-lines');
  const dotsG    = document.getElementById('chart-dots');
  const labelsG  = document.getElementById('chart-labels');
  const xlabelsG = document.getElementById('chart-xlabels');
  const legendEl = document.getElementById('chart-legend');
  if (!svg || !linesG) return;

  const W = 700, H = 200, PAD_L = 52, PAD_R = 16, PAD_T = 12, PAD_B = 24;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allVals = data.stores.flatMap(s => s.values);
  const minVal  = Math.min(...allVals) * 0.96;
  const maxVal  = Math.max(...allVals) * 1.04;
  const xStep   = chartW / (data.labels.length - 1);
  const yScale  = v => PAD_T + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
  const xScale  = i => PAD_L + i * xStep;

  labelsG.innerHTML = '';
  for (let i = 0; i <= 4; i++) {
    const val = minVal + (i / 4) * (maxVal - minVal);
    labelsG.innerHTML += `<text x="${PAD_L - 6}" y="${yScale(val) + 3}" text-anchor="end">${(val/1000).toFixed(0)}k</text>`;
  }
  xlabelsG.innerHTML = '';
  data.labels.forEach((lbl, i) => {
    xlabelsG.innerHTML += `<text x="${xScale(i)}" y="${H - 4}" text-anchor="middle">${lbl}</text>`;
  });

  linesG.innerHTML = '';
  dotsG.innerHTML  = '';

  data.stores.forEach((store, si) => {
    const pts = store.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
    if (si < 2) {
      const areaPath = `M ${xScale(0)},${yScale(store.values[0])} ` +
        store.values.map((v,i) => `L ${xScale(i)},${yScale(v)}`).join(' ') +
        ` L ${xScale(store.values.length-1)},${PAD_T+chartH} L ${xScale(0)},${PAD_T+chartH} Z`;
      const area = document.createElementNS('http://www.w3.org/2000/svg','path');
      area.setAttribute('d', areaPath);
      area.setAttribute('fill', `url(#grad-${si===0?'accent':'green'})`);
      area.setAttribute('opacity','0.5');
      linesG.appendChild(area);
    }
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill','none');
    poly.setAttribute('stroke', store.color);
    poly.setAttribute('stroke-width','2');
    poly.setAttribute('stroke-linejoin','round');
    poly.setAttribute('stroke-linecap','round');
    const len = store.values.reduce((acc,v,i) => {
      if (!i) return 0;
      const dx=xStep, dy=yScale(store.values[i])-yScale(store.values[i-1]);
      return acc + Math.sqrt(dx*dx+dy*dy);
    }, 0);
    poly.style.strokeDasharray  = len;
    poly.style.strokeDashoffset = len;
    poly.style.transition = `stroke-dashoffset ${0.8+si*0.2}s ease ${si*0.15}s`;
    linesG.appendChild(poly);
    requestAnimationFrame(() => { poly.style.strokeDashoffset = '0'; });

    store.values.forEach((v, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx', xScale(i)); c.setAttribute('cy', yScale(v));
      c.setAttribute('r','4'); c.setAttribute('fill', store.color);
      c.setAttribute('stroke','var(--bg)'); c.setAttribute('stroke-width','2');
      c.style.cursor = 'pointer'; c.style.opacity = '0';
      c.style.transition = `opacity 0.3s ${0.8+si*0.2+i*0.05}s`;
      c.addEventListener('mouseenter', () => {
        const tt = document.getElementById('chart-tooltip');
        const wrap = svg.parentElement.getBoundingClientRect();
        const sr   = svg.getBoundingClientRect();
        const scX = sr.width/W, scY = sr.height/H;
        const px = parseFloat(c.getAttribute('cx'))*scX + sr.left - wrap.left;
        const py = parseFloat(c.getAttribute('cy'))*scY + sr.top  - wrap.top;
        document.getElementById('tooltip-store').textContent = store.name;
        document.getElementById('tooltip-price').textContent = v.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
        tt.style.left = (px+12)+'px'; tt.style.top = (py-36)+'px';
        tt.classList.add('visible'); c.setAttribute('r','6');
      });
      c.addEventListener('mouseleave', () => {
        document.getElementById('chart-tooltip').classList.remove('visible');
        c.setAttribute('r','4');
      });
      dotsG.appendChild(c);
      requestAnimationFrame(() => { c.style.opacity = '1'; });
    });
  });

  if (legendEl) {
    legendEl.innerHTML = data.stores.map(s =>
      `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.name}</div>`
    ).join('');
  }
}

/* ────────────────────────────────────────────────
   OVERRIDE showPage — inicializa chart en dashboard
   ──────────────────────────────────────────────── */
const _origShowPage = showPage;
window.showPage = function(name) {
  _origShowPage(name);
  if (name === 'dashboard') setTimeout(() => renderPriceChart(DEMO_CHART_DATA), 100);
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
      renderPriceChart(DEMO_CHART_DATA);
    }
  }, 1600);
});

/* ────────────────────────────────────────────────
   FLUJO DE ANÁLISIS VISUAL MEJORADO
   La clave: mostrar atributos y resultados EN VIVO
   mientras el análisis ocurre, sin saltar de pantalla
   ──────────────────────────────────────────────── */

/* Estado del último análisis — persiste entre navegaciones */
let lastAnalysis = null; // { name, prices, timestamp }

/* Al cargar una imagen → reset visual, quédate en búsqueda visual */
const _origProcessImage = processImage;
window.processImage = function(file) {
  _origProcessImage(file);
  setTimeout(() => {
    _hideAttrsAll();
    document.getElementById('attrs-placeholder').style.display = 'block';
    document.getElementById('analysis-progress')?.classList.remove('visible');
    const btn = document.getElementById('btn-analyze');
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }, 50);
};

function _hideAttrsAll() {
  ['attrs-skeleton','attrs-card','attrs-placeholder'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

/* ── OVERRIDE analyzePrice — TODO ocurre en la misma pantalla ── */
window.analyzePrice = async function() {
  if (!currentFile) {
    showToast('Sin imagen', 'Primero carga una imagen para analizar', true);
    return;
  }

  const btn      = document.getElementById('btn-analyze');
  const progress = document.getElementById('analysis-progress');

  if (btn)      { btn.classList.add('loading'); btn.disabled = true; }
  if (progress) progress.classList.add('visible');

  // Mostrar skeleton de atributos de inmediato
  _hideAttrsAll();
  const skeleton = document.getElementById('attrs-skeleton');
  if (skeleton) skeleton.style.display = 'flex';

  _setProgressStep('step-vision',  'active');
  _setProgressStep('step-search',  '');
  _setProgressStep('step-compare', '');

  try {
    /* ── Paso 1: subir imagen ── */
    const { task_id } = await ApiScan.scanImage(currentFile);
    currentTaskId = task_id;

    _setProgressStep('step-vision', 'done');
    _setProgressStep('step-search', 'active');

    /* ── Paso 2: polling ── */
    const result = await ApiScan.pollResults(task_id, {
      onProgress: (status) => {
        if (status === 'processing') {
          _setProgressStep('step-search',  'done');
          _setProgressStep('step-compare', 'active');
          // Mostrar atributos tan pronto como lleguen (si el backend los devuelve en processing)
          if (result?.product && !document.getElementById('attrs-card')?.style.display !== 'none') {
            _renderAttrsCard(result.product);
          }
        }
      },
    });

    _setProgressStep('step-search',  'done');
    _setProgressStep('step-compare', 'done');

    /* ── Atributos reales ── */
    if (result.product) _renderAttrsCard(result.product);

    /* ── Guardar estado global ── */
    searchDone    = true;
    activeResults = result.product?.prices || [];
    lastAnalysis  = { name: result.product?.name || 'Producto', prices: activeResults, timestamp: Date.now() };

    const sub = document.getElementById('results-sub');
    if (sub) sub.textContent = `Comparación de precios: ${lastAnalysis.name}`;

    /* ── Mostrar resultados con skeleton ANTES de navegar ── */
    _resetFilters();
    showPage('results');

    // Primero mostrar skeletons de resultados
    _showResultsSkeletons(activeResults.length || 5);

    // Luego con delay corto renderizar los reales con animación
    setTimeout(() => {
      _renderApiResults(activeResults);
      showToast('¡Análisis completo!', `${activeResults.length} precio${activeResults.length!==1?'s':''} encontrado${activeResults.length!==1?'s':''}`);
    }, 600);

  } catch (err) {
    _hideAttrsAll();
    document.getElementById('attrs-placeholder').style.display = 'block';
    ['step-vision','step-search','step-compare'].forEach(s => _setProgressStep(s,''));
    showToast('Error en análisis', err.message || 'No se pudo analizar la imagen', true);
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    setTimeout(() => { progress?.classList.remove('visible'); }, 1500);
  }
};

/* ── Skeletons de tarjetas de resultado ── */
function _showResultsSkeletons(count) {
  const noState = document.getElementById('no-search-yet');
  const grid    = document.getElementById('results-grid');
  const summary = document.getElementById('results-summary');
  if (noState) noState.style.display = 'none';
  if (summary) summary.style.display = 'none';
  if (!grid)   return;
  grid.style.display = 'grid';
  grid.innerHTML = '';
  for (let i = 0; i < Math.max(count, 3); i++) {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.style.cssText = `opacity:0;transform:translateY(20px);transition:all 0.3s ease ${i*0.08}s`;
    card.innerHTML = `
      <div class="skeleton skeleton-line w40" style="height:10px"></div>
      <div class="skeleton skeleton-line h32 w80"></div>
      <div class="skeleton skeleton-line w60" style="height:10px"></div>
      <div class="skeleton skeleton-line w40" style="height:28px;border-radius:6px;margin-top:8px"></div>`;
    grid.appendChild(card);
    requestAnimationFrame(() => {
      card.style.opacity   = '1';
      card.style.transform = 'translateY(0)';
    });
  }
}

/* ── Renderizar atributos dinámicos ── */
function _renderAttrsCard(product) {
  _hideAttrsAll();
  const card = document.getElementById('attrs-card');
  const dl   = document.getElementById('attrs-dl');
  const kwList = document.getElementById('kw-list');
  if (!card || !dl) return;

  const attrs = [];
  if (product.name)     attrs.push({ dt: 'Producto',  dd: product.name });
  if (product.category) attrs.push({ dt: 'Categoría', dd: product.category });
  if (product.brand)    attrs.push({ dt: 'Marca',     dd: product.brand });
  if (product.color)    attrs.push({ dt: 'Color',     dd: product.color });
  if (!attrs.length)    attrs.push({ dt: 'Producto identificado', dd: product.name || '—' });

  dl.innerHTML = attrs.map(a => `<div class="attr-item"><dt>${a.dt}</dt><dd>${a.dd}</dd></div>`).join('');

  if (kwList) {
    const kws = product.keywords || (product.name ? product.name.toLowerCase().split(/\s+/).filter(w => w.length > 2) : []);
    kwList.innerHTML = kws.slice(0, 8).map(k => `<li class="kw">${k}</li>`).join('');
  }

  if (product.confidence !== undefined) {
    const confDiv  = document.getElementById('attrs-confidence');
    const confFill = document.getElementById('confidence-fill');
    const confPct  = document.getElementById('confidence-pct');
    if (confDiv)  confDiv.style.display = 'flex';
    if (confPct)  confPct.textContent   = Math.round(product.confidence * 100) + '%';
    setTimeout(() => { if (confFill) confFill.style.width = (product.confidence * 100) + '%'; }, 300);
  }

  card.style.display   = 'block';
  card.style.opacity   = '0';
  card.style.transform = 'translateY(12px)';
  requestAnimationFrame(() => {
    card.style.transition = 'all 0.4s ease';
    card.style.opacity    = '1';
    card.style.transform  = 'translateY(0)';
  });
}

function _setProgressStep(stepId, state) {
  const step = document.getElementById(stepId);
  if (!step) return;
  step.classList.remove('active','done');
  if (state) step.classList.add(state);
}

/* ────────────────────────────────────────────────
   RESET UPLOAD — también limpia attrs
   ──────────────────────────────────────────────── */
const _origResetUpload = resetUpload;
window.resetUpload = function() {
  _origResetUpload();
  _hideAttrsAll();
  document.getElementById('attrs-placeholder').style.display = 'block';
  document.getElementById('analysis-progress')?.classList.remove('visible');
  const btn = document.getElementById('btn-analyze');
  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  document.getElementById('results-summary')?.style.setProperty('display','none');
};

/* ────────────────────────────────────────────────
   PANTALLA DE RESULTADOS — lógica mejorada
   Si viene de búsqueda → muestra resultados
   Si no → muestra empty state CON banner si hay lastAnalysis
   ──────────────────────────────────────────────── */
function navToResults() {
  if (!fromHistory) searchDone = false;
  showPage('results');

  const noSearch    = document.getElementById('no-search-yet');
  const resultsGrid = document.getElementById('results-grid');
  const summary     = document.getElementById('results-summary');

  if (searchDone && activeResults.length > 0) {
    /* Hay resultados activos — mostrar normalmente */
    if (noSearch)    noSearch.style.display    = 'none';
    if (resultsGrid) resultsGrid.style.display = 'grid';
    _renderApiResults(activeResults);
  } else if (lastAnalysis && lastAnalysis.prices.length > 0) {
    /* Hay un análisis previo aunque no sea la sesión activa → mostrar banner de última búsqueda */
    if (noSearch)    noSearch.style.display    = 'block';
    if (resultsGrid) resultsGrid.style.display = 'none';
    _showLastAnalysisBanner();
  } else {
    /* Nunca se ha buscado nada */
    if (noSearch)    noSearch.style.display    = 'block';
    if (resultsGrid) resultsGrid.style.display = 'none';
    if (summary)     summary.style.display     = 'none';
  }
}

function _showLastAnalysisBanner() {
  const summary = document.getElementById('results-summary');
  if (!summary || !lastAnalysis) return;

  const sorted    = [...lastAnalysis.prices].sort((a,b) => a.price - b.price);
  const best      = sorted[0];
  const worst     = sorted[sorted.length - 1];
  const saving    = worst.price - best.price;
  const savingPct = Math.round((saving / worst.price) * 100);
  const bestPrice = best.price.toLocaleString('es-CO',{style:'currency',currency:best.currency||'COP',maximumFractionDigits:0});
  const timeAgo   = _timeAgo(lastAnalysis.timestamp);

  document.getElementById('summary-title').textContent = `Última búsqueda: ${lastAnalysis.name}`;
  document.getElementById('summary-sub').textContent   = `Hace ${timeAgo} · ${lastAnalysis.prices.length} tiendas · Ahorra hasta ${savingPct}%`;
  document.getElementById('summary-price').textContent = bestPrice;
  document.getElementById('summary-store').textContent = `en ${best.store?.name || 'tienda'}`;

  // Reemplazar ícono por botón "Ver comparativa"
  const existingBtn = summary.querySelector('.summary-view-btn');
  if (!existingBtn) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn-sm summary-view-btn';
    viewBtn.textContent = 'Ver comparativa →';
    viewBtn.onclick = () => {
      activeResults = lastAnalysis.prices;
      searchDone = true;
      const sub = document.getElementById('results-sub');
      if (sub) sub.textContent = `Comparación de precios: ${lastAnalysis.name}`;
      _resetFilters();
      document.getElementById('no-search-yet').style.display    = 'none';
      document.getElementById('results-grid').style.display     = 'grid';
      _renderApiResults(activeResults);
    };
    summary.appendChild(viewBtn);
  }

  summary.style.display   = 'flex';
  summary.style.opacity   = '0';
  requestAnimationFrame(() => {
    summary.style.transition = 'opacity 0.4s ease';
    summary.style.opacity    = '1';
  });
}

function _timeAgo(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'menos de un minuto';
  if (min < 60)  return `${min} minuto${min!==1?'s':''}`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)  return `${hrs} hora${hrs!==1?'s':''}`;
  return `${Math.floor(hrs/24)} día${Math.floor(hrs/24)!==1?'s':''}`;
}

/* ────────────────────────────────────────────────
   RENDER DE RESULTADOS — con banner de ahorro y
   diferencias en cada tarjeta, animación stagger
   ──────────────────────────────────────────────── */
function _renderApiResults(prices) {
  const grid    = document.getElementById('results-grid');
  const noState = document.getElementById('no-search-yet');
  const summary = document.getElementById('results-summary');
  if (!grid) return;

  if (noState) noState.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML     = '';

  if (!prices || prices.length === 0) {
    if (summary) summary.style.display = 'none';
    const msg = document.createElement('p');
    msg.setAttribute('role','status');
    msg.className = 'no-results-state';
    msg.innerHTML = '<div class="no-results-icon">🔍</div><div style="color:var(--muted);font-size:14px">No encontramos precios con los filtros aplicados.</div>';
    grid.appendChild(msg);
    return;
  }

  /* Banner de resumen */
  const sorted    = [...prices].sort((a,b) => a.price - b.price);
  const best      = sorted[0];
  const worst     = sorted[sorted.length-1];
  const saving    = worst.price - best.price;
  const savingPct = Math.round((saving / worst.price) * 100);

  if (summary && savingPct > 0) {
    const bestPrice = best.price.toLocaleString('es-CO',{style:'currency',currency:best.currency||'COP',maximumFractionDigits:0});
    document.getElementById('summary-title').textContent = `Encontramos ${prices.length} precio${prices.length!==1?'s':''} — ahorra hasta ${savingPct}%`;
    document.getElementById('summary-sub').textContent   = `Diferencia máxima: ${saving.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0})} entre tiendas`;
    document.getElementById('summary-price').textContent = bestPrice;
    document.getElementById('summary-store').textContent = `en ${best.store?.name || 'la tienda más barata'}`;
    // Eliminar botón "Ver comparativa" si existía
    summary.querySelector('.summary-view-btn')?.remove();
    summary.style.display   = 'flex';
    summary.style.opacity   = '0';
    requestAnimationFrame(() => {
      summary.style.transition = 'opacity 0.4s ease';
      summary.style.opacity    = '1';
    });
  }

  /* Tarjetas con stagger animation */
  sorted.forEach((p, i) => {
    const isBest   = i === 0;
    const diff     = p.price - best.price;
    const priceStr = p.price.toLocaleString('es-CO',{style:'currency',currency:p.currency||'COP',maximumFractionDigits:0});
    const storeName = p.store?.name || 'Tienda';

    const card = document.createElement('article');
    card.className = 'result-card' + (isBest ? ' best-deal' : '');
    card.setAttribute('role','listitem');
    card.setAttribute('tabindex','0');
    card.setAttribute('aria-label', `${storeName}: ${priceStr}${isBest?' — Mejor precio':''}`);
    card.style.cssText = 'opacity:0;transform:translateY(24px)';

    let extraHtml = '';
    if (isBest && saving > 0) {
      extraHtml = `<div class="result-saving">Ahorra ${savingPct}% vs precio más alto</div>`;
    } else if (diff > 0) {
      extraHtml = `<div class="result-price-diff">+${diff.toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0})} vs mejor precio</div>`;
    }

    card.innerHTML = `
      ${isBest ? '<div class="best-badge">✦ Mejor precio</div>' : ''}
      <div class="store-name">${storeName}</div>
      <div class="result-price${isBest?' best':''}">${priceStr}</div>
      <div class="result-meta">${p.in_stock ? '✓ En stock' : '✗ Sin stock'}</div>
      ${extraHtml}
      ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="link-btn" style="margin-top:10px;display:block">Ver en tienda ↗</a>` : ''}
    `;

    card.addEventListener('keydown', e => {
      if (e.key==='Enter'||e.key===' ') { e.preventDefault(); card.querySelector('a')?.click(); }
    });

    grid.appendChild(card);

    // Stagger con delay incremental
    setTimeout(() => {
      card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      card.style.opacity    = '1';
      card.style.transform  = 'translateY(0)';
    }, i * 90);
  });
}

/* ────────────────────────────────────────────────
   DASHBOARD con chart
   ──────────────────────────────────────────────── */
const _origLoadDashboard = _loadDashboard;
window._loadDashboard = async function() {
  await _origLoadDashboard();
  renderPriceChart(DEMO_CHART_DATA);
};