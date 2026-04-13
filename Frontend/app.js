/* ═══════════════════════════════════════════════
   PriceVision — app.js
   Mejoras de accesibilidad:
   - Formularios con <form> + submit semántico
   - Validación con aria-invalid + role="alert"
   - Toggle mostrar/ocultar contraseña (widget)
   - Focus trap en modales
   - aria-current actualizado correctamente
   - aria-pressed y aria-checked dinámicos
   - Navegación por teclado en drop zone
   ═══════════════════════════════════════════════ */

/* ═══════════════════ STATE ═══════════════════ */
let currentScreen = 'landing';
let isAdminEmail  = false;
let searchDone    = false;
let fromHistory   = false;

/* ═══════════════════ MOCK DATA ═══════════════════ */
const ALL_RESULTS = [
  { store:'Nike.com',     price:79990,  meta:'Envío gratis · Stock disponible', best:true  },
  { store:'Falabella',    price:89990,  meta:'2–3 días hábiles',               best:false },
  { store:'Ripley',       price:91990,  meta:'En tienda disponible',           best:false },
  { store:'Linio',        price:94500,  meta:'Vendedor externo',               best:false },
  { store:'MercadoLibre', price:85000,  meta:'Full MercadoLibre',              best:false },
];
const SONY_RESULTS = [
  { store:'Sony.com',      price:189990, meta:'Envío gratis · Garantía oficial', best:true  },
  { store:'Falabella',     price:199990, meta:'2–3 días hábiles',                best:false },
  { store:'Ripley',        price:204990, meta:'En tienda disponible',            best:false },
  { store:'Linio',         price:214990, meta:'Vendedor externo',                best:false },
];
const MOCHILA_RESULTS = [
  { store:'Decathlon',     price:24990,  meta:'Envío gratis · Stock disponible', best:true  },
  { store:'Falabella',     price:29990,  meta:'2–3 días hábiles',                best:false },
  { store:'Ripley',        price:31990,  meta:'En tienda disponible',            best:false },
  { store:'Linio',         price:27990,  meta:'Vendedor externo',                best:false },
  { store:'MercadoLibre',  price:25990,  meta:'Full MercadoLibre',               best:false },
  { store:'Paris',         price:28990,  meta:'Envío nacional',                  best:false },
];
const SAMSUNG_RESULTS = [
  { store:'Samsung.com',   price:149990, meta:'Envío gratis · Garantía oficial', best:true  },
  { store:'Falabella',     price:159990, meta:'2–3 días hábiles',                best:false },
  { store:'Ripley',        price:164990, meta:'En tienda disponible',            best:false },
  { store:'Linio',         price:169990, meta:'Vendedor externo',                best:false },
  { store:'MercadoLibre',  price:154990, meta:'Full MercadoLibre',               best:false },
];
const NESPRESSO_RESULTS = [
  { store:'Nespresso.cl',  price:89990,  meta:'Envío gratis · Stock disponible', best:true  },
  { store:'Falabella',     price:94990,  meta:'2–3 días hábiles',                best:false },
  { store:'Ripley',        price:97990,  meta:'En tienda disponible',            best:false },
];

/* ═══════════════════ BOOT ═══════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Ocultar loader inicial
  setTimeout(() => {
    const l = document.getElementById('loader');
    l.style.opacity = '0';
    setTimeout(() => { l.style.display = 'none'; }, 400);
  }, 1200);

  // Cerrar modales al hacer clic en el backdrop (fuera del modal)
  document.querySelectorAll('.modal-backdrop').forEach(b => {
    b.addEventListener('click', e => {
      if (e.target === b) closeModal(b.id);
    });
  });

  // Atajos de teclado globales
  document.addEventListener('keydown', e => {
    // Escape cierra modales abiertos
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(b => closeModal(b.id));
    }
  });
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
    // Mover foco al primer elemento interactivo de la pantalla para accesibilidad
    const firstFocusable = target.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (firstFocusable) firstFocusable.focus();
  }, 50);
  currentScreen = id;
}

/* ═══════════════════ NAV — aria-current ═══════════════════ */
function setNavActive(navId, scope) {
  // Quitar aria-current y clase active de todos los items del scope
  document.querySelectorAll(`${scope} .nav-item`).forEach(n => {
    n.classList.remove('active');
    n.removeAttribute('aria-current');
  });
  // Activar el seleccionado con aria-current="page"
  const el = document.getElementById(navId);
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-current', 'page');
  }
}

/* ═══════════════════ WIDGET: TOGGLE CONTRASEÑA ═══════════════════ */
/**
 * Alterna la visibilidad de un campo contraseña.
 * Actualiza aria-pressed en el botón para comunicar el estado a lectores.
 */
function togglePasswordVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;

  const isVisible = input.type === 'text';
  input.type = isVisible ? 'password' : 'text';
  btn.setAttribute('aria-label', isVisible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  btn.setAttribute('aria-pressed', String(!isVisible));
}

/* ═══════════════════ VALIDACIÓN DE FORMULARIOS ═══════════════════ */
/**
 * Muestra un error accesible en un campo.
 * Usa aria-invalid y role="alert" para anunciar el error.
 */
function showFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.setAttribute('aria-invalid', 'true');
  if (error) {
    error.textContent = message;
    error.removeAttribute('hidden');
  }
}

/**
 * Limpia el error de un campo.
 */
function clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.setAttribute('aria-invalid', 'false');
  if (error) {
    error.textContent = '';
    error.setAttribute('hidden', '');
  }
}

/**
 * Limpia todos los errores de un formulario.
 */
function clearFormErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('[aria-invalid]').forEach(el => el.setAttribute('aria-invalid', 'false'));
  form.querySelectorAll('.field-error').forEach(el => {
    el.textContent = '';
    el.setAttribute('hidden', '');
  });
}

/* ═══════════════════ AUTH ═══════════════════ */
function goLogin(role) {
  const greeting = document.getElementById('login-greeting');
  if (greeting) greeting.textContent = role === 'admin' ? 'Hola de nuevo Admin!' : 'Hola de nuevo';

  const emailInput = document.getElementById('email-input');
  const passInput  = document.getElementById('pass-input');
  if (emailInput) emailInput.value = role === 'admin' ? 'admin@empresa.com' : '';
  if (passInput)  passInput.value  = '';

  clearFormErrors('login-form');
  showScreen('login');
}

function goAdminLogin() {
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

/* Submit handler semántico para login (form onsubmit) */
function handleLoginSubmit(event) {
  event.preventDefault();
  doLogin();
}

function doLogin() {
  clearFormErrors('login-form');

  const emailEl = document.getElementById('email-input');
  const passEl  = document.getElementById('pass-input');
  const email   = emailEl ? emailEl.value.trim() : '';
  const pass    = passEl  ? passEl.value          : '';

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
    // Mover foco al primer campo con error para accesibilidad
    const firstError = document.querySelector('[aria-invalid="true"]');
    if (firstError) firstError.focus();
    return;
  }

  showLoader('Autenticando…');
  setTimeout(() => {
    hideLoader();
    isAdminEmail = email.toLowerCase().includes('admin');
    const greetingEl = document.getElementById('login-greeting');
    const goAdmin    = isAdminEmail && greetingEl && greetingEl.textContent.includes('Admin');

    if (goAdmin) {
      showScreen('admin');
      showAdminPage('overview');
      adminAnimateStats();
      setTimeout(() => showToast('¡Acceso autorizado!', 'Has iniciado sesión como administrador'), 600);
    } else {
      const adminBtn = document.getElementById('admin-btn');
      if (adminBtn) adminBtn.style.display = 'flex';
      showScreen('app');
      showPage('dashboard');
      animateStats();
      setTimeout(() => showToast('¡Inicio de sesión exitoso!', 'Bienvenido de vuelta a PriceVision'), 600);
    }
  }, 1000);
}

/* Submit handler semántico para registro */
function handleRegisterSubmit(event) {
  event.preventDefault();
  doRegister();
}

function doRegister() {
  clearFormErrors('register-form');

  const name  = document.getElementById('reg-name')  ? document.getElementById('reg-name').value.trim()  : '';
  const email = document.getElementById('reg-email') ? document.getElementById('reg-email').value.trim() : '';
  const org   = document.getElementById('reg-org')   ? document.getElementById('reg-org').value.trim()   : '';
  const role  = document.getElementById('reg-role')  ? document.getElementById('reg-role').value         : '';
  const pass  = document.getElementById('reg-pass')  ? document.getElementById('reg-pass').value         : '';
  const pass2 = document.getElementById('reg-pass2') ? document.getElementById('reg-pass2').value        : '';

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
    const firstError = document.querySelector('#register-form [aria-invalid="true"]');
    if (firstError) firstError.focus();
    return;
  }

  showLoader('Creando tu cuenta…');
  setTimeout(() => {
    hideLoader();
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
      avatarEl.textContent = initials;
      avatarEl.setAttribute('aria-label', `Avatar de usuario con iniciales ${initials}`);
    }

    const displayName = document.getElementById('user-display-name');
    if (displayName) displayName.textContent = name;

    const roleBadge = document.getElementById('user-role-badge');
    if (roleBadge) roleBadge.textContent = role;

    const profileName  = document.getElementById('profile-name-input');
    const profileEmail = document.getElementById('profile-email-input');
    const profileRole  = document.getElementById('profile-role-input');
    if (profileName)  profileName.value  = name;
    if (profileEmail) profileEmail.value = email;
    if (profileRole)  profileRole.value  = role;

    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) adminBtn.style.display = 'flex';

    showScreen('app');
    showPage('dashboard');
    animateStats();
    setTimeout(() => showToast('¡Cuenta creada!', `Bienvenido a PriceVision, ${name.split(' ')[0]}`), 600);
  }, 1200);
}

