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
// Resultados activos — ÚNICA fuente de verdad para la pantalla Results
let activeResults  = [];
// Último análisis completado — puede mostrarse como banner en Results
let lastAnalysis   = null; // { name, prices, timestamp }

/* Limpia todo el estado de búsqueda — usar siempre antes de iniciar
   una nueva búsqueda o al borrar historial */
function _clearSearchState() {
  activeResults = [];
  searchDone    = false;
  fromHistory   = false;
  currentTaskId = null;
  lastAnalysis  = null;
}

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
      currentUser = await ApiAuth.me();
      _applyUserToUI(currentUser);
      // Navegar a la pantalla correcta según el rol
      if (currentUser.role === 'admin') {
        showScreen('admin');
        showAdminPage('overview');
      } else {
        showScreen('app');
        showPage('dashboard');
        _loadDashboard();
      }
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
  if (emailInput) emailInput.value = wantsAdmin ? (currentUser?.email || 'admin@admin.com') : '';
  if (passInput)  passInput.value  = '';
  clearFormErrors('login-form');
  showScreen('login');
}

function goAdminLogin() {
  wantsAdmin = true;
  // Si ya hay sesión activa de admin, ir directo al panel sin re-login
  if (currentUser && currentUser.role === 'admin') {
    showScreen('admin');
    showAdminPage('overview');
    _loadAdminOverview();
    setTimeout(() => showToast('Modo administrador', `Bienvenido al panel, ${currentUser.name.split(' ')[0]} 🛠️`), 400);
    return;
  }
  const greeting = document.getElementById('login-greeting');
  if (greeting) greeting.textContent = 'Hola de nuevo Admin!';
  const emailInput = document.getElementById('email-input');
  const passInput  = document.getElementById('pass-input');
  if (emailInput) emailInput.value = currentUser?.email || 'admin@admin.com';
  if (passInput)  passInput.value  = '';
  clearFormErrors('login-form');
  showScreen('login');
}

