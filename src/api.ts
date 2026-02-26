const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('vp-token');
}

function setToken(token: string) {
  localStorage.setItem('vp-token', token);
}

function clearToken() {
  localStorage.removeItem('vp-token');
}

function getUsername(): string | null {
  return localStorage.getItem('vp-username');
}

function setUsername(username: string) {
  localStorage.setItem('vp-username', username);
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/register' && path !== '/auth/check') {
    clearToken();
    window.location.reload();
  }
  return res;
}

export const auth = {
  async check(): Promise<{ hasAccount: boolean }> {
    const res = await apiFetch('/auth/check');
    return res.json();
  },
  async register(username: string, password: string) {
    const res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Registratie mislukt'); }
    const data = await res.json();
    setToken(data.token); setUsername(data.username);
    return data;
  },
  async login(username: string, password: string) {
    const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Login mislukt'); }
    const data = await res.json();
    setToken(data.token); setUsername(data.username);
    return data;
  },
  async logout(): Promise<void> {
    await apiFetch('/auth/logout', { method: 'POST' });
    clearToken();
  },
  isLoggedIn(): boolean { return !!getToken(); },
  getUsername,
};

export const projects = {
  async getAll(): Promise<any[]> {
    const res = await apiFetch('/projects');
    if (!res.ok) throw new Error('Kon projecten niet ophalen');
    return res.json();
  },
  async get(id: string): Promise<any> {
    const res = await apiFetch(`/projects/${id}`);
    if (!res.ok) throw new Error('Project niet gevonden');
    return res.json();
  },
  async create(data: any): Promise<any> {
    const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Kon project niet aanmaken');
    return res.json();
  },
  async update(id: string, data: any): Promise<any> {
    const res = await apiFetch(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Kon project niet updaten');
    return res.json();
  },
  async delete(id: string): Promise<void> {
    const res = await apiFetch(`/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Kon project niet verwijderen');
  },
  async duplicate(id: string): Promise<any> {
    const res = await apiFetch(`/projects/${id}/duplicate`, { method: 'POST' });
    if (!res.ok) throw new Error('Kon project niet dupliceren');
    return res.json();
  },
};

export const steps = {
  async update(projectId: string, stepNumber: number, data: any): Promise<any> {
    const res = await apiFetch(`/projects/${projectId}/steps/${stepNumber}`, { method: 'PATCH', body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Kon stap niet updaten');
    return res.json();
  },
};

export const logs = {
  async get(projectId: string, limit = 100): Promise<any[]> {
    const res = await apiFetch(`/projects/${projectId}/logs?limit=${limit}`);
    if (!res.ok) throw new Error('Kon logs niet ophalen');
    return res.json();
  },
  async add(projectId: string, level: string, step: number, source: string, message: string): Promise<any> {
    const res = await apiFetch(`/projects/${projectId}/logs`, { method: 'POST', body: JSON.stringify({ level, step, source, message }) });
    if (!res.ok) throw new Error('Kon log niet toevoegen');
    return res.json();
  },
};

export const settings = {
  async get(): Promise<any> {
    const res = await apiFetch('/settings');
    if (!res.ok) throw new Error('Kon settings niet ophalen');
    return res.json();
  },
  async update(data: any): Promise<any> {
    const res = await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Kon settings niet updaten');
    return res.json();
  },
};

export const pipeline = {
  async executeStep(projectId: string, stepNumber: number): Promise<any> {
    const res = await apiFetch(`/projects/${projectId}/execute-step/${stepNumber}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Kon stap niet starten');
    }
    return res.json();
  },
  async getStepResult(projectId: string, stepNumber: number): Promise<any> {
    const res = await apiFetch(`/projects/${projectId}/step-result/${stepNumber}`);
    if (!res.ok) throw new Error('Kon resultaat niet ophalen');
    return res.json();
  },
};

export const imageOptions = {
  async getOptions(projectId: string): Promise<any> {
    const res = await apiFetch(`/projects/${projectId}/image-options`);
    if (!res.ok) throw new Error('Kon image opties niet ophalen');
    return res.json();
  },
  async getSelections(projectId: string): Promise<any> {
    const res = await apiFetch(`/projects/${projectId}/image-selections`);
    if (!res.ok) throw new Error('Kon selecties niet ophalen');
    return res.json();
  },
  async saveSelections(projectId: string, selections: any[]): Promise<any> {
    const res = await apiFetch(`/projects/${projectId}/image-selections`, {
      method: 'POST',
      body: JSON.stringify({ selections }),
    });
    if (!res.ok) throw new Error('Kon selecties niet opslaan');
    return res.json();
  },
  getImageUrl(projectId: string, filename: string): string {
    const token = localStorage.getItem('token') || '';
    return `/api/projects/${projectId}/image-file/${filename}?token=${token}`;
  },
};