function logout() {
  searchDone = false;
  const emailEl = document.getElementById('email-input');
  const passEl  = document.getElementById('pass-input');
  if (emailEl) emailEl.value = '';
  if (passEl)  passEl.value  = '';
  resetUpload();
  showPage('dashboard');
  showScreen('landing');
}

function adminLogout() {
  const emailEl = document.getElementById('email-input');
  const passEl  = document.getElementById('pass-input');
  if (emailEl) emailEl.value = '';
  if (passEl)  passEl.value  = '';
  showScreen('landing');
}

function goUserMode() {
  const greeting = document.getElementById('login-greeting');
  if (greeting) greeting.textContent = 'Hola de nuevo';
  const emailEl = document.getElementById('email-input');
  const passEl  = document.getElementById('pass-input');
  if (emailEl) emailEl.value = '';
  if (passEl)  passEl.value  = '';
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
}

function goResults(product, type) {
  const resultsSub = document.getElementById('results-sub');
  if (resultsSub) resultsSub.textContent = 'Comparación de precios: ' + product;
  searchDone  = true;
  fromHistory = true;
  showPage('results');

  let results = ALL_RESULTS;
  if (type === 'sony')           results = SONY_RESULTS;
  else if (type === 'mochila')   results = MOCHILA_RESULTS;
  else if (type === 'samsung')   results = SAMSUNG_RESULTS;
  else if (type === 'nespresso') results = NESPRESSO_RESULTS;

  renderResults(results);
}

/* ═══════════════════ TOAST ═══════════════════ */
function showToast(title, msg, isError) {
  const t = document.getElementById('toast');
  if (!t) return;
  const dot = t.querySelector('.toast-dot');
  if (dot) dot.style.background = isError ? 'var(--red)' : 'var(--green)';

  const titleEl = document.getElementById('toast-title');
  const msgEl   = document.getElementById('toast-msg');
  if (titleEl) titleEl.textContent = title;
  if (msgEl)   msgEl.textContent   = msg;

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
function animateStats() {
  countTo('cnt-products', 324, 1200);
  countTo('cnt-stores', 5, 800);
  countTo('cnt-ops', 47, 1000);
}
function adminAnimateStats() { countTo('acnt-products', 5789, 1400); }
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
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) processImage(f);
  else showToast('Error', 'Solo se aceptan imágenes (PNG, JPG, WEBP)', true);
}
function handleFile(e) {
  const f = e.target.files[0];
  if (f) processImage(f);
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
  searchDone = false;
  const uploadState  = document.getElementById('upload-state');
  const previewState = document.getElementById('preview-state');
  const fileInput    = document.getElementById('file-input');
  const fLoc  = document.getElementById('f-loc');
  const fMin  = document.getElementById('f-min');
  const fMax  = document.getElementById('f-max');
  const fSort = document.getElementById('f-sort');

  if (uploadState)  uploadState.style.display  = 'block';
  if (previewState) previewState.style.display = 'none';
  if (fileInput)    fileInput.value = '';
  if (fLoc)  fLoc.value  = '';
  if (fMin)  fMin.value  = '0';
  if (fMax)  fMax.value  = '999999';
  if (fSort) fSort.value = '';

  showToast('Imagen eliminada', 'Puedes cargar una nueva imagen para analizar');
}
function analyzePrice() {
  showLoader('Analizando imagen…');
  setTimeout(() => {
    hideLoader();
    searchDone = true;
    const resultsSub = document.getElementById('results-sub');
    if (resultsSub) resultsSub.textContent = 'Comparación de precios: Zapatillas deportivas Nike Air Max';

    const fLoc  = document.getElementById('f-loc');
    const fMin  = document.getElementById('f-min');
    const fMax  = document.getElementById('f-max');
    const fSort = document.getElementById('f-sort');
    if (fLoc)  fLoc.value  = '';
    if (fMin)  fMin.value  = '0';
    if (fMax)  fMax.value  = '999999';
    if (fSort) fSort.value = '';

    showPage('results');
    renderResults(ALL_RESULTS);
  }, 1500);
}