function goRegister() {
  ['reg-name','reg-email','reg-pass','reg-pass2'].forEach(id => {
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

    // Verificar si el usuario está desactivado
    if (!currentUser.is_active) {
      hideLoader();
      showFieldError('email-input', 'email-error', 'Tu usuario ha sido desactivado. Contáctanos para más información.');
      ApiAuth.logout();
      currentUser = null;
      return;
    }

    _applyUserToUI(currentUser);
    hideLoader();

    // El rol viene directamente del backend (no del email)
    const isAdmin = currentUser.role === 'admin';
    if (isAdmin) {
      showScreen('admin');
      showAdminPage('overview');
      setTimeout(() => showToast('¡Acceso autorizado!', `Bienvenido, ${currentUser.name.split(' ')[0]}`), 400);
      setTimeout(() => _addRecentActivity(`Admin ${currentUser.name} inició sesión`, 'Sesión', 's-green'), 800);
    } else {
      showScreen('app');
      showPage('dashboard');
      _loadDashboard();
      setTimeout(() => showToast('¡Bienvenido!', `Hola ${currentUser.name.split(' ')[0]} 👋`), 400);
      setTimeout(() => _addRecentActivity(`Usuario ${currentUser.name} inició sesión`, 'Sesión', 's-green'), 800);
    }
  } catch (err) {
    hideLoader();
    // Volver a la pantalla de login para que el usuario pueda reintentar
    showScreen('login');
    const msg = err.message || 'Credenciales incorrectas';
    showFieldError('email-input', 'email-error', msg);
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

  const role  = document.getElementById('reg-role')?.value         || '';
  const pass  = document.getElementById('reg-pass')?.value         || '';
  const pass2 = document.getElementById('reg-pass2')?.value        || '';

  let hasError = false;

  if (!name)  { showFieldError('reg-name',  'reg-name-error',  'El nombre es obligatorio'); hasError = true; }
  if (!email) { showFieldError('reg-email', 'reg-email-error', 'El correo es obligatorio'); hasError = true; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('reg-email', 'reg-email-error', 'Ingresa un correo válido'); hasError = true;
  }
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
      setTimeout(() => showToast('¡Cuenta creada!', `Bienvenido, ${currentUser.name.split(' ')[0]} 👑`), 400);
      setTimeout(() => _addRecentActivity(`Admin ${currentUser.name} se registró`, 'Registro', 's-green'), 800);
    } else {
      showScreen('app');
      showPage('dashboard');
      _loadDashboard();  // sin await
      setTimeout(() => showToast('¡Cuenta creada!', `Bienvenido a PriceVision, ${name.split(' ')[0]}`), 400);
      setTimeout(() => _addRecentActivity(`Nuevo usuario registrado: ${currentUser.name}`, 'Registro', 's-green'), 800);
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
  const userName = currentUser?.name || null;
  const shortName = userName?.split(' ')[0] || null;
  _addRecentActivity(`Usuario ${userName || 'desconocido'} cerró sesión`, 'Sesión', 's-yellow');
  ApiAuth.logout();
  currentUser = null;
  currentFile = null;
  wantsAdmin  = false;
  _clearSearchState();
  if (typeof _dashboardPollTimer !== 'undefined' && _dashboardPollTimer) {
    clearTimeout(_dashboardPollTimer); _dashboardPollTimer = null;
  }
  resetUpload(true);
  showPage('dashboard');
  showScreen('landing');
  if (shortName) {
    setTimeout(() => showToast('¡Hasta pronto! 👋', `Vuelve pronto, ${shortName} 🚀`), 300);
  } else {
    setTimeout(() => showToast('¡Hasta pronto! 👋', 'Vuelve pronto 🚀'), 300);
  }
}

function adminLogout() {
  const userName = currentUser?.name || null;
  const shortName = userName?.split(' ')[0] || null;
  _addRecentActivity(`Admin ${userName || 'desconocido'} cerró sesión`, 'Sesión', 's-yellow');
  ApiAuth.logout();
  currentUser = null;
  wantsAdmin  = false;
  showScreen('landing');
  if (shortName) {
    setTimeout(() => showToast('¡Hasta pronto! 👋', `Vuelve pronto, ${shortName} 🚀`), 300);
  } else {
    setTimeout(() => showToast('¡Hasta pronto! 👋', 'Vuelve pronto 🚀'), 300);
  }
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
  if (name === 'profile') _loadProfileStats();
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

  // Siempre recargar datos reales desde BD al navegar a cualquier sección
  if (name === 'overview')  _loadAdminOverview();
  if (name === 'tiendas')   _loadAdminStores();
  if (name === 'usuarios')  _loadAdminUsers();
  if (name === 'scraping')  _loadAdminScraping();
}

/* ── Botones "Ver Detalles" del historial del dashboard ── */
/* goResults — delegado a la versión canónica definida más adelante */


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

/* processImage y resetUpload — definiciones canónicas más abajo (con _clearSearchState) */

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

/* analyzePrice — la versión canónica está declarada como window.analyzePrice más abajo */
function analyzePrice() {
  if (typeof window.analyzePrice === 'function' && window.analyzePrice !== analyzePrice) {
    return window.analyzePrice();
  }
  showToast('Error', 'Función de análisis no disponible aún', true);
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

/* Polling continuo: reintenta hasta que haya resultados 'done' o se agoten los intentos.
   Intervalo progresivo: 4s, 6s, 8s, 10s, 10s, 10s… (máx 20 intentos ≈ ~3min) */
let _dashboardPollTimer = null;
function _startDashboardPolling(attempt = 0) {
  if (_dashboardPollTimer) return; // ya hay un poll activo
  const MAX_ATTEMPTS = 20;
  if (attempt >= MAX_ATTEMPTS) return;
  const delay = Math.min(4000 + attempt * 2000, 10000);
  _dashboardPollTimer = setTimeout(async () => {
    _dashboardPollTimer = null;
    try {
      const completedStates = ['done', 'success', 'completed'];
      const [userHistory, globalHistory] = await Promise.all([
        ApiScan.getHistory(1, 100).catch(() => []),
        ApiScan.getGlobalHistory(1, 10).catch(() => []),
      ]);
      const userDone = (userHistory || []).filter(
        h => h.product && completedStates.includes(String(h.status || '').toLowerCase())
      );
      const globalDone = (globalHistory || []).filter(
        h => h.product && completedStates.includes(String(h.status || '').toLowerCase())
      );
      if (globalDone.length > 0) {
        _renderDashboardHistory(_mergeDashboardHistory(globalDone));
        countTo('cnt-products', userDone.length, 400);
        const ops = userDone.filter(h => (h.product?.prices?.length || 0) > 1).length;
        countTo('cnt-ops', ops, 400);
        localStorage.setItem('pv-dashboard-history', JSON.stringify(globalDone));
      } else {
        _startDashboardPolling(attempt + 1);
      }
    } catch (_) {
      _startDashboardPolling(attempt + 1);
    }
  }, delay);
}

async function _loadDashboard() {
  // Cancelar cualquier poll anterior al cargar el dashboard
  if (_dashboardPollTimer) { clearTimeout(_dashboardPollTimer); _dashboardPollTimer = null; }
  try {
    // getHistory: solo las búsquedas del usuario actual (imagen + manual)
    // getGlobalHistory: todo (para la tabla del historial que incluye predeterminados del admin)
    const [userHistory, globalHistory] = await Promise.all([
      ApiScan.getHistory(1, 100).catch(() => []),
      ApiScan.getGlobalHistory(1, 30).catch(() => []),
    ]);

    // cnt-products = búsquedas propias completadas del usuario
    const completedStates = ['done', 'success', 'completed'];
    const userDone = (userHistory || []).filter(
      h => h.product && completedStates.includes(String(h.status || '').toLowerCase())
    );
    countTo('cnt-products', userDone.length, 800);

    // Tabla del dashboard = historial global (propias + admin predeterminados)
    const globalDone = (globalHistory || []).filter(
      h => h.product && completedStates.includes(String(h.status || '').toLowerCase())
    );
    if (globalDone.length) {
      _renderDashboardHistory(_mergeDashboardHistory(globalDone));
    } else if (userDone.length) {
      _renderDashboardHistory(_mergeDashboardHistory(userDone));
    } else {
      _renderDashboardFromCache();
      _startDashboardPolling(0);
    }

    countTo('cnt-stores', 5, 600);
    // Oportunidades = búsquedas propias con más de 1 precio
    const ops = userDone.filter(h => (h.product?.prices?.length || 0) > 1).length;
    countTo('cnt-ops', ops, 600);
  } catch (err) {
    _renderDashboardFromCache();
    countTo('cnt-products', 0, 600);
    countTo('cnt-stores', 5, 600);
    countTo('cnt-ops', 0, 600);
  }
}

/* Lanza búsquedas por texto de los 5 productos demo en background */
async function _triggerDemoSearches() {
  const DEMO_QUERIES = [
    'Nike Air Max 90',
    'Auriculares Sony WH-CH520',
    'Mochila portatil impermeable',
    'Samsung Galaxy Watch6',
    'Cafetera Nespresso',
  ];
  // Lanzar los 5 en paralelo sin bloquear la UI
  const taskIds = [];
  for (const q of DEMO_QUERIES) {
    try {
      const res = await ApiScan.searchByText(q);
      if (res?.task_id) taskIds.push(res.task_id);
    } catch (_) { /* ignorar errores individuales */ }
  }
  if (taskIds.length === 0) return;
  // Esperar ~15s y refrescar el dashboard con los resultados reales
  setTimeout(() => _refreshDashboardIfReady(), 15000);
}

/* Mezcla inteligente: primero búsquedas del usuario, luego predeterminados del admin para rellenar */
function _mergeDashboardHistory(items, maxRows = 10) {
  // Deduplicar por nombre de producto — quedarse solo con la entrada más reciente de cada uno
  // (items ya viene ordenado por created_at desc desde el backend)
  const seenNames = new Set();
  const deduped = [];
  for (const h of items) {
    const name = (h.product?.name || h.query || '').toLowerCase().trim();
    if (!seenNames.has(name)) {
      seenNames.add(name);
      deduped.push(h);
    }
  }
  // Separar búsquedas del usuario y predeterminados del admin
  const userItems  = deduped.filter(h => !h.triggered_by_admin);
  const adminItems = deduped.filter(h =>  h.triggered_by_admin);

  // SIEMPRE primero las del usuario (todas, hasta maxRows)
  // luego rellenar con predeterminados del admin si sobran filas
  const merged = [...userItems.slice(0, maxRows)];
  const usedNames = new Set(merged.map(h => (h.product?.name || h.query || '').toLowerCase().trim()));

  for (const a of adminItems) {
    if (merged.length >= maxRows) break;
    const name = (a.product?.name || a.query || '').toLowerCase().trim();
    if (!usedNames.has(name)) {
      merged.push(a);
      usedNames.add(name);
    }
  }
  return merged;
}

/* Refresca el dashboard solo si ya hay resultados completados */
async function _refreshDashboardIfReady() {
  try {
    const history = await ApiScan.getGlobalHistory(1, 10);

    console.log('Historial recibido:', history);

    // Estados válidos de finalización
    const completedStates = ['done', 'success', 'completed'];

    // Filtrar solo productos terminados
    const done =
      history?.filter(
        h =>
          h.product &&
          completedStates.includes(
            String(h.status || '').toLowerCase()
          )
      ) || [];

    console.log('Productos completados:', done);

    // =========================
    // SI HAY HISTORIAL REAL
    // =========================
    if (done.length > 0) {

      // Renderizar historial real
      _renderDashboardHistory(_mergeDashboardHistory(done));

      // Actualizar contador
      countTo('cnt-products', done.length, 400);

      // Guardar cache local
      localStorage.setItem(
        'pv-dashboard-history',
        JSON.stringify(done)
      );

      return;
    }

    // =========================
    // FALLBACK A CACHE / DEMO
    // =========================
    console.warn('No hay historial terminado. Usando cache demo.');

    _renderDashboardFromCache();

    countTo(
      'cnt-products',
      Object.keys(CACHED_PRICES || {}).length,
      400
    );

  } catch (err) {

    console.error(
      'Error refrescando dashboard:',
      err
    );

    // =========================
    // FALLBACK SI TODO FALLA
    // =========================
    _renderDashboardFromCache();

    countTo(
      'cnt-products',
      Object.keys(CACHED_PRICES || {}).length,
      400
    );
  }
}

function _renderDashboardFromCache() {
  const tableWrap = document.querySelector('#page-dashboard .table-wrap');
  if (!tableWrap) return;
  const tbody = tableWrap.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  Object.entries(CACHED_PRICES).forEach(([key, data]) => {
    const tr = document.createElement('tr');
    const bestPrice = data.prices?.length
      ? Math.min(...data.prices.map(p => p.price)).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
      : '—';
    const storeCount = data.prices?.length || '—';
    const today = new Date().toLocaleDateString('es-CO');
    tr.innerHTML = `
      <td>${data.name}</td>
      <td><time>${today}</time></td>
      <td class="price-val">${bestPrice}</td>
      <td>${storeCount} tiendas</td>
      <td><button class="link-btn" onclick="goResultsFromHistory(${JSON.stringify(data.prices).replace(/"/g, '&quot;')}, '${data.name.replace(/'/g, "\'")}')">Ver Detalles</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* Actualiza la tabla de búsquedas recientes del dashboard — 5 visibles + "Ver más" hasta 10 */
function _renderDashboardHistory(items) {
  const tableWrap = document.querySelector('#page-dashboard .table-wrap');
  if (!tableWrap) return;
  const tbody = tableWrap.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const VISIBLE = 5;
  const visible = items.slice(0, VISIBLE);
  const hidden  = items.slice(VISIBLE, 10);

  function makeRow(item, isHidden) {
    const tr = document.createElement('tr');
    if (isHidden) { tr.className = 'dashboard-extra'; tr.style.display = 'none'; }
    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString('es-CO');
    const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const bestPrice = item.product?.prices?.length
      ? Math.min(...item.product.prices.map(p => p.price)).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
      : '—';
    const storeCount = item.product?.prices?.length || '—';
    const productName = item.product?.name || item.query;
    const tag = item.triggered_by_admin
      ? '<span style="font-size:10px;color:var(--muted);margin-left:6px;opacity:.7">predeterminado</span>'
      : '';
    tr.innerHTML = `
      <td>${productName}${tag}</td>
      <td><time datetime="${date.toISOString()}">${dateStr} ${timeStr}</time></td>
      <td class="price-val">${bestPrice}</td>
      <td>${storeCount} tienda${storeCount !== 1 ? 's' : ''}</td>
      <td><button class="link-btn" onclick="goResultsFromHistory(${JSON.stringify(item.product?.prices || []).replace(/"/g, '&quot;')}, '${productName.replace(/'/g, "\\'")}')">Ver Detalles</button></td>
    `;
    tbody.appendChild(tr);
  }

  visible.forEach(item => makeRow(item, false));
  hidden.forEach(item  => makeRow(item, true));

  // Botón "Ver más / Ver menos"
  const existingBtn = document.getElementById('dashboard-ver-mas-btn');
  if (existingBtn) existingBtn.remove();

  if (hidden.length > 0) {
    const btnRow = document.createElement('tr');
    btnRow.id = 'dashboard-ver-mas-btn';
    btnRow.innerHTML = `<td colspan="5" style="text-align:center;padding:10px 0">
      <button class="link-btn" id="btn-ver-mas-dashboard"
        style="font-size:12px;padding:5px 16px;border:1px solid var(--border);border-radius:6px;color:var(--muted)">
        Ver más (${hidden.length})
      </button>
    </td>`;
    tbody.appendChild(btnRow);
    document.getElementById('btn-ver-mas-dashboard').addEventListener('click', function() {
      const extras  = document.querySelectorAll('#page-dashboard .dashboard-extra');
      const showing = extras[0] && extras[0].style.display !== 'none';
      extras.forEach(r => r.style.display = showing ? 'none' : '');
      this.textContent = showing ? `Ver más (${hidden.length})` : 'Ver menos';
    });
  }
}

/* Muestra resultados de un ítem del historial */
function goResultsFromHistory(prices, productName) {
  // Limpiar estado anterior antes de cargar nuevos resultados
  activeResults = Array.isArray(prices) ? prices : [];
  searchDone    = true;
  fromHistory   = true;
  if (typeof lastAnalysis !== 'undefined') lastAnalysis = null;
  _resetFilters();
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

async function _loadProfileStats() {
  try {
    const history = await ApiScan.getGlobalHistory(1, 100);
    const doneItems = (history || []).filter(h => h.status === 'done');
    const totalSearches = history?.length || 0;
    // Oportunidades = búsquedas con más de 1 precio encontrado
    const opportunities = doneItems.filter(h => (h.product?.prices?.length || 0) > 1).length;
    // Ahorro estimado = suma de (precio_max - precio_min) de cada búsqueda con precios
    let totalSaving = 0;
    doneItems.forEach(h => {
      const prices = h.product?.prices?.map(p => p.price) || [];
      if (prices.length > 1) {
        totalSaving += Math.max(...prices) - Math.min(...prices);
      }
    });
    const savingStr = totalSaving >= 1000000
      ? `$${(totalSaving/1000000).toFixed(1)}M`
      : totalSaving >= 1000
        ? `$${Math.round(totalSaving/1000)}k`
        : `$${totalSaving.toLocaleString('es-CO')}`;

    const statsVals = document.querySelectorAll('#page-profile .stats-row .val');
    if (statsVals[0]) { statsVals[0].textContent = totalSearches; }
    if (statsVals[1]) { statsVals[1].textContent = opportunities; }
    if (statsVals[2]) { statsVals[2].textContent = savingStr || '$0'; }
  } catch (_) {
    // Si falla la API, dejar los valores que había
  }
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
  // Deduplicar por nombre — mostrar solo la primera ocurrencia
  const seen = new Set();
  stores = stores.filter(s => {
    const key = s.name.toLowerCase().replace(/\s/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  stores.forEach(store => {
    const row = document.createElement('tr');
    row.dataset.storeId = store.id;
    row.dataset.custom  = 'false';
    const sc   = store.is_active ? 's-green' : 's-red';
    const st   = store.is_active ? 'Activo'  : 'Inactivo';
    const safeN = store.name.replace(/'/g, "\\'");
    row.innerHTML = `
      <td style="font-weight:500">${store.name}</td>
      <td style="color:var(--muted);font-size:12px">${(() => { try { const u = new URL(store.base_url); return u.origin; } catch(_) { return store.base_url; } })()}</td>
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
      <td>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px">
          <label class="toggle" style="background:var(--card2);padding:4px 8px;border-radius:8px;border:1px solid var(--border)" aria-label="Activar o desactivar a ${user.name}">
            <input type="checkbox" role="switch" aria-checked="${user.is_active}" ${user.is_active ? 'checked' : ''}
              onchange="toggleUser(this,'${safeN}');this.setAttribute('aria-checked',this.checked)">
            <span class="toggle-slider" aria-hidden="true"></span>
          </label>
          <button class="icon-btn icon-btn--danger" data-tooltip="Eliminar usuario" aria-label="Eliminar usuario" onclick="deleteUser(this,'${safeN}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Actualizar las tarjetas de stats (antes hardcodeadas)
  const total   = users.length;
  const active  = users.filter(u => u.is_active).length;
  const admins  = users.filter(u => u.role === 'admin').length;
  const analysts = users.filter(u => u.role !== 'admin').length;
  const statsCards = document.querySelectorAll('#admin-page-usuarios .stats-grid .stat-val');
  if (statsCards[0]) statsCards[0].textContent = total;
  if (statsCards[1]) statsCards[1].textContent = active;
  if (statsCards[2]) statsCards[2].textContent = admins;
  if (statsCards[3]) statsCards[3].textContent = analysts;
}

/* FIX: carga scraping logs reales */
async function _loadAdminScraping() {
  try {
    const history = await ApiAdmin.getScrapingHistory(1);
    if (history?.length) {
      _renderScrapingHistory(history);
      _updateScrapingStatCards(history);
    } else {
      const logs = await ApiAdmin.getScrapingLogs(1).catch(() => []);
      if (logs?.length) _renderScrapingLogs(logs);
    }
  } catch (_) {}
}

/* Actualiza las tarjetas de stats de scraping (overview + sección scraping)
   a partir del historial real — sin depender del campo data.scraping del overview */
function _updateScrapingStatCards(history) {
  if (!history?.length) return;

  // La entrada más reciente (el historial ya viene ordenado desc desde el backend)
  const latest = history[0];
  const latestDate = new Date(latest.created_at);
  const isDone = latest.status === 'done';
  const isError = latest.status === 'error';
  const sc = isDone ? 's-green' : isError ? 's-red' : 's-yellow';
  const st = isDone ? 'Completado' : isError ? 'Error' : 'En proceso';

  // ── Sección Scraping ──
  const lastExecDate = document.getElementById('last-execution-date');
  const lastExecStatus = document.getElementById('last-execution-status');
  if (lastExecDate) lastExecDate.textContent = latestDate.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  if (lastExecStatus) { lastExecStatus.textContent = st; lastExecStatus.className = `status-badge ${sc}`; }

  // Productos hoy = entradas 'done' cuya fecha sea hoy
  const todayStr = new Date().toLocaleDateString('es-CO');
  const todayDone = history.filter(h => {
    if (h.status !== 'done') return false;
    return new Date(h.created_at).toLocaleDateString('es-CO') === todayStr;
  });
  const productsToday = todayDone.reduce((sum, h) => sum + (h.product?.prices?.length || 0), 0);
  const scrapingProductsToday = document.getElementById('scraping-products-today');
  if (scrapingProductsToday) scrapingProductsToday.textContent = productsToday || '—';

  // ── Overview ──
  const acntLastExec = document.getElementById('acnt-last-exec');
  const acntLastStatus = document.getElementById('acnt-last-status');
  if (acntLastExec) acntLastExec.textContent = latestDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (acntLastStatus) { acntLastStatus.textContent = st; acntLastStatus.className = `status-badge ${sc}`; }

  // Productos normalizados = total de precios en entradas done
  const totalPrices = history.filter(h => h.status === 'done')
    .reduce((sum, h) => sum + (h.product?.prices?.length || 0), 0);
  const acntProducts = document.getElementById('acnt-products');
  if (acntProducts && totalPrices > 0) acntProducts.textContent = totalPrices;

  // ── Tiendas: Productos totales ──
  const storeProductsTotal = document.getElementById('store-products-total');
  if (storeProductsTotal) storeProductsTotal.textContent = totalPrices || '—';
}

function _renderScrapingHistory(items) {
  const tbody = document.getElementById('scraping-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const VISIBLE = 5;
  const visible = items.slice(0, VISIBLE);
  const hidden  = items.slice(VISIBLE, VISIBLE + 10);

  function makeRow(item, hidden) {
    const tr = document.createElement('tr');
    if (hidden) { tr.className = 'history-extra'; tr.style.display = 'none'; }
    const sc = item.status === 'done' ? 's-green' : item.status === 'error' ? 's-red' : 's-yellow';
    const st = item.status === 'done' ? 'Completado' : item.status === 'error' ? 'Error' : 'En proceso';
    const dateStr = new Date(item.created_at).toLocaleString('es-CO');
    const source = item.triggered_by_admin ? 'Admin' : 'Usuario';
    tr.innerHTML = `
      <td><time>${dateStr}</time></td>
      <td><span class="status-badge ${sc}">${st}</span></td>
      <td style="color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.query || '—'}</td>
      <td>—</td>
      <td style="color:var(--muted);font-size:11px">${source}</td>
      <td><button class="link-btn" onclick="openScrapingResultModal(this)">Ver</button></td>
    `;
    // Guardar datos del item en el botón para recuperarlos en el modal
    tr.querySelector('.link-btn').dataset.item = JSON.stringify(item);
    tbody.appendChild(tr);
  }

  visible.forEach(item => makeRow(item, false));
  hidden.forEach(item  => makeRow(item, true));

  const existing = document.getElementById('scraping-ver-mas-btn');
  if (existing) existing.remove();
  if (hidden.length > 0) {
    const btnRow = document.createElement('tr');
    btnRow.id = 'scraping-ver-mas-btn';
    const count = hidden.length;
    btnRow.innerHTML = '<td colspan="6" style="text-align:center;padding:10px 0"><button class="link-btn" id="btn-ver-mas-scraping" style="font-size:13px;padding:6px 18px;border:1px solid var(--border);border-radius:6px">Ver más (' + count + ')</button></td>';
    tbody.appendChild(btnRow);
    document.getElementById('btn-ver-mas-scraping').addEventListener('click', function() {
      const extras = document.querySelectorAll('#scraping-history-tbody .history-extra');
      const showing = extras[0] && extras[0].style.display !== 'none';
      extras.forEach(r => r.style.display = showing ? 'none' : '');
      this.textContent = showing ? 'Ver más (' + count + ')' : 'Ver menos';
    });
  }
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
/* Agrega una fila al tope de Actividad Reciente en el overview */
function _addRecentActivity(desc, tipo, statusClass) {
  const tbody = document.querySelector('#admin-page-overview .table-wrap tbody');
  if (!tbody) return;
  const now = new Date().toLocaleString('es-CO');
  const statusHtml = statusClass
    ? `<span class="status-badge ${statusClass}">${statusClass === 's-green' ? 'Exitoso' : statusClass === 's-red' ? 'Error' : statusClass === 's-yellow' ? 'En proceso' : 'Aviso'}</span>`
    : '<span style="color:var(--muted)">—</span>';
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><div class="act-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div></td>
    <td>${desc}</td>
    <td style="color:var(--muted)">${tipo}</td>
    <td style="color:var(--muted)"><time>${now}</time></td>
    <td>${statusHtml}</td>
  `;
  tbody.insertBefore(row, tbody.firstChild);
  // Mantener máx 10 filas
  while (tbody.rows.length > 10) tbody.deleteRow(tbody.rows.length - 1);
}

async function _loadAdminOverview() {
  try {
    // Timeout de seguridad: si el backend no responde en 8s, no bloquear la UI
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));

    // Cargar overview y stores en paralelo — stores es la fuente de verdad para los conteos
    const [data, logs, stores] = await Promise.race([
      Promise.all([
        ApiAdmin.getOverview(),
        ApiAdmin.getScrapingHistory(1).catch(() => ApiAdmin.getScrapingLogs(1).catch(() => [])),
        ApiAdmin.getStores().catch(() => null),
      ]),
      timeout.then(() => { throw new Error('timeout'); }),
    ]);

    countTo('acnt-products',  data.searches?.total    || 0, 1000);
    countTo('acnt-users',     data.users?.total        || 0, 1000);
    countTo('acnt-completed', data.searches?.completed || 0, 1000);

    // Usar conteo REAL de tiendas (igual que Gestión de Tiendas)
    const totalStores  = stores ? stores.length : (data.stores?.total  || 0);
    const activeStores = stores ? stores.filter(s => s.is_active).length : (data.stores?.active || 0);

    const storesRatio = document.getElementById('acnt-stores-ratio');
    if (storesRatio) storesRatio.textContent = `${activeStores}/${totalStores}`;

    const lastExecCard = document.getElementById('acnt-last-exec');
    if (lastExecCard && data.scraping?.last_run) {
      lastExecCard.textContent = new Date(data.scraping.last_run).toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'});
    }
    const lastStatusCard = document.getElementById('acnt-last-status');
    if (lastStatusCard && data.scraping?.last_status) {
      const isDone = data.scraping.last_status === 'done';
      lastStatusCard.textContent = isDone ? 'Completado' : 'Error';
      lastStatusCard.className = `status-badge ${isDone ? 's-green' : 's-red'}`;
    }
    const errCard = document.getElementById('acnt-errors');
    if (errCard) errCard.textContent = data.scraping?.error_count ?? '—';

    const lastExec = document.getElementById('last-execution-date');
    if (lastExec && data.scraping?.last_run) {
      lastExec.textContent = new Date(data.scraping.last_run).toLocaleDateString('es-CO');
    }

    // Actualizar tarjetas de scraping con historial real (sobreescribe data.scraping si hay datos frescos)
    if (logs?.length) _updateScrapingStatCards(logs);

    // Tabla de actividad reciente — persistente desde BD
    const tbody = document.querySelector('#admin-page-overview .table-wrap tbody');
    if (tbody && logs?.length) {
      tbody.innerHTML = '';
      const overviewVisible = logs.slice(0, 5);
      const overviewHidden  = logs.slice(5, 15);
      const renderOverviewRow = (item, hidden) => {
        const isHistory = 'query' in item;
        const sc = (isHistory ? item.status === 'done' : item.status === 'success') ? 's-green'
                 : (item.status === 'error') ? 's-red' : 's-yellow';
        const st = sc === 's-green' ? 'Exitoso' : sc === 's-red' ? 'Error' : 'En proceso';
        const desc = isHistory
          ? (item.triggered_by_admin ? `Scraping manual: ${item.query}` : `Búsqueda usuario: ${item.query}`)
          : `Scraping automático completado`;
        const dateStr = new Date(item.created_at).toLocaleString('es-CO');
        const tr = document.createElement('tr');
        if (hidden) { tr.className = 'overview-extra'; tr.style.display = 'none'; }
        tr.innerHTML = `
          <td><div class="act-icon" aria-hidden="true"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div></td>
          <td>${desc}</td>
          <td style="color:var(--muted)">${isHistory ? (item.triggered_by_admin ? 'Admin' : 'Usuario') : 'Scraping'}</td>
          <td style="color:var(--muted)"><time>${dateStr}</time></td>
          <td><span class="status-badge ${sc}">${st}</span></td>`;
        tbody.appendChild(tr);
      };
      overviewVisible.forEach(item => renderOverviewRow(item, false));
      overviewHidden.forEach(item  => renderOverviewRow(item, true));
      const existingOvBtn = document.getElementById('overview-ver-mas-btn');
      if (existingOvBtn) existingOvBtn.remove();
      if (overviewHidden.length > 0) {
        const count = overviewHidden.length;
        const btnRow = document.createElement('tr');
        btnRow.id = 'overview-ver-mas-btn';
        btnRow.innerHTML = '<td colspan="5" style="text-align:center;padding:10px 0"><button class="link-btn" id="btn-ver-mas-overview" style="font-size:13px;padding:6px 18px;border:1px solid var(--border);border-radius:6px">Ver más (' + count + ')</button></td>';
        tbody.appendChild(btnRow);
        document.getElementById('btn-ver-mas-overview').addEventListener('click', function() {
          const extras = document.querySelectorAll('#admin-page-overview .table-wrap tbody .overview-extra');
          const showing = extras[0] && extras[0].style.display !== 'none';
          extras.forEach(r => r.style.display = showing ? 'none' : '');
          this.textContent = showing ? 'Ver más (' + count + ')' : 'Ver menos';
        });
      }
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

async function toggleStore(el, name) {
  const row     = el.closest('tr');
  const storeId = row?.dataset.storeId;
  const on      = el.checked;
  // Revertir visualmente hasta confirmar backend
  el.disabled = true;
  try {
    if (storeId) await ApiAdmin.toggleStore(storeId);
    const badge = row?.querySelector('.status-badge');
    if (badge) { badge.className = 'status-badge ' + (on ? 's-green' : 's-red'); badge.textContent = on ? 'Activo' : 'Inactivo'; }
    // Persistir estado en el dataset para que al recargar quede correcto
    row.dataset.active = on ? 'true' : 'false';
    updateStoreCounts();
    // Actualizar card de tiendas activas en overview usando la lista real
    const stores = await ApiAdmin.getStores().catch(() => null);
    if (stores) {
      const activeCount = stores.filter(s => s.is_active).length;
      const ratio = document.getElementById('acnt-stores-ratio');
      if (ratio) ratio.textContent = `${activeCount}/${stores.length}`;
    }
    showToast('Tienda actualizada', `${name} marcada como ${on ? 'activa' : 'inactiva'}`);
    _addRecentActivity(`Tienda ${name} marcada como ${on ? 'Activa' : 'Inactiva'}`, 'Tienda', on ? 's-green' : 's-red');
  } catch (err) {
    // Revertir checkbox si falla
    el.checked = !on;
    showToast('Error', err.message || 'No se pudo actualizar la tienda', true);
  } finally {
    el.disabled = false;
  }
}

/* ── Admin: toggle usuario REAL ─────────────────── */
async function deleteUser(btn, name) {
  if (!confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return;
  const tr = btn.closest('tr');
  const userId = tr?.dataset.userId;
  if (!userId) return;
  try {
    await ApiAdmin.deleteUser(userId);
    tr.style.transition = 'opacity .3s,transform .3s';
    tr.style.opacity = '0';
    tr.style.transform = 'translateX(20px)';
    setTimeout(() => tr.remove(), 320);
    showToast('Usuario eliminado', `${name} fue eliminado del sistema`);
    _addRecentActivity(`Usuario ${name} eliminado`, 'Usuario', 's-red');
  } catch (err) {
    showToast('Error', err.message || 'No se pudo eliminar', true);
  }
}

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
    _addRecentActivity(`Usuario ${name} ${el.checked ? 'activado' : 'desactivado'}`, 'Usuario', el.checked ? 's-green' : 's-yellow');
  } catch (err) {
    el.checked = !el.checked; // revertir si falla
    showToast('Error', err.message, true);
  }
}

/* ── Re-scraping de productos predeterminados ─────── */
// Polling de la tabla de scraping admin hasta que todos los tasks terminen
let _scrapingTablePollTimer = null;
function _startScrapingTablePolling(taskIds, attempt = 0) {
  if (_scrapingTablePollTimer) { clearTimeout(_scrapingTablePollTimer); _scrapingTablePollTimer = null; }
  if (attempt > 30 || !taskIds.length) return; // máx ~2min
  const delay = Math.min(3000 + attempt * 1000, 8000);
  _scrapingTablePollTimer = setTimeout(async () => {
    _scrapingTablePollTimer = null;
    try {
      // Revisar cuántos de los tasks ya terminaron
      const checks = await Promise.allSettled(taskIds.map(id => apiFetch('/results/' + id)));
      const pending = checks.filter(r =>
        r.status === 'fulfilled' && !['done','error'].includes(r.value?.status)
      );
      // Refrescar la tabla siempre (muestra progreso)
      await _loadAdminScraping();
      if (pending.length > 0) {
        // Todavía hay tasks en proceso — seguir polling
        _startScrapingTablePolling(taskIds, attempt + 1);
      } else {
        // Todos terminaron — toast final y actualizar dashboard
        showToast('Re-scraping completado', 'Todos los productos predeterminados actualizados ✅');
        _addRecentActivity('Re-scraping de predeterminados completado', 'Admin', 's-green');
        if (_dashboardPollTimer) { clearTimeout(_dashboardPollTimer); _dashboardPollTimer = null; }
        _startDashboardPolling(0);
      }
    } catch (_) {
      _startScrapingTablePolling(taskIds, attempt + 1);
    }
  }, delay);
}

async function rerunDemoScraping() {
  showLoader('Re-scrapeando productos predeterminados…');
  const DEMO_QUERIES = [
    'Nike Air Max 90',
    'Auriculares Sony WH-CH520',
    'Mochila portatil impermeable',
    'Samsung Galaxy Watch6',
    'Cafetera Nespresso',
  ];
  const taskIds = [];
  for (const q of DEMO_QUERIES) {
    try {
      const res = await ApiAdmin.triggerScraping(q);
      if (res?.task_id) taskIds.push(res.task_id);
    } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  }
  hideLoader();
  showToast('Re-scraping iniciado', taskIds.length + '/' + DEMO_QUERIES.length + ' productos encolados 🔄');
  _addRecentActivity('Re-scraping de productos predeterminados', 'Admin', 's-yellow');
  // Refrescar tabla inmediatamente para mostrar los nuevos items en "En proceso"
  setTimeout(() => _loadAdminScraping(), 1000);
  // Arrancar polling que actualiza la tabla y notifica cuando todo termina
  _startScrapingTablePolling(taskIds);
}

/* ── Admin: scraping manual REAL ─────────────────── */
async function resetDemoProducts() {
  if (!confirm('¿Eliminar el historial de scraping manual? Esta acción no se puede deshacer.')) return;
  showLoader('Limpiando historial…');
  try {
    await ApiAdmin.resetDemoProducts();
    hideLoader();
    showToast('Historial limpiado', 'El historial de scraping manual fue eliminado');
    _addRecentActivity('Historial de scraping manual eliminado', 'Admin', 's-yellow');
    await _loadAdminScraping();
  } catch (err) {
    hideLoader();
    showToast('Error', err.message || 'No se pudo limpiar el historial', true);
  }
}

async function runScrapingAdmin() {
  const query = prompt('¿Qué producto deseas scrapear?', '');
  if (!query || !query.trim()) return;
  showLoader('Ejecutando scraping manual…');
  try {
    const res = await ApiAdmin.triggerScraping(query.trim());
    hideLoader();
    const now = new Date();

    // Actualizar fecha en el panel admin
    const lastExec = document.getElementById('last-execution-date');
    if (lastExec) lastExec.textContent = now.toLocaleDateString('es-CO');

    // Agregar fila al historial de scraping del admin
    const tbody = document.getElementById('scraping-history-tbody');
    const startTime = Date.now();
    if (tbody) {
      const row = document.createElement('tr');
      row.dataset.taskId = res.task_id;
      row.innerHTML = `
        <td><time>${now.toLocaleString('es-CO')}</time></td>
        <td><span class="status-badge s-yellow">En proceso…</span></td>
        <td style="color:var(--muted)">${res.query || '—'}</td>
        <td>—</td>
        <td style="color:var(--muted)">—</td>
        <td><button class="link-btn" onclick="showToast('Logs','Abriendo logs…')">Ver logs</button></td>
      `;
      tbody.insertBefore(row, tbody.firstChild);
    }
    window._scrapingStartTimes = window._scrapingStartTimes || {};
    window._scrapingStartTimes[res.task_id] = startTime;

    showToast('Scraping iniciado', `Buscando: ${res.query || 'producto demo'} 🔍`);
    _addRecentActivity(`Scraping manual iniciado: ${res.query || 'producto demo'}`, 'Scraping', 's-yellow');

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
      // Actualizar la fila de la tabla de scraping admin con duración real
      const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
      if (row) {
        const startTime = window._scrapingStartTimes?.[taskId] || Date.now();
        const durSecs = Math.round((Date.now() - startTime) / 1000);
        const durStr = durSecs >= 60 ? `${Math.floor(durSecs/60)}m ${durSecs%60}s` : `${durSecs}s`;
        const priceCount = result.product?.prices?.length || 0;
        row.cells[1].innerHTML = '<span class="status-badge s-green">Completado</span>';
        row.cells[3].textContent = priceCount;
        row.cells[4].textContent = durStr;
      }
      // Recargar historial global — incluye el scraping del admin recién terminado
      const history = await ApiScan.getGlobalHistory(1, 10);
      const done = history?.filter(h => h.product && h.status === 'done') || [];
      if (done.length) _renderDashboardHistory(_mergeDashboardHistory(done));
      // Refrescar tarjetas de stats con el historial actualizado
      try {
        const fullHistory = await ApiAdmin.getScrapingHistory(1);
        if (fullHistory?.length) _updateScrapingStatCards(fullHistory);
      } catch (_) {}
      showToast('¡Listo!', `Precios de "${result.product?.name || taskId}" actualizados 🎉`);
      return;
    }
    if (result.status === 'error') {
      const row = document.querySelector(`tr[data-task-id="${taskId}"]`);
      if (row) row.cells[1].innerHTML = '<span class="status-badge s-red">Error</span>';
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
  // Miembro desde — usar created_at real del usuario
  const memberSince = document.getElementById('member-since');
  if (memberSince && user.created_at) {
    const year = new Date(user.created_at).getFullYear();
    memberSince.textContent = `Miembro desde ${year}`;
  }
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
      { store: { name: 'Falabella'     }, price: 289990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co/falabella-co/search?Ntt=Nike+Air+Max' },
      { store: { name: 'Mercado Libre' }, price: 265000, currency: 'COP', in_stock: true,  url: 'https://listado.mercadolibre.com.co/Nike-Air-Max' },
      { store: { name: 'Éxito'         }, price: 299990, currency: 'COP', in_stock: false, url: 'https://www.exito.com/s?q=Nike+Air+Max' },
      { store: { name: 'Amazon'        }, price: 310000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com/s?k=Nike+Air+Max' },
      { store: { name: 'Alkosto'       }, price: 275000, currency: 'COP', in_stock: true,  url: 'https://www.alkosto.com/search?text=Nike+Air+Max' },
    ]
  },
  'auriculares-sony': {
    name: 'Auriculares Sony WH-CH520',
    prices: [
      { store: { name: 'Falabella'     }, price: 899990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co/falabella-co/search?Ntt=Sony+WH-CH520' },
      { store: { name: 'Mercado Libre' }, price: 820000, currency: 'COP', in_stock: true,  url: 'https://listado.mercadolibre.com.co/Sony-WH-CH520' },
      { store: { name: 'Amazon'        }, price: 875000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com/s?k=Sony+WH-CH520' },
      { store: { name: 'Alkosto'       }, price: 849000, currency: 'COP', in_stock: false, url: 'https://www.alkosto.com/search?text=Sony+WH-CH520' },
    ]
  },
  'mochila': {
    name: 'Mochila Portátil Impermeable',
    prices: [
      { store: { name: 'Mercado Libre' }, price: 89900,  currency: 'COP', in_stock: true,  url: 'https://listado.mercadolibre.com.co/mochila-portatil-impermeable' },
      { store: { name: 'Éxito'         }, price: 99990,  currency: 'COP', in_stock: true,  url: 'https://www.exito.com/s?q=mochila+portatil+impermeable' },
      { store: { name: 'Falabella'     }, price: 109990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co/falabella-co/search?Ntt=mochila+portatil+impermeable' },
      { store: { name: 'Amazon'        }, price: 95000,  currency: 'COP', in_stock: true,  url: 'https://www.amazon.com/s?k=mochila+portatil+impermeable' },
      { store: { name: 'Alkosto'       }, price: 87500,  currency: 'COP', in_stock: false, url: 'https://www.alkosto.com/search?text=mochila+portatil+impermeable' },
    ]
  },
  'samsung-galaxy': {
    name: 'Smartwatch Samsung Galaxy Watch',
    prices: [
      { store: { name: 'Falabella'     }, price: 699990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co/falabella-co/search?Ntt=Samsung+Galaxy+Watch' },
      { store: { name: 'Alkosto'       }, price: 649000, currency: 'COP', in_stock: true,  url: 'https://www.alkosto.com/search?text=Samsung+Galaxy+Watch' },
      { store: { name: 'Mercado Libre' }, price: 625000, currency: 'COP', in_stock: true,  url: 'https://listado.mercadolibre.com.co/Samsung-Galaxy-Watch' },
      { store: { name: 'Éxito'         }, price: 679990, currency: 'COP', in_stock: false, url: 'https://www.exito.com/s?q=Samsung+Galaxy+Watch' },
      { store: { name: 'Amazon'        }, price: 660000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com/s?k=Samsung+Galaxy+Watch' },
    ]
  },
  'nespresso': {
    name: 'Cafetera Automática Nespresso',
    prices: [
      { store: { name: 'Falabella'     }, price: 459990, currency: 'COP', in_stock: true,  url: 'https://www.falabella.com.co/falabella-co/search?Ntt=Cafetera+Nespresso' },
      { store: { name: 'Éxito'         }, price: 429990, currency: 'COP', in_stock: true,  url: 'https://www.exito.com/s?q=Cafetera+Nespresso' },
      { store: { name: 'Amazon'        }, price: 445000, currency: 'COP', in_stock: true,  url: 'https://www.amazon.com/s?k=Cafetera+Nespresso' },
    ]
  },
};

/* goResults — carga precios del cache demo o vacía la pantalla */
function goResults(product, cacheKey) {
  const cached = cacheKey && CACHED_PRICES[cacheKey];
  if (cached) {
    // Datos demo explícitos — siempre limpiar el estado anterior
    activeResults = cached.prices;
    searchDone    = true;
    fromHistory   = true;
    if (typeof lastAnalysis !== 'undefined') lastAnalysis = null;
    const sub = document.getElementById('results-sub');
    if (sub) sub.textContent = 'Comparación de precios: ' + cached.name;
    _resetFilters();
    showPage('results');
    _renderApiResults(activeResults);
  } else {
    // Sin cacheKey: navegar a Results con los datos activos actuales
    // (pueden estar vacíos si no se ha buscado nada)
    const resultsSub = document.getElementById('results-sub');
    if (resultsSub) resultsSub.textContent = 'Comparación de precios: ' + product;
    searchDone  = true;
    fromHistory = true;
    _resetFilters();
    showPage('results');
    _renderApiResults(activeResults);
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

/* ─────────────────────────────────────────────────────
   _buildChartFromPrices — genera datos de tendencia
   a partir de los precios actuales de un producto.
   Simula variación de ±3% sobre los últimos 7 días.
───────────────────────────────────────────────────── */
function _buildChartFromPrices(productName, prices) {
  const labels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Hoy'];
  const stores = prices.slice(0, 6).map((p, idx) => {
    const storeName = p.store?.name || p.store_name || 'Tienda';
    const base = p.price;
    // Simular tendencia: variación aleatoria pero determinista por tienda
    const seed = storeName.charCodeAt(0) + storeName.length;
    const values = labels.map((_, i) => {
      if (i === labels.length - 1) return base; // Hoy = precio real
      const variance = ((Math.sin(seed * (i + 1) * 0.7) + 1) / 2) * 0.06 - 0.03;
      return Math.round(base * (1 + variance));
    });
    return { name: storeName, color: CHART_COLORS[idx % CHART_COLORS.length], values };
  });
  return { productName, labels, stores };
}

/* Elige al azar un producto (real o demo) y renderiza el chart */
async function renderRandomChart() {
  try {
    // Intentar con historial real primero
    const hist = await ApiScan.getGlobalHistory(1, 20).catch(() => []);
    const done = (hist || []).filter(h => h.product?.prices?.length >= 2);
    if (done.length) {
      const pick = done[Math.floor(Math.random() * done.length)];
      const data = _buildChartFromPrices(pick.product.name, pick.product.prices);
      _updateChartHeader(data.productName);
      renderPriceChart(data);
      return;
    }
  } catch (_) {}
  // Fallback: producto demo al azar
  const cacheEntries = Object.values(CACHED_PRICES);
  const pick = cacheEntries[Math.floor(Math.random() * cacheEntries.length)];
  const data = _buildChartFromPrices(pick.name, pick.prices);
  _updateChartHeader(data.productName);
  renderPriceChart(data);
}

function _updateChartHeader(productName) {
  const title = document.getElementById('chart-title');
  const sub   = document.getElementById('chart-sub');
  if (title) title.textContent = `Tendencia de precios — ${productName}`;
  if (sub)   sub.textContent   = 'Comparación por tienda — últimas 7 búsquedas';
}

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
   showPage extendido — inicializa chart en dashboard
   ──────────────────────────────────────────────── */
const _showPageBase = showPage;
window.showPage = function showPageExtended(name) {
  _showPageBase(name);
  if (name === 'dashboard') setTimeout(() => renderRandomChart(), 100);
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
      renderRandomChart();
    }
  }, 1600);
});

/* ────────────────────────────────────────────────
   FLUJO DE ANÁLISIS VISUAL MEJORADO
   La clave: mostrar atributos y resultados EN VIVO
   mientras el análisis ocurre, sin saltar de pantalla
   ──────────────────────────────────────────────── */

/* Estado del último análisis — persiste entre navegaciones */
/* lastAnalysis declarado en el bloque STATE al inicio del archivo */

/* Al cargar una imagen → reset visual + limpiar estado de análisis previo */
function processImage(file) {
  const r = new FileReader();
  r.onload = ev => {
    const img = document.getElementById('preview-img');
    if (img) {
      img.src = ev.target.result;
      img.alt = 'Producto cargado para análisis: ' + file.name;
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
  // Reset UI de análisis — sin depender de closure stale
  setTimeout(() => {
    _hideAttrsAll();
    const ph = document.getElementById('attrs-placeholder');
    if (ph) ph.style.display = 'block';
    document.getElementById('analysis-progress')?.classList.remove('visible');
    const btn = document.getElementById('btn-analyze');
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }, 50);
}
window.processImage = processImage;

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

  // Limpiar resultados anteriores antes de iniciar — evita mostrar datos stale
  _clearSearchState();

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

  // Labels iniciales
  _setStepLabel('step-search',  'Buscando en tiendas');
  _setStepLabel('step-compare', 'Comparando y normalizando precios');

  try {
    /* ── Paso 1: subir imagen — la IA identifica el producto ── */
    const scanResp = await ApiScan.scanImage(currentFile);
    const { task_id } = scanResp;
    currentTaskId = task_id;

    _setProgressStep('step-vision', 'done');
    _setProgressStep('step-search', 'active');

    // Arrancar mensajes rotativos de tiendas en los steps de búsqueda
    _startStepStoreMessages();

    // Mostrar atributos IA de inmediato (vienen en la respuesta del /scan)
    if (scanResp.vision) {
      const visionProduct = {
        name: scanResp.vision.name,
        category: scanResp.vision.category,
        brand: scanResp.vision.brand,
      };
      _renderAttrsCard(visionProduct);
    }

    /* ── Paso 2: polling mientras se hace scraping ── */
    const result = await ApiScan.pollResults(task_id, {
      onProgress: (status) => {
        if (status === 'processing') {
          _setProgressStep('step-search',  'done');
          _setProgressStep('step-compare', 'active');
        }
      },
    });

    _stopStepStoreMessages();
    _setProgressStep('step-search',  'done');
    _setProgressStep('step-compare', 'done');
    _setStepLabel('step-compare', '¡Precios listos! ✅');

    /* ── Atributos reales del producto final (actualiza la tarjeta si ya estaba visible) ── */
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

    // Refrescar dashboard en background para que la nueva búsqueda aparezca en historial
    setTimeout(async () => {
      try {
        const hist = await ApiScan.getGlobalHistory(1, 10);
        const done = hist?.filter(h => h.product && h.status === 'done') || [];
        if (done.length) _renderDashboardHistory(_mergeDashboardHistory(done));
      } catch (_) {}
    }, 1500);

  } catch (err) {
    _stopStepStoreMessages();
    _hideAttrsAll();
    document.getElementById('attrs-placeholder').style.display = 'block';
    ['step-vision','step-search','step-compare'].forEach(s => _setProgressStep(s,''));
    showToast('Error en análisis', err.message || 'No se pudo analizar la imagen', true);
  } finally {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    setTimeout(() => { progress?.classList.remove('visible'); }, 1500);
  }
};

/* ── Helpers para mensajes rotativos en los steps de análisis por imagen ── */
function _setStepLabel(stepId, text) {
  const step = document.getElementById(stepId);
  if (!step) return;
  const span = step.querySelector('span');
  if (span) span.textContent = text;
}

let _stepMsgInterval = null;
let _stepMsgIdx = 0;

const STEP_STORE_MSGS = [
  { label: 'Buscando en Alkosto… 🏪',          store: 'Alkosto'       },
  { label: 'Consultando Falabella… 🛍️',         store: 'Falabella'     },
  { label: 'Explorando Éxito… 🟡',             store: 'Éxito'         },
  { label: 'Chequeando Mercado Libre… 🟠',      store: 'Mercado Libre' },
  { label: 'Revisando Amazon Colombia… 📦',     store: 'Amazon'        },
  { label: 'Normalizando precios… 💱',          store: null            },
  { label: 'Comparando resultados… 📊',         store: null            },
];

function _startStepStoreMessages() {
  if (_stepMsgInterval) clearInterval(_stepMsgInterval);
  _stepMsgIdx = 0;
  _setStepLabel('step-search', STEP_STORE_MSGS[0].label);
  _stepMsgInterval = setInterval(() => {
    _stepMsgIdx = (_stepMsgIdx + 1) % STEP_STORE_MSGS.length;
    const data = STEP_STORE_MSGS[_stepMsgIdx];
    // Si el step-compare ya está activo, rotar en él; si no, en step-search
    const compareStep = document.getElementById('step-compare');
    const isComparing = compareStep?.classList.contains('active');
    _setStepLabel(isComparing ? 'step-compare' : 'step-search', data.label);
  }, 2500);
}

function _stopStepStoreMessages() {
  if (_stepMsgInterval) { clearInterval(_stepMsgInterval); _stepMsgInterval = null; }
}

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
function resetUpload(silent = false) {
  _clearSearchState();
  currentFile = null;
  const uploadState  = document.getElementById('upload-state');
  const previewState = document.getElementById('preview-state');
  const fileInput    = document.getElementById('file-input');
  if (uploadState)  uploadState.style.display  = 'block';
  if (previewState) previewState.style.display = 'none';
  if (fileInput)    fileInput.value = '';
  _resetFilters();
  _hideAttrsAll();
  const ph = document.getElementById('attrs-placeholder');
  if (ph) ph.style.display = 'block';
  document.getElementById('analysis-progress')?.classList.remove('visible');
  const btn = document.getElementById('btn-analyze');
  if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  document.getElementById('results-summary')?.style.setProperty('display','none');
  if (!silent) showToast('Imagen eliminada', 'Puedes cargar una nueva imagen para analizar');
}
window.resetUpload = resetUpload;

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
   DASHBOARD con chart — extender _loadDashboard directamente
   (sin cadena de _orig* que crea closures stale)
   ──────────────────────────────────────────────── */
const _baseDashboardLoader = _loadDashboard;
async function _loadDashboardWithChart() {
  await _baseDashboardLoader();
  renderRandomChart();
}
// Registrar la versión extendida como la canónica en window
window._loadDashboard = _loadDashboardWithChart;

// Cuando el usuario vuelve a la pantalla app (desde admin), refrescar historial real
const _showScreenBase = showScreen;
window.showScreen = function showScreenExtended(id) {
  _showScreenBase(id);
  if (id === 'app') {
    // Cancelar poll anterior si lo había
    if (typeof _dashboardPollTimer !== 'undefined' && _dashboardPollTimer) {
      clearTimeout(_dashboardPollTimer); _dashboardPollTimer = null;
    }
    setTimeout(async () => {
      try {
        const completedStates = ['done', 'success', 'completed'];
        const hist = await ApiScan.getGlobalHistory(1, 10);
        const done = (hist || []).filter(
          h => h.product && completedStates.includes(String(h.status || '').toLowerCase())
        );
        if (done.length) {
          _renderDashboardHistory(_mergeDashboardHistory(done));
          countTo('cnt-products', done.length, 800);
        } else {
          _renderDashboardFromCache();
          countTo('cnt-products', Object.keys(CACHED_PRICES).length, 800);
          // Arrancar polling por si el scraping acaba de terminar
          _startDashboardPolling(0);
        }
      } catch (_) {
        _renderDashboardFromCache();
      }
    }, 300);
  }
};
/* ═══════════════════════════════════════════════════════
   PANTALLA DE CARGA ANIMADA — Búsqueda manual modo usuario
   Reemplaza el prompt() + showLoader genérico por una
   experiencia inmersiva con mensajes rotativos y polling
   en tiempo real que lleva directo a resultados.
   ═══════════════════════════════════════════════════════ */

const SLO_MESSAGES = [
  { msg: 'Buscando en Alkosto…',          sub: 'Revisando catálogo completo',               store: 'Alkosto'       },
  { msg: 'Consultando Falabella…',         sub: 'Comparando modelos disponibles',             store: 'Falabella'     },
  { msg: 'Explorando Éxito…',             sub: 'Verificando stock y precios actuales',        store: 'Éxito'         },
  { msg: 'Chequeando Mercado Libre…',      sub: 'Filtrando las mejores ofertas',              store: 'Mercado Libre' },
  { msg: 'Revisando Amazon Colombia…',     sub: 'Precios en COP confirmados',                 store: 'Amazon'        },
  { msg: 'Normalizando precios…',          sub: 'Convirtiendo todo a pesos colombianos',      store: null            },
  { msg: 'Comparando resultados…',         sub: 'Ordenando del mejor al peor precio',         store: null            },
  { msg: 'Casi listo…',                   sub: 'Preparando tu comparativa',                  store: null            },
];

let _sloInterval = null;
let _sloMsgIndex = 0;

function _showSearchOverlay(productQuery) {
  const overlay  = document.getElementById('search-loading-overlay');
  const bar      = document.getElementById('slo-bar');
  const msgEl    = document.getElementById('slo-msg');
  const subEl    = document.getElementById('slo-sub');
  const prodEl   = document.getElementById('slo-product');
  if (!overlay) return;

  // Reset chips
  document.querySelectorAll('.slo-store-chip').forEach(c => {
    c.classList.remove('active','done');
  });

  if (prodEl) prodEl.textContent = `Buscando: "${productQuery}"`;
  if (bar)    bar.style.width = '0%';
  if (msgEl)  msgEl.textContent = 'Iniciando búsqueda…';
  if (subEl)  subEl.textContent = 'Conectando con las tiendas';

  overlay.style.display = 'flex';
  _sloMsgIndex = 0;

  // Arrancar rotación de mensajes
  if (_sloInterval) clearInterval(_sloInterval);
  _sloInterval = setInterval(() => {
    _sloMsgIndex = Math.min(_sloMsgIndex + 1, SLO_MESSAGES.length - 1);
    _sloSetMessage(_sloMsgIndex);
    // Progreso proporcional al mensaje actual
    const pct = Math.round((_sloMsgIndex / (SLO_MESSAGES.length - 1)) * 85);
    if (bar) bar.style.width = pct + '%';
  }, 2800);
}

function _sloSetMessage(idx) {
  const data  = SLO_MESSAGES[idx];
  const msgEl = document.getElementById('slo-msg');
  const subEl = document.getElementById('slo-sub');
  if (!data) return;

  // Fade out → actualizar → fade in
  if (msgEl) {
    msgEl.style.opacity   = '0';
    msgEl.style.transform = 'translateY(6px)';
    setTimeout(() => {
      msgEl.textContent     = data.msg;
      msgEl.style.opacity   = '1';
      msgEl.style.transform = 'translateY(0)';
    }, 200);
  }
  if (subEl) subEl.textContent = data.sub;

  // Activar chip de la tienda correspondiente
  document.querySelectorAll('.slo-store-chip').forEach(c => {
    if (c.classList.contains('done')) return;
    if (c.dataset.store === data.store) {
      c.classList.add('active');
    } else if (c.classList.contains('active')) {
      // la anterior pasa a "done"
      c.classList.remove('active');
      c.classList.add('done');
    }
  });
}

function _hideSearchOverlay(success = true) {
  if (_sloInterval) { clearInterval(_sloInterval); _sloInterval = null; }

  const overlay = document.getElementById('search-loading-overlay');
  const bar     = document.getElementById('slo-bar');
  const msgEl   = document.getElementById('slo-msg');
  const subEl   = document.getElementById('slo-sub');

  if (bar)   bar.style.width = '100%';

  if (success) {
    // Marcar todas las tiendas como done
    document.querySelectorAll('.slo-store-chip').forEach(c => {
      c.classList.remove('active');
      c.classList.add('done');
    });
    if (msgEl) msgEl.textContent = '¡Precios encontrados!';
    if (subEl) subEl.textContent = 'Llevándote a los resultados…';
  } else {
    if (msgEl) msgEl.textContent = 'No se encontraron resultados';
    if (subEl) subEl.textContent = '';
  }

  // Fade out suave y luego ocultar
  setTimeout(() => {
    if (overlay) {
      overlay.style.transition = 'opacity .4s ease';
      overlay.style.opacity    = '0';
      setTimeout(() => {
        overlay.style.display    = 'none';
        overlay.style.opacity    = '1';
        overlay.style.transition = '';
      }, 420);
    }
  }, 700);
}

/* ── runScraping para modo USUARIO (analista Y admin) ────────────────────
   Todos los usuarios (incluyendo admins) que ejecuten scraping manual
   desde cualquier pantalla del modo usuario (#app) ven la overlay animada
   con mensajes por tienda y barra de progreso.
   El admin en su panel propio sigue usando runScrapingAdmin() directamente.
   ──────────────────────────────────────────────────────────────────────── */
window.runScraping = async function() {
  // Pantalla de carga animada → resultados (para todos los roles)
  const query = prompt('¿Qué producto quieres buscar?', '');
  if (!query || !query.trim()) return;
  const q = query.trim();

  // Limpiar estado anterior — no mezclar con resultados viejos
  _clearSearchState();
  _showSearchOverlay(q);

  try {
    // 1. Encolar scraping
    const res = await ApiScan.searchByText(q);
    if (!res?.task_id) throw new Error('No se pudo iniciar la búsqueda');

    const taskId = res.task_id;

    // 2. Polling con mensajes progresivos
    const result = await ApiScan.pollResults(taskId, {
      intervalMs:  2800,
      maxAttempts: 35,
      onProgress: (status) => {
        // El progreso visual ya lo maneja el intervalo; aquí podríamos ajustar
        if (status === 'done' || status === 'error') {
          if (_sloInterval) { clearInterval(_sloInterval); _sloInterval = null; }
        }
      },
    });

    // 3. Éxito: completar barra, ocultar overlay con animación, ir a resultados
    _hideSearchOverlay(true);

    searchDone    = true;
    activeResults = result.product?.prices || [];
    lastAnalysis  = { name: result.product?.name || q, prices: activeResults, timestamp: Date.now() };

    const sub = document.getElementById('results-sub');
    if (sub) sub.textContent = `Comparación de precios: ${lastAnalysis.name}`;
    _resetFilters();

    // Transición limpia: esperar que la overlay desaparezca, luego navegar
    setTimeout(() => {
      showPage('results');
      // Skeletons primero, luego render real con animación
      _showResultsSkeletons(activeResults.length || 4);
      setTimeout(() => {
        _renderApiResults(activeResults);
        showToast('¡Búsqueda completada!',
          `${activeResults.length} precio${activeResults.length !== 1 ? 's' : ''} encontrado${activeResults.length !== 1 ? 's' : ''} en ${[...new Set(activeResults.map(p => p.store?.name))].length} tiendas`
        );
      }, 500);
    }, 900);

    // Actualizar dashboard y tarjetas de stats en background
    setTimeout(async () => {
      try {
        const hist = await ApiScan.getGlobalHistory(1, 10);
        const done = hist?.filter(h => h.product && h.status === 'done') || [];
        if (done.length) _renderDashboardHistory(_mergeDashboardHistory(done));
      } catch (_) {}
      // Refrescar tarjetas de scraping stats para todos los roles
      try {
        const fullHistory = await ApiAdmin.getScrapingHistory(1);
        if (fullHistory?.length) _updateScrapingStatCards(fullHistory);
      } catch (_) {}
      // Si es admin, refrescar también la tabla de historial del panel admin
      if (currentUser?.role === 'admin') {
        try { await _loadAdminScraping(); } catch (_) {}
      }
    }, 1800);

  } catch (err) {
    _hideSearchOverlay(false);
    setTimeout(() => {
      showToast('Error en búsqueda', err.message || 'No se encontraron resultados', true);
    }, 600);
  }
};

/* ═══════════════════════════════════════════════════════
   MODAL — RESULTADOS DE EJECUCIÓN DE SCRAPING
   Abre un modal flotante con los detalles del item del
   historial: query, estado, fecha, fuente y precios.
   ═══════════════════════════════════════════════════════ */
window.openScrapingResultModal = function(btn) {
  let item;
  try { item = JSON.parse(btn.dataset.item); } catch (_) { return; }

  // Rellenar encabezado
  const modalQuery  = document.getElementById('srm-query');
  const modalStatus = document.getElementById('srm-status');
  const modalDate   = document.getElementById('srm-date');
  const modalSource = document.getElementById('srm-source');
  const modalPrices = document.getElementById('srm-prices');

  // Mostrar nombre del producto si existe, sino la query
  const displayName = item.product?.name || item.query || '—';
  if (modalQuery)  modalQuery.textContent  = displayName;
  if (modalSource) modalSource.textContent = item.triggered_by_admin ? 'Admin' : 'Usuario';
  if (modalDate)   modalDate.textContent   = new Date(item.created_at).toLocaleString('es-CO');

  const sc = item.status === 'done' ? 's-green' : item.status === 'error' ? 's-red' : 's-yellow';
  const st = item.status === 'done' ? 'Completado' : item.status === 'error' ? 'Error' : 'En proceso';
  if (modalStatus) modalStatus.innerHTML = `<span class="status-badge ${sc}">${st}</span>`;

  // Precios del producto
  if (modalPrices) {
    const prices = item.product?.prices || [];

    if (item.status !== 'done') {
      // Todavía en proceso o con error
      const msg = item.status === 'error'
        ? '⚠️ El scraping falló para esta búsqueda.'
        : '⏳ El scraping aún está en proceso. Intenta de nuevo en unos segundos.';
      modalPrices.innerHTML = `<p style="color:var(--muted);text-align:center;padding:24px 0;font-size:13px">${msg}</p>`;
    } else if (!prices.length) {
      modalPrices.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px 0;font-size:13px">Sin resultados de precios para esta búsqueda.</p>';
    } else {
      // Ordenar de menor a mayor
      const sorted = [...prices].sort((a, b) => (a.price || 0) - (b.price || 0));
      const minPrice = sorted[0]?.price || 0;

      const fmt = (v) => v >= 1000000
        ? `$${(v/1000000).toFixed(1)}M`
        : v >= 1000
          ? `$${Math.round(v/1000).toLocaleString('es-CO')}k`
          : `$${(v||0).toLocaleString('es-CO')}`;

      modalPrices.innerHTML = sorted.map((p, i) => {
        const isBest = i === 0;
        const diff = p.price && minPrice && p.price > minPrice
          ? `<span style="color:var(--red);font-size:11px;margin-left:4px">+${fmt(p.price - minPrice)}</span>`
          : '';
        return `
          <div class="srm-price-row ${isBest ? 'srm-price-best' : ''}">
            <div class="srm-store-name">
              ${isBest ? '<span class="srm-best-tag">Mejor precio</span>' : ''}
              ${p.store?.name || p.store || 'Tienda'}
            </div>
            <div class="srm-price-val">${fmt(p.price)}${diff}</div>
            ${p.url
              ? `<a class="srm-link" href="${p.url}" target="_blank" rel="noopener noreferrer">Ver en tienda ↗</a>`
              : '<span style="color:var(--muted);font-size:12px">Sin enlace</span>'
            }
          </div>`;
      }).join('');
    }
  }

  openModal('modal-scraping-result');
};