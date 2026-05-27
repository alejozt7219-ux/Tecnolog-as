/* ═══════════════════════════════════════════════
   PriceVision — api.js
   Capa de comunicación con el backend FastAPI.
   Importado antes de app.js en index.html.
   ═══════════════════════════════════════════════ */

// Después
const API_BASE = 'http://localhost:8000';

/* ── Token storage ─────────────────────────────── */
const Auth = {
  getAccess()  { return localStorage.getItem('pv_access'); },
  getRefresh() { return localStorage.getItem('pv_refresh'); },
  save(access, refresh) {
    localStorage.setItem('pv_access',  access);
    localStorage.setItem('pv_refresh', refresh);
  },
  clear() {
    localStorage.removeItem('pv_access');
    localStorage.removeItem('pv_refresh');
  },
  isLoggedIn() { return !!this.getAccess(); },
};

/* ── Fetch base con auth, timeout y refresh automático ─── */
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (Auth.getAccess()) headers['Authorization'] = `Bearer ${Auth.getAccess()}`;

  // Timeout 10s — si el backend no responde, falla limpiamente
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 10000);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('El servidor no responde (timeout). Verifica que el backend este corriendo en localhost:8000.');
    throw new Error('Error de conexion. Verifica que el backend este activo.');
  }
  clearTimeout(timeoutId);

  // Si el token expiró, intenta refrescar una vez
  if (res.status === 401 && Auth.getRefresh()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${Auth.getAccess()}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } else {
      Auth.clear();
      showScreen('landing');
      showToast('Sesión expirada', 'Por favor inicia sesión de nuevo', true);
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error de red' }));
    // detail puede ser string o array de errores de validación Pydantic
    const detail = Array.isArray(err.detail)
      ? err.detail.map(e => e.msg || JSON.stringify(e)).join(', ')
      : err.detail || `HTTP ${res.status}`;
    throw new Error(detail);
  }

  // 204 No Content no tiene body
  if (res.status === 204) return null;
  return res.json();
}

async function tryRefresh() {
  try {
    const data = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: Auth.getRefresh() }),
    }).then(r => r.json());
    if (data.access_token) {
      Auth.save(data.access_token, data.refresh_token);
      return true;
    }
  } catch (_) {}
  return false;
}

/* ══════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════ */
const ApiAuth = {
  async login(email, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    Auth.save(data.access_token, data.refresh_token);
    return data;
  },

  /* FIX: endpoint de registro agregado
     El backend espera: name, email, password, role
     Por defecto el rol es "analyst" (único rol permitido desde el registro público) */
  async register({ name, email, password, role = 'analyst' }) {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
    return data;
  },

  async me() {
    return apiFetch('/auth/me');
  },

  logout() {
    Auth.clear();
  },
};

/* ══════════════════════════════════════════════
   SCAN / BÚSQUEDA
══════════════════════════════════════════════ */
const ApiScan = {
  /**
   * Manda la imagen al backend → regresa { task_id, status }
   * Usa FormData porque es un archivo binario, no JSON.
   */
  async scanImage(file) {
    const form = new FormData();
    form.append('file', file);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30000); // 30s para imagen+IA
    let res;
    try {
      res = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Auth.getAccess()}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('Timeout al analizar imagen. El backend tarda demasiado.');
      throw new Error('Error de conexion al enviar imagen.');
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Error al analizar imagen' }));
      throw new Error(err.detail);
    }
    return res.json();
  },

  /**
   * Polling del estado de la tarea.
   * Llama cada `intervalMs` ms hasta que status sea 'done' o 'error'.
   * Llama onProgress(status) en cada tick.
   */
  async pollResults(taskId, { onProgress, intervalMs = 2500, maxAttempts = 40 } = {}) {
    for (let i = 0; i < maxAttempts; i++) {
      const data = await apiFetch(`/results/${taskId}`);
      onProgress?.(data.status);

      if (data.status === 'done')  return data;
      if (data.status === 'error') throw new Error(data.error || 'Error en scraping');

      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Tiempo de espera agotado');
  },

  async searchByText(query) {
    return apiFetch(`/search?q=${encodeURIComponent(query)}`);
  },

  async getHistory(page = 1, limit = 20) {
    return apiFetch(`/history?page=${page}&limit=${limit}`);
  },

  // Historial global: propias + scrapings del admin (visibles a todos)
  async getGlobalHistory(page = 1, limit = 20) {
    return apiFetch(`/history/global?page=${page}&limit=${limit}`);
  },
};

/* ══════════════════════════════════════════════
   ADMIN
══════════════════════════════════════════════ */
const ApiAdmin = {
  // Overview
  async getOverview()           { return apiFetch('/admin/overview'); },
  async resetDemoProducts()     { return apiFetch('/admin/scraping/reset-demo', { method: 'POST' }); },
  async fixDefaultStores()      { return apiFetch('/admin/stores/fix-defaults', { method: 'POST' }); },

  // Usuarios
  async getUsers()              { return apiFetch('/admin/users'); },
  async toggleUser(id, active)  {
    return apiFetch(`/admin/users/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ is_active: active }),
    });
  },
  async deleteUser(id) {
    return apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
  },

  // Tiendas
  async getStores() { return apiFetch('/admin/stores'); },
  async deleteStore(id) {
    return apiFetch(`/admin/stores/${id}`, { method: 'DELETE' });
  },
  async toggleStore(id) {
    return apiFetch(`/admin/stores/${id}/toggle`, { method: 'PATCH' });
  },
  async createStore(name, base_url, logo_url = null) {
    return apiFetch('/admin/stores', {
      method: 'POST',
      body: JSON.stringify({ name, base_url, logo_url }),
    });
  },

  // Scraping
  async getScrapingStatus() { return apiFetch('/admin/scraping/status'); },
  async getScrapingLogs(page = 1) {
    return apiFetch(`/admin/scraping/logs?page=${page}`);
  },
  async getScrapingHistory(page = 1) {
    return apiFetch(`/admin/scraping/history?page=${page}`);
  },
  async triggerScraping(query) {
    return apiFetch('/admin/scraping/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  },
};