import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function buildCspHeader() {
  const apiOrigin = process.env.VITE_API_URL || "'self'";
  const connectSources = [
    "'self'",
    "ws:",
    "wss:",
    "http://localhost:*",
    "http://127.0.0.1:*"
  ];
  if (apiOrigin && apiOrigin !== "'self'") {
    connectSources.push(apiOrigin);
  }
  return [
    "default-src 'self'",
    // Inline script execution is not needed for the Vite app shell or React runtime.
    "script-src 'self'",
    // Inline style attributes and the injected CSS block in InspectFlowApp still require
    // an inline-style allowance for now; keep the policy narrow to styles only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
}

const securityHeaders = {
  "Content-Security-Policy": buildCspHeader(),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer"
};

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT) || 5173,
    headers: securityHeaders
  },
  preview: {
    headers: securityHeaders
  }
}));
