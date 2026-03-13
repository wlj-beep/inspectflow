const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function apiFetch(path, { method = "GET", body, role } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-user-role": role } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

export async function apiFetchText(path, { method = "GET", role } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(role ? { "x-user-role": role } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.text();
}
