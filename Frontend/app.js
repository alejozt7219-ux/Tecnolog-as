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
    if (wantsAdmin && isAdmin) {
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
    await ApiAuth.register({ name, email, password: pass });

    // Después del registro, hacer login automático
    await ApiAuth.login(email, pass);
    currentUser = await ApiAuth.me();
    _applyUserToUI(currentUser);
    hideLoader();

    wantsAdmin = false;
    showScreen('app');
    showPage('dashboard');
    await _loadDashboard();
    setTimeout(() => showToast('¡Cuenta creada!', `Bienvenido a PriceVision, ${name.split(' ')[0]}`), 400);
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
  const greeting = document.getElementById('login-greeting');
  if (greeting) greeting.textContent = 'Hola de nuevo';
  document.getElementById('email-input') && (document.getElementById('email-input').value = '');
  document.getElementById('pass-input')  && (document.getElementById('pass-input').value  = '');
  showScreen('login');
  setTimeout(() => showToast('Modo usuario', 'Inicia sesión como usuario'), 400);
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
    const status = await ApiAdmin.getScrapingStatus();
    countTo('acnt-products', status.total_searches || 0, 1000);
    const lastExec = document.getElementById('last-execution-date');
    if (lastExec && status.last_run) {
      lastExec.textContent = new Date(status.last_run).toLocaleDateString('es-CO');
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

function deleteStore(btn, name) {
  const row = btn.closest('tr');
  if (!row) return;
  row.style.transition = 'opacity .3s,transform .3s';
  row.style.opacity    = '0';
  row.style.transform  = 'translateX(20px)';
  setTimeout(() => { row.remove(); updateStoreCounts(); }, 320);
  showToast('Tienda eliminada', `${name} fue eliminada del sistema`);
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
    await ApiAdmin.triggerScraping();
    hideLoader();
    const now = new Date();
    const lastExec = document.getElementById('last-execution-date');
    if (lastExec) lastExec.textContent = now.toLocaleDateString('es-CO');

    const tbody = document.getElementById('scraping-history-tbody');
    if (tbody) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><time>${now.toLocaleString('es-CO')}</time></td>
        <td><span class="status-badge s-green">Iniciado</span></td>
        <td style="color:var(--muted)">—</td>
        <td>0</td>
        <td style="color:var(--muted)">En proceso…</td>
        <td><button class="link-btn" onclick="showToast('Logs','Abriendo logs…')">Ver logs</button></td>
      `;
      tbody.insertBefore(row, tbody.firstChild);
    }
    showToast('Scraping iniciado', 'Las tareas fueron encoladas en Celery');
  } catch (err) {
    hideLoader();
    showToast('Error', err.message || 'No se pudo iniciar el scraping', true);
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