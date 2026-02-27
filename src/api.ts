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

// ── Pipeline Engine API ──

export const pipelineEngine = {
  async start(projectId: string): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/start`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon pipeline niet starten'); }
    return res.json();
  },
  async pause(projectId: string): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/pause`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon pipeline niet pauzeren'); }
    return res.json();
  },
  async resume(projectId: string): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/resume`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon pipeline niet hervatten'); }
    return res.json();
  },
  async approve(projectId: string, stepNumber: number): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/approve/${stepNumber}`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon stap niet goedkeuren'); }
    return res.json();
  },
  async feedback(projectId: string, stepNumber: number, feedback: string): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/feedback/${stepNumber}`, {
      method: 'POST', body: JSON.stringify({ feedback }),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon feedback niet versturen'); }
    return res.json();
  },
  async skip(projectId: string, stepNumber: number): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/skip/${stepNumber}`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon stap niet overslaan'); }
    return res.json();
  },
  async retry(projectId: string, stepNumber: number): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/retry/${stepNumber}`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon stap niet opnieuw starten'); }
    return res.json();
  },
  async approveScene(projectId: string, sceneId: number, imagePath: string, clipOption: string): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/approve-scene`, {
      method: 'POST', body: JSON.stringify({ sceneId, imagePath, clipOption }),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon scene niet goedkeuren'); }
    return res.json();
  },
  async getStatus(projectId: string): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/status`);
    if (!res.ok) throw new Error('Kon pipeline status niet ophalen');
    return res.json();
  },
  async stop(projectId: string): Promise<any> {
    const res = await apiFetch(`/pipeline/${projectId}/stop`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon pipeline niet stoppen'); }
    return res.json();
  },
};

// ── Queue API ──

export const queue = {
  async getQueue(): Promise<any> {
    const res = await apiFetch('/pipeline/queue');
    if (!res.ok) throw new Error('Kon wachtrij niet ophalen');
    return res.json();
  },
  async setPriority(projectId: string, priority: number): Promise<any> {
    const res = await apiFetch(`/pipeline/queue/${projectId}/priority`, {
      method: 'PATCH', body: JSON.stringify({ priority }),
    });
    if (!res.ok) throw new Error('Kon prioriteit niet aanpassen');
    return res.json();
  },
  async dequeue(projectId: string): Promise<any> {
    const res = await apiFetch(`/pipeline/queue/${projectId}/dequeue`, { method: 'POST' });
    if (!res.ok) throw new Error('Kon project niet uit wachtrij halen');
    return res.json();
  },
  async startNext(): Promise<any> {
    const res = await apiFetch('/pipeline/queue/start-next', { method: 'POST' });
    if (!res.ok) throw new Error('Kon volgende project niet starten');
    return res.json();
  },
};

// ── Styles API ──

export const styles = {
  async getAll(): Promise<any[]> {
    const res = await apiFetch('/styles');
    if (!res.ok) throw new Error('Kon styles niet ophalen');
    return res.json();
  },
  async get(id: string): Promise<any> {
    const res = await apiFetch('/styles/' + id);
    if (!res.ok) throw new Error('Style niet gevonden');
    return res.json();
  },
  async create(data: any): Promise<any> {
    const res = await apiFetch('/styles', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon style niet aanmaken'); }
    return res.json();
  },
  async update(id: string, data: any): Promise<any> {
    const res = await apiFetch('/styles/' + id, { method: 'PUT', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Kon style niet updaten'); }
    return res.json();
  },
  async remove(id: string): Promise<void> {
    const res = await apiFetch('/styles/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Kon style niet verwijderen');
  },
};

export const channels = {
  async getAll() {
    const res = await apiFetch('/channels');
    if (!res.ok) throw new Error('Kon kanalen niet ophalen');
    return res.json();
  },
  async create(data: any) {
    const res = await apiFetch('/channels', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Aanmaken mislukt'); }
    return res.json();
  },
  async update(id: string, data: any) {
    const res = await apiFetch('/channels/' + id, { method: 'PUT', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Bijwerken mislukt'); }
    return res.json();
  },
  async remove(id: string) {
    const res = await apiFetch('/channels/' + id, { method: 'DELETE' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Verwijderen mislukt'); }
    return res.json();
  },
};

export const voices = {
  async getAll() {
    const res = await apiFetch('/voices');
    if (!res.ok) throw new Error('Kon voices niet ophalen');
    return res.json();
  },
  async create(data: any) {
    const res = await apiFetch('/voices', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Aanmaken mislukt'); }
    return res.json();
  },
  async update(id: string, data: any) {
    const res = await apiFetch('/voices/' + id, { method: 'PUT', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Bijwerken mislukt'); }
    return res.json();
  },
  async remove(id: string) {
    const res = await apiFetch('/voices/' + id, { method: 'DELETE' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Verwijderen mislukt'); }
    return res.json();
  },
  async seed() {
    const res = await apiFetch('/voices/seed', { method: 'POST' });
    return res.json();
  },
};

// ── Ideation API ──

export const ideation = {
  async brainstorm(channelId: string): Promise<any> {
    const res = await apiFetch('/ideation/brainstorm', { method: 'POST', body: JSON.stringify({ channelId }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Brainstorm mislukt'); }
    return res.json();
  },
  async getIdeas(channelId?: string): Promise<any[]> {
    const query = channelId ? `?channelId=${channelId}` : '';
    const res = await apiFetch(`/ideation/ideas${query}`);
    if (!res.ok) throw new Error('Kon ideeën niet ophalen');
    return res.json();
  },
  async saveIdea(data: any): Promise<any> {
    const res = await apiFetch('/ideation/ideas', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Opslaan mislukt'); }
    return res.json();
  },
  async updateIdea(id: string, data: any): Promise<any> {
    const res = await apiFetch(`/ideation/ideas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Bijwerken mislukt'); }
    return res.json();
  },
  async deleteIdea(id: string): Promise<void> {
    const res = await apiFetch(`/ideation/ideas/${id}`, { method: 'DELETE' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Verwijderen mislukt'); }
  },
  async convertToProject(ideaId: string): Promise<any> {
    const res = await apiFetch(`/ideation/convert/${ideaId}`, { method: 'POST' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Conversie mislukt'); }
    return res.json();
  },
  async getSimilarChannels(channelId: string): Promise<any> {
    const res = await apiFetch(`/ideation/similar-channels/${channelId}`);
    if (!res.ok) throw new Error('Kon vergelijkbare kanalen niet ophalen');
    return res.json();
  },
};