/* ═══════════════════ RESULTS + FILTERS ═══════════════════ */
function renderResults(data) {
  const grid    = document.getElementById('results-grid');
  const noState = document.getElementById('no-search-yet');
  if (!searchDone) {
    if (grid)    grid.style.display    = 'none';
    if (noState) noState.style.display = 'block';
    return;
  }
  if (noState) noState.style.display = 'none';
  if (!grid) return;
  grid.style.display = 'grid';
  grid.innerHTML = '';

  if (data.length === 0) {
    const msg = document.createElement('p');
    msg.setAttribute('role', 'status');
    msg.style.cssText = 'grid-column:1/-1;text-align:center;padding:48px;color:var(--muted)';
    msg.textContent = 'Sin resultados con los filtros aplicados';
    grid.appendChild(msg);
    return;
  }

  data.forEach((r, i) => {
    const card = document.createElement('article');
    card.className = 'result-card' + (r.best ? ' best-deal' : '');
    card.setAttribute('role', 'listitem');
    // tabindex="0" permite navegar con teclado entre resultados
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label',
      `${r.store}: $${r.price.toLocaleString('es-CL')}. ${r.meta}${r.best ? '. Mejor precio disponible' : ''}`
    );
    card.style.cssText = 'opacity:0;transform:translateY(20px)';
    card.innerHTML = `
      ${r.best ? '<div class="best-badge" aria-label="Mejor precio disponible">Mejor precio</div>' : ''}
      <div class="store-name" aria-hidden="true">${r.store}</div>
      <div class="result-price${r.best ? ' best' : ''}" aria-hidden="true">
        $${r.price.toLocaleString('es-CL')}
      </div>
      <div class="result-meta" aria-hidden="true">${r.meta}</div>
    `;
    // Activar con Enter o Espacio también (widget de tarjeta interactiva)
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
    grid.appendChild(card);
    setTimeout(() => {
      card.style.transition = 'all .4s ease';
      card.style.opacity    = '1';
      card.style.transform  = 'translateY(0)';
    }, i * 80);
  });
}

function applyFilters() {
  const fMin  = document.getElementById('f-min');
  const fMax  = document.getElementById('f-max');
  const fSort = document.getElementById('f-sort');
  const min   = parseFloat(fMin  ? fMin.value  : '0')      || 0;
  const max   = parseFloat(fMax  ? fMax.value  : '999999') || 999999;
  const sort  = fSort ? fSort.value : '';

  let data = ALL_RESULTS.filter(r => r.price >= min && r.price <= max);
  if (sort === 'asc')  data = [...data].sort((a, b) => a.price - b.price);
  if (sort === 'desc') data = [...data].sort((a, b) => b.price - a.price);
  if (sort === 'asc'  && data.length > 0) data = data.map((r, i) => ({...r, best: i === 0}));
  if (sort === 'desc' || sort === '')     data = data.map(r => ({...r, best: r.store === 'Nike.com'}));

  if (searchDone) renderResults(data);
}

/* ═══════════════════ PERFIL ═══════════════════ */
/* Submit handler semántico para perfil */
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
    if (avatar) {
      avatar.textContent = initials;
      avatar.setAttribute('aria-label', `Avatar de usuario con iniciales ${initials}`);
    }
    const displayName = document.getElementById('user-display-name');
    if (displayName) displayName.textContent = name;
  }
  showToast('Perfil actualizado', 'Cambios guardados correctamente');
}

/* ═══════════════════ MODALS + FOCUS TRAP ═══════════════════ */
/**
 * Selecciona todos los elementos focusables dentro de un contenedor.
 */
function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

/**
 * Abre un modal, actualiza aria-hidden y aplica focus trap.
 */
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  // Foco al primer elemento interactivo del modal
  const focusable = getFocusableElements(modal);
  if (focusable.length > 0) {
    setTimeout(() => focusable[0].focus(), 50);
  }

  // Focus trap: Tab y Shift+Tab quedan dentro del modal
  modal._trapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const elements = getFocusableElements(modal);
    if (elements.length === 0) return;
    const first = elements[0];
    const last  = elements[elements.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: si estamos en el primero, ir al último
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: si estamos en el último, ir al primero
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', modal._trapHandler);
}

