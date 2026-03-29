const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:4000" : "");

export async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return res.status === 204 ? null : res.json();
}

export async function apiFetchText(path, { method = "GET" } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {}
  });
  if (!res.ok) {
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return res.text();
}

export async function apiFetchVariants(variants, options = {}) {
  let lastError = null;
  for (const variant of variants) {
    const path = typeof variant === "string" ? variant : variant?.path;
    if (!path) continue;
    const requestOptions = {
      ...options,
      ...(variant?.method ? { method: variant.method } : null),
      ...(Object.prototype.hasOwnProperty.call(variant || {}, "body") ? { body: variant.body } : null)
    };
    try {
      return await apiFetch(path, requestOptions);
    } catch (err) {
      lastError = err;
      if (![404, 405].includes(Number(err?.status))) {
        throw err;
      }
    }
  }
  throw lastError || new Error("not_found");
}

export async function apiFetchVariantsText(variants, options = {}) {
  let lastError = null;
  for (const variant of variants) {
    const path = typeof variant === "string" ? variant : variant?.path;
    if (!path) continue;
    const requestOptions = {
      ...options,
      ...(variant?.method ? { method: variant.method } : null),
      ...(Object.prototype.hasOwnProperty.call(variant || {}, "body") ? { body: variant.body } : null)
    };
    try {
      return await apiFetchText(path, requestOptions);
    } catch (err) {
      lastError = err;
      if (![404, 405].includes(Number(err?.status))) {
        throw err;
      }
    }
  }
  throw lastError || new Error("not_found");
}
