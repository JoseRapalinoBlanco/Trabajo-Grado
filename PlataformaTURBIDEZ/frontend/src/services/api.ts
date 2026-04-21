// Centralized API Service Layer
// All fetch calls use relative paths — Vite proxy handles dev, Traefik handles prod.

const API = '/api/v1';

// --- Public Endpoints ---

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  turbidity_ntu: number;
  date: string;
}

export interface HeatmapResponse {
  data: HeatmapPoint[];
  count: number;
}

export async function fetchHeatmapData(startDate: string, endDate: string, satellite = 'S3', algorithm = 'SVR'): Promise<HeatmapResponse> {
  const res = await fetch(`${API}/turbidity/heatmap?start_date=${startDate}&end_date=${endDate}&satellite=${satellite}&algorithm=${algorithm}`);
  if (!res.ok) throw new Error('Failed to fetch heatmap data');
  return res.json();
}

export async function fetchRangeStats(startDate: string, endDate: string, satellite = 'S3', algorithm = 'SVR') {
  const res = await fetch(`${API}/turbidity/analytics/range-stats?start_date=${startDate}&end_date=${endDate}&satellite=${satellite}&algorithm=${algorithm}`);
  if (!res.ok) throw new Error('Failed to fetch range stats');
  return res.json();
}

export async function fetchComparativeDelta(dateA: string, dateB: string, satellite = 'S3', algorithm = 'SVR') {
  const res = await fetch(`${API}/turbidity/analytics/comparative-delta?date_a=${dateA}&date_b=${dateB}&satellite=${satellite}&algorithm=${algorithm}`);
  if (!res.ok) throw new Error('Failed to fetch comparative delta');
  return res.json();
}

export interface DownloadPublicOpts {
  format: string;
  startDate?: string;
  endDate?: string;
  satellite?: string;
  algorithm?: string;
}

export function buildPublicDownloadUrl(opts: DownloadPublicOpts): string {
  let url = `${API}/turbidity/download?format=${opts.format}&satellite=${opts.satellite || 'S3'}&algorithm=${opts.algorithm || 'SVR'}`;
  if (opts.startDate) url += `&start_date=${opts.startDate}`;
  if (opts.endDate) url += `&end_date=${opts.endDate}`;
  return url;
}

// --- Auth Endpoints ---

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json();
}

export async function inviteAdmin(token: string, email: string) {
  const res = await fetch(`${API}/auth/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error inviting user');
  return data;
}

// --- Admin Endpoints ---

export interface FetchTableOpts {
  limit?: number;
  startDate?: string;
  endDate?: string;
  satellite?: string;
}

export async function fetchTableData(token: string, opts: FetchTableOpts = {}) {
  let url = `${API}/admin/data?limit=${opts.limit ?? 50}&satellite=${opts.satellite || 'S3'}`;
  if (opts.startDate) url += `&start_date=${opts.startDate}`;
  if (opts.endDate) url += `&end_date=${opts.endDate}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch data');
  return res.json();
}

export interface DeleteDataOpts {
  password: string;
  startDate?: string | null;
  endDate?: string | null;
  satellite?: string;
}

export async function deleteData(token: string, opts: DeleteDataOpts) {
  const res = await fetch(`${API}/admin/data`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      password: opts.password,
      start_date: opts.startDate || null,
      end_date: opts.endDate || null,
      satellite: opts.satellite || 'S3'
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Delete failed');
  return data;
}

export async function downloadAdminData(token: string, format: string, startDate?: string, endDate?: string, satellite = 'S3'): Promise<Blob> {
  let url = `${API}/admin/download?format=${format}&satellite=${satellite}`;
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}

export async function uploadData(token: string, file: File, satellite = 'S3') {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API}/admin/upload-data?satellite=${satellite}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Upload failed');
  return data;
}
