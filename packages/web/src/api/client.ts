const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error || 'Request failed'), { status: res.status, data: body });
  }
  return res.json();
}

// Auth
export const auth = {
  register: (email: string, password: string, displayName: string) =>
    request<Parent>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
  login: (email: string, password: string) =>
    request<Parent>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request<Parent>('/auth/me'),
};

// Children
export const children = {
  list: () => request<Child[]>('/children'),
  create: (data: CreateChildInput) =>
    request<Child>('/children', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateChildInput>) =>
    request<Child>(`/children/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/children/${id}`, { method: 'DELETE' }),
  options: () => request<{ avatars: string[]; interests: string[] }>('/children/options'),
};

// Stories
export const stories = {
  generate: (childId: string, themePrompt?: string) =>
    request<{ storyId: string; status: string; quotaRemaining: number }>('/stories/generate', {
      method: 'POST', body: JSON.stringify({ childId, themePrompt }),
    }),
  get: (id: string) => request<Story>(`/stories/${id}`),
  byChild: (childId: string, page = 1) =>
    request<{ stories: StorySummary[]; total: number }>(`/stories/by-child/${childId}?page=${page}`),
  favorite: (id: string) =>
    request<{ isFavorite: boolean }>(`/stories/${id}/favorite`, { method: 'PATCH' }),
  delete: (id: string) => request(`/stories/${id}`, { method: 'DELETE' }),
  quota: () => request<QuotaInfo>('/stories/quota/today'),
  track: (name: string, props?: Record<string, unknown>, childId?: string, storyId?: string) =>
    request('/stories/track', { method: 'POST', body: JSON.stringify({ name, properties: props, childId, storyId }) }),
};

// Types
export interface Parent {
  id: string; email: string; displayName: string; tier: string;
}
export interface Child {
  id: string; name: string; age: number; avatar: string;
  interests: string[]; namePronunciation?: string; createdAt: number;
}
export interface CreateChildInput {
  name: string; age: number; avatar: string;
  interests: string[]; namePronunciation?: string;
}
export interface StoryPage {
  id: string; page_number: number; text: string; illustration_prompt: string;
}
export interface Story {
  id: string; title: string; status: string; is_favorite: number;
  page_count: number; word_count: number; created_at: number;
  theme_prompt?: string; llm_latency_ms?: number;
  pages: StoryPage[];
  child?: { id: string; name: string; avatar: string };
}
export interface StorySummary {
  id: string; title: string; status: string; is_favorite: number;
  page_count: number; word_count: number; created_at: number;
}
export interface QuotaInfo {
  used: number; limit: number | null; remaining: number | null; isPremium: boolean;
}
