import { useEffect, useState } from 'react';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('暂时无法连接服务，请检查网络后重试');
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith('/login'))
      window.dispatchEvent(new Event('hs-auth-expired'));
    throw new ApiError(response.status, data.error || '操作失败，请稍后重试');
  }
  return data as T;
}
export const post = <T>(path: string, data: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export const put = <T>(path: string, data: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(data) });
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, setData, error, loading, reload: () => setVersion((v) => v + 1) };
}
