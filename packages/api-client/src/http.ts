import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  getTenantId?: () => string | null;
  onUnauthorized?: () => void | Promise<void>;
  refreshAccessToken?: () => Promise<string | null>;
}

export interface ApiClient {
  raw: AxiosInstance;
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
}

export const createApiClient = (options: ApiClientOptions): ApiClient => {
  const instance = axios.create({
    baseURL: options.baseUrl,
    withCredentials: false,
  });

  instance.interceptors.request.use((config) => {
    const token = options.getAccessToken?.();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    const tenantId = options.getTenantId?.();
    if (tenantId) {
      config.headers.set('X-Tenant-Id', tenantId);
    }
    return config;
  });

  let isRefreshing = false;
  let pending: Array<() => void> = [];

  instance.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const original = error.config as
        | (AxiosRequestConfig & { _retry?: boolean })
        | undefined;
      if (error.response?.status === 401 && original && !original._retry) {
        if (!options.refreshAccessToken) {
          await options.onUnauthorized?.();
          return Promise.reject(error);
        }
        if (isRefreshing) {
          await new Promise<void>((resolve) => pending.push(resolve));
        } else {
          isRefreshing = true;
          try {
            const newToken = await options.refreshAccessToken();
            if (!newToken) {
              await options.onUnauthorized?.();
            }
          } catch (e) {
            await options.onUnauthorized?.();
          } finally {
            isRefreshing = false;
            pending.forEach((resolve) => resolve());
            pending = [];
          }
        }
        original._retry = true;
        return instance.request(original);
      }
      return Promise.reject(error);
    },
  );

  return {
    raw: instance,
    get: async <T,>(url, config) => (await instance.get<T>(url, config)).data,
    post: async <T,>(url, body, config) =>
      (await instance.post<T>(url, body, config)).data,
    patch: async <T,>(url, body, config) =>
      (await instance.patch<T>(url, body, config)).data,
    put: async <T,>(url, body, config) =>
      (await instance.put<T>(url, body, config)).data,
    delete: async <T,>(url, config) => (await instance.delete<T>(url, config)).data,
  };
};