/**
 * Cierra un modal y restaura el foco al elemento que lo abrió.
 */
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');

  // Remover el focus trap
  if (modal._trapHandler) {
    document.removeEventListener('keydown', modal._trapHandler);
    modal._trapHandler = null;
  }

  // Devolver foco al botón que abrió el modal
  const opener = document.querySelector(`[onclick*="openModal('${id}')"]`);
  if (opener) opener.focus();
}

/* ═══════════════════ ADMIN — STORES ═══════════════════ */
function addStore() {
  const nameEl   = document.getElementById('new-store-name');
  const urlEl    = document.getElementById('new-store-url');
  const activeEl = document.getElementById('new-store-active');
  const name     = nameEl   ? nameEl.value.trim()   : '';
  const url      = urlEl    ? urlEl.value.trim()    : '';
  const active   = activeEl ? activeEl.checked      : false;

  if (!name || !url) {
    showToast('Error', 'Completa nombre y URL', true);
    if (!name && nameEl) nameEl.focus();
    return;
  }

  const tbody = document.getElementById('stores-tbody');
  if (!tbody) return;

  const row = document.createElement('tr');
  row.setAttribute('data-custom', 'true');
  const sc   = active ? 's-green' : 's-red';
  const st   = active ? 'Activo'  : 'Inactivo';
  const safeN = name.replace(/'/g, "\\'");

  row.innerHTML = `
    <td style="font-weight:500">${name}</td>
    <td style="color:var(--muted);font-size:12px">${url}</td>
    <td><span class="status-badge ${sc}">${st}</span></td>
    <td style="color:var(--muted)">—</td>
    <td>0</td>
    <td>
      <div class="actions-cell">
        <label class="toggle" aria-label="Activar o desactivar ${name}">
          <input type="checkbox" role="switch" aria-checked="${active}" ${active ? 'checked' : ''}
            onchange="toggleStore(this,'${safeN}');this.setAttribute('aria-checked',this.checked)">
          <span class="toggle-slider" aria-hidden="true"></span>
        </label>
        <button class="btn-delete" onclick="deleteStore(this,'${safeN}')" aria-label="Eliminar tienda ${name}">
          Eliminar
        </button>
      </div>
    </td>
  `;
  row.style.opacity = '0';
  tbody.appendChild(row);
  requestAnimationFrame(() => {
    row.style.transition = 'opacity .4s';
    row.style.opacity    = '1';
  });
  updateStoreCounts();
  closeModal('modal-tienda');
  if (nameEl)   nameEl.value   = '';
  if (urlEl)    urlEl.value    = '';
  if (activeEl) { activeEl.checked = true; activeEl.setAttribute('aria-checked', 'true'); }
  showToast('Tienda agregada', `${name} agregada correctamente`);
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
  const badge = row ? row.querySelector('.status-badge') : null;
  if (badge) {
    badge.className   = 'status-badge ' + (on ? 's-green' : 's-red');
    badge.textContent = on ? 'Activo' : 'Inactivo';
  }
  updateStoreCounts();
  showToast('Tienda actualizada', `${name} marcada como ${on ? 'activa' : 'inactiva'}`);
}

function toggleUser(el, name) {
  const on   = el.checked;
  const row  = el.closest('tr');
  const badge = row ? row.querySelector('.status-badge') : null;
  if (badge) {
    badge.className   = 'status-badge ' + (on ? 's-green' : 's-red');
    badge.textContent = on ? 'Activo' : 'Inactivo';
  }
  showToast('Usuario actualizado', `${name} ${on ? 'activado' : 'desactivado'}`);
}

function runScraping() {
  showLoader('Ejecutando scraping manual…');
  setTimeout(() => {
    hideLoader();
    const now     = new Date();
    const dateStr = now.toLocaleDateString('es-CL');
    const timeStr = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    const lastExec = document.getElementById('last-execution-date');
    if (lastExec) lastExec.textContent = dateStr;

    const tbody = document.getElementById('scraping-history-tbody');
    if (!tbody) return;

    const row      = document.createElement('tr');
    const products = Math.floor(Math.random() * 1000) + 5000;
    row.innerHTML  = `
      <td><time>${dateStr}, ${timeStr}</time></td>
      <td><span class="status-badge s-green">Completado</span></td>
      <td style="color:var(--green)">${products}</td>
      <td>0</td>
      <td style="color:var(--muted)">${Math.floor(Math.random()*2)+3}m ${Math.floor(Math.random()*60)}s</td>
      <td><button class="link-btn" onclick="showToast('Logs','Abriendo logs…')" aria-label="Ver logs de esta ejecución">Ver logs</button></td>
    `;
    tbody.insertBefore(row, tbody.firstChild);
    showToast('Scraping completado', 'Ejecución manual finalizada con éxito');
  }, 2000);
}
