/* ═══════════════════════════════════════════════
   PriceVision — app.js
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

  // Cerrar modales al hacer clic en el backdrop
  document.querySelectorAll('.modal-backdrop').forEach(b => {
    b.addEventListener('click', e => {
      if (e.target === b) closeModal(b.id);
    });
  });

  // Atajos de teclado
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter'  && currentScreen === 'login')    doLogin();
    if (e.key === 'Enter'  && currentScreen === 'register') doRegister();
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
  setTimeout(() => document.getElementById(id).classList.add('active'), 50);
  currentScreen = id;
}

/* ═══════════════════ NAV — aria-current ═══════════════════ */
function setNavActive(navId, scope) {
  // Quitar aria-current de todos los nav items del scope
  document.querySelectorAll(`${scope} .nav-item`).forEach(n => {
    n.classList.remove('active');
    n.removeAttribute('aria-current');
  });
  // Activar el seleccionado
  const el = document.getElementById(navId);
  if (el) {
    el.classList.add('active');
    el.setAttribute('aria-current', 'page');
  }
}

/* ═══════════════════ AUTH ═══════════════════ */
function goLogin(role) {
  document.getElementById('login-greeting').textContent =
    role === 'admin' ? 'Hola de nuevo Admin!' : 'Hola de nuevo';
  document.getElementById('email-input').value = role === 'admin' ? 'admin@empresa.com' : '';
  document.getElementById('pass-input').value  = '';
  showScreen('login');
}

function goAdminLogin() {
  document.getElementById('login-greeting').textContent = 'Hola de nuevo Admin!';
  document.getElementById('email-input').value = 'admin@empresa.com';
  document.getElementById('pass-input').value  = '';
  showScreen('login');
}

