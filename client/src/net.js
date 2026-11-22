export async function api(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: { message: `Server replied ${res.status}.` } }));
  if (!data.ok && data.error) throw Object.assign(new Error(data.error.message), { code: data.error.code });
  return data;
}

let metaPromise;
export function loadMeta() {
  metaPromise ??= fetch('/api/meta').then((r) => r.json());
  return metaPromise;
}
