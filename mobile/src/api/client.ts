import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuth } from '../store/auth';

/** API base URL: EXPO_PUBLIC_API_URL, else app.json `extra.apiUrl`. "/api/v1" means the same site (production web). */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** A path from the API ("/media/…") as a full address players and downloads can open. */
export function mediaUrl(path: string) {
  if (/^(data:|https?:|blob:)/.test(path)) return path;
  const base = API_URL.startsWith('/') && Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}${API_URL}` : API_URL;
  return `${base}${path}`;
}

type Body = Record<string, unknown> | FormData | undefined;

export async function api<T>(path: string, options: { method?: string; body?: Body } = {}): Promise<T> {
  const token = useAuth.getState().token;
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      body: isForm ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'NETWORK');
  }
  if (res.status === 204) return {} as T;
  const json = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string; details?: { message: string }[] } } | null;
  if (!res.ok) {
    if (res.status === 401 && token) void useAuth.getState().logout();
    const err = json?.error ?? {};
    throw new ApiError(res.status, err.details?.[0]?.message || err.message || 'Request failed', err.code);
  }
  return (json ?? {}) as T;
}

/**
 * Upload with progress (fetch cannot report upload progress). `file` is a web File/Blob or a native
 * { uri, name, type } object.
 */
export function uploadVideo<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  const token = useAuth.getState().token;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection.', 'NETWORK'));
    xhr.onload = () => {
      let json: { error?: { message?: string; details?: { message: string }[] } } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json as T);
      else reject(new ApiError(xhr.status, json?.error?.details?.[0]?.message || json?.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.send(form);
  });
}