function goRegister() {
  ['reg-name','reg-email','reg-org','reg-pass','reg-pass2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('reg-role').value = '';
  showScreen('register');
}

function doLogin() {
  const email = document.getElementById('email-input').value.trim();
  const pass  = document.getElementById('pass-input').value;
  if (!email || !pass) { showToast('Error', 'Completa todos los campos', true); return; }

  showLoader('Autenticando…');
  setTimeout(() => {
    hideLoader();
    isAdminEmail = email.toLowerCase().includes('admin');
    const goAdmin = isAdminEmail &&
      document.getElementById('login-greeting').textContent.includes('Admin');

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

function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const org   = document.getElementById('reg-org').value.trim();
  const role  = document.getElementById('reg-role').value;
  const pass  = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;

  if (!name||!email||!org||!role||!pass||!pass2) {
    showToast('Error', 'Completa todos los campos', true); return;
  }
  if (pass !== pass2) { showToast('Error', 'Las contraseñas no coinciden', true); return; }
  if (pass.length < 8) { showToast('Error', 'Contraseña mínimo 8 caracteres', true); return; }

  showLoader('Creando tu cuenta…');
  setTimeout(() => {
    hideLoader();
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('user-avatar').textContent       = initials;
    document.getElementById('user-avatar').setAttribute('aria-label', `Avatar del usuario: ${initials}`);
    document.getElementById('user-display-name').textContent = name;
    document.getElementById('user-role-badge').textContent   = role;
    document.getElementById('profile-name-input').value      = name;
    document.getElementById('profile-email-input').value     = email;
    document.getElementById('profile-role-input').value      = role;
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
  document.getElementById('email-input').value = '';
  document.getElementById('pass-input').value  = '';
  resetUpload();
  showPage('dashboard');
  showScreen('landing');
}

function adminLogout() {
  document.getElementById('email-input').value = '';
  document.getElementById('pass-input').value  = '';
  showScreen('landing');
}

function goUserMode() {
  document.getElementById('login-greeting').textContent = 'Hola de nuevo';
  document.getElementById('email-input').value = '';
  document.getElementById('pass-input').value  = '';
  showScreen('login');
  setTimeout(() => showToast('Modo usuario', 'Inicia sesión como usuario'), 400);
}

/* ═══════════════════ PAGE NAV ═══════════════════ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  setNavActive('nav-' + name, '#app');
  document.getElementById('page-' + name).classList.add('active');
  if (name !== 'results') fromHistory = false;
}

function navToResults() {
  if (!fromHistory) searchDone = false;
  showPage('results');
  document.getElementById('no-search-yet').style.display = searchDone ? 'none'  : 'block';
  document.getElementById('results-grid').style.display  = searchDone ? 'grid'  : 'none';
}

function showAdminPage(name) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  setNavActive('anav-' + name, '#admin');
  document.getElementById('admin-page-' + name).classList.add('active');
}

function goResults(product, type) {
  document.getElementById('results-sub').textContent = 'Comparación de precios: ' + product;
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
  t.querySelector('.toast-dot').style.background = isError ? 'var(--red)' : 'var(--green)';
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent   = msg;
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
  document.getElementById('loader-text').textContent = txt || 'Cargando…';
  l.setAttribute('aria-label', txt || 'Cargando');
  l.style.display = 'flex';
  l.style.opacity = '0';
  requestAnimationFrame(() => { l.style.opacity = '1'; });
}
function hideLoader() {
  const l = document.getElementById('loader');
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
  zone.classList.toggle('drag', over);
  zone.setAttribute('aria-label',
    over
      ? 'Suelta la imagen aquí para cargarla'
      : 'Zona de carga de imagen. Haz clic o arrastra una imagen aquí'
  );
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag');
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
    img.src = ev.target.result;
    img.alt = `Producto cargado: ${file.name}`;
    document.getElementById('upload-state').style.display = 'none';
    const ps = document.getElementById('preview-state');
    ps.style.display   = 'block';
    ps.style.opacity   = '0';
    ps.style.transform = 'translateY(16px)';
    requestAnimationFrame(() => {
      ps.style.transition = 'all .4s ease';
      ps.style.opacity    = '1';
      ps.style.transform  = 'translateY(0)';
    });
  };
  r.readAsDataURL(file);
}
function resetUpload() {
  searchDone = false;
  document.getElementById('upload-state').style.display  = 'block';
  document.getElementById('preview-state').style.display = 'none';
  document.getElementById('file-input').value = '';
  document.getElementById('f-loc').value  = '';
  document.getElementById('f-min').value  = '0';
  document.getElementById('f-max').value  = '999999';
  document.getElementById('f-sort').value = '';
  showToast('Imagen eliminada', 'Puedes cargar una nueva imagen para analizar');
}
function analyzePrice() {
  showLoader('Analizando imagen…');
  setTimeout(() => {
    hideLoader();
    searchDone = true;
    document.getElementById('results-sub').textContent =
      'Comparación de precios: Zapatillas deportivas Nike Air Max';
    showPage('results');
    document.getElementById('f-loc').value  = '';
    document.getElementById('f-min').value  = '0';
    document.getElementById('f-max').value  = '999999';
    document.getElementById('f-sort').value = '';
    renderResults(ALL_RESULTS);
  }, 1500);
}

/* ═══════════════════ RESULTS + FILTERS ═══════════════════ */
function renderResults(data) {
  const grid    = document.getElementById('results-grid');
  const noState = document.getElementById('no-search-yet');
  if (!searchDone) {
    grid.style.display    = 'none';
    noState.style.display = 'block';
    return;
  }
  noState.style.display = 'none';
  grid.style.display    = 'grid';
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
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label',
      `${r.store}: $${r.price.toLocaleString('es-CL')}. ${r.meta}${r.best ? '. Mejor precio' : ''}`
    );
    card.style.cssText = 'opacity:0;transform:translateY(20px)';
    card.innerHTML = `
      ${r.best ? '<div class="best-badge" aria-label="Mejor precio disponible">Mejor precio</div>' : ''}
      <div class="store-name">${r.store}</div>
      <div class="result-price${r.best ? ' best' : ''}" aria-label="Precio: $${r.price.toLocaleString('es-CL')}">
        $${r.price.toLocaleString('es-CL')}
      </div>
      <div class="result-meta">${r.meta}</div>
    `;
    grid.appendChild(card);
    setTimeout(() => {
      card.style.transition = 'all .4s ease';
      card.style.opacity    = '1';
      card.style.transform  = 'translateY(0)';
    }, i * 80);
  });
}

function applyFilters() {
  const min  = parseFloat(document.getElementById('f-min').value)  || 0;
  const max  = parseFloat(document.getElementById('f-max').value)  || 999999;
  const sort = document.getElementById('f-sort').value;
  let data   = ALL_RESULTS.filter(r => r.price >= min && r.price <= max);
  if (sort === 'asc')  data = [...data].sort((a, b) => a.price - b.price);
  if (sort === 'desc') data = [...data].sort((a, b) => b.price - a.price);
  if (sort === 'asc'  && data.length > 0) data = data.map((r, i) => ({...r, best: i === 0}));
  if (sort === 'desc' || sort === '')     data = data.map(r => ({...r, best: r.store === 'Nike.com'}));
  if (searchDone) renderResults(data);
}

/* ═══════════════════ PROFILE ═══════════════════ */
function saveProfile() {
  const name = document.getElementById('profile-name-input').value.trim();
  if (name) {
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatar = document.getElementById('user-avatar');
    avatar.textContent = initials;
    avatar.setAttribute('aria-label', `Avatar del usuario: ${initials}`);
    document.getElementById('user-display-name').textContent = name;
  }
  showToast('Perfil actualizado', 'Cambios guardados correctamente');
}

/* ═══════════════════ MODALS ═══════════════════ */
function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  // Foco al primer elemento interactivo del modal
  const firstFocusable = modal.querySelector('input, button, select, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) setTimeout(() => firstFocusable.focus(), 50);
}
function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

/* ═══════════════════ ADMIN — STORES ═══════════════════ */
function addStore() {
  const name   = document.getElementById('new-store-name').value.trim();
  const url    = document.getElementById('new-store-url').value.trim();
  const active = document.getElementById('new-store-active').checked;
  if (!name || !url) { showToast('Error', 'Completa nombre y URL', true); return; }

  const tbody = document.getElementById('stores-tbody');
  const row   = document.createElement('tr');
  row.setAttribute('data-custom', 'true');
  const sc    = active ? 's-green' : 's-red';
  const st    = active ? 'Activo'  : 'Inactivo';
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
          <input type="checkbox" ${active ? 'checked' : ''} onchange="toggleStore(this,'${safeN}')">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn-delete" onclick="deleteStore(this,'${safeN}')" aria-label="Eliminar tienda ${name}">
          Eliminar
        </button>
      </div>
    </td>`;
  row.style.opacity = '0';
  tbody.appendChild(row);
  requestAnimationFrame(() => { row.style.transition = 'opacity .4s'; row.style.opacity = '1'; });
  updateStoreCounts();
  closeModal('modal-tienda');
  document.getElementById('new-store-name').value = '';
  document.getElementById('new-store-url').value  = '';
  document.getElementById('new-store-active').checked = true;
  showToast('Tienda agregada', `${name} agregada correctamente`);
}

function deleteStore(btn, name) {
  const row = btn.closest('tr');
  row.style.transition = 'opacity .3s,transform .3s';
  row.style.opacity    = '0';
  row.style.transform  = 'translateX(20px)';
  setTimeout(() => { row.remove(); updateStoreCounts(); }, 320);
  showToast('Tienda eliminada', `${name} fue eliminada del sistema`);
}

function updateStoreCounts() {
  const rows   = document.querySelectorAll('#stores-tbody tr');
  const active = document.querySelectorAll('#stores-tbody .s-green').length;
  document.getElementById('store-count').textContent        = rows.length;
  document.getElementById('store-active-count').textContent = active;
}

function toggleStore(el, name) {
  const on    = el.checked;
  const badge = el.closest('tr').querySelector('.status-badge');
  badge.className   = 'status-badge ' + (on ? 's-green' : 's-red');
  badge.textContent = on ? 'Activo' : 'Inactivo';
  updateStoreCounts();
  showToast('Tienda actualizada', `${name} marcada como ${on ? 'activa' : 'inactiva'}`);
}

function toggleUser(el, name) {
  const on    = el.checked;
  const badge = el.closest('tr').querySelector('.status-badge');
  badge.className   = 'status-badge ' + (on ? 's-green' : 's-red');
  badge.textContent = on ? 'Activo' : 'Inactivo';
  showToast('Usuario actualizado', `${name} ${on ? 'activado' : 'desactivado'}`);
}

function runScraping() {
  showLoader('Ejecutando scraping manual…');
  setTimeout(() => {
    hideLoader();
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('es-CL');
    const timeStr  = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const lastExec = document.getElementById('last-execution-date');
    if (lastExec) lastExec.textContent = dateStr;
    const tbody    = document.getElementById('scraping-history-tbody');
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