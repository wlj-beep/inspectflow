/**
 * BL-134 — Constraint Violations → Semantic 4xx
 *
 * Exercises the API boundary with a mocked DB layer so the global error
 * handler sees each pg SQLSTATE without requiring a live Postgres socket.
 */
import { PassThrough, Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn()
  }
}));

vi.mock("../src/db.js", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
  pool: mocks.pool
}));

const { default: app } = await import("../src/index.js");
let consoleErrorSpy;

function makePgError(code) {
  const err = new Error(`pg ${code}`);
  err.code = code;
  return err;
}

function createRequest({
  method = "POST",
  url = "/api/auth/login",
  body = { name: "constraint-test", password: "Inspectflow1!" },
  headers = {}
} = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  const req = new Readable({
    read() {
      this.push(payload);
      this.push(null);
    }
  });

  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.path = url;
  req.headers = {
    host: "localhost",
    "content-type": "application/json",
    "content-length": String(payload.length),
    ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]))
  };
  const socket = new PassThrough();
  socket.remoteAddress = "127.0.0.1";
  req.socket = socket;
  req.connection = socket;
  req.ip = "127.0.0.1";
  req.secure = false;
  req.get = req.header = (name) => req.headers[String(name).toLowerCase()];

  return req;
}

function createResponse(resolve, reject) {
  const response = {
    statusCode: 200,
    headers: {},
    body: undefined,
    rawBody: "",
    headersSent: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    removeHeader(name) {
      delete this.headers[String(name).toLowerCase()];
    },
    set(name, value) {
      this.setHeader(name, value);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.setHeader("content-type", "application/json; charset=utf-8");
      this.body = payload;
      this.end(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      if (payload && typeof payload === "object" && !Buffer.isBuffer(payload)) {
        return this.json(payload);
      }
      this.body = payload;
      this.end(payload == null ? "" : Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload));
      return this;
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      for (const [name, value] of Object.entries(headers)) {
        this.setHeader(name, value);
      }
    },
    end(chunk) {
      if (this.headersSent) return this;
      this.headersSent = true;
      this.rawBody = chunk == null ? "" : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (this.body === undefined) {
        try {
          this.body = this.rawBody ? JSON.parse(this.rawBody) : "";
        } catch {
          this.body = this.rawBody;
        }
      }
      resolve(this);
      return this;
    }
  };

  response.on = () => response;
  response.once = () => response;
  response.emit = () => true;
  response.flushHeaders = () => {};

  return response;
}

async function invokeApp(options = {}) {
  const req = createRequest(options);
  return await new Promise((resolve, reject) => {
    const res = createResponse(resolve, reject);
    try {
      app.handle(req, res, (err) => {
        if (err) {
          reject(err);
        } else if (!res.headersSent) {
          res.end();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

describe("BL-134 — Constraint violation → semantic 4xx", () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockReset();
    mocks.transaction.mockReset();
    mocks.pool.query.mockReset();
    mocks.pool.connect.mockReset();
    mocks.pool.end.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = undefined;
  });

  it.each([
    ["23505", 409, { error: "conflict", detail: "duplicate_value" }],
    ["23503", 409, { error: "conflict", detail: "reference_not_found" }],
    ["23502", 422, { error: "validation_error", detail: "required_field_missing" }],
    ["23514", 422, { error: "validation_error", detail: "constraint_check_failed" }]
  ])("maps %s to a stable %s response", async (code, status, body) => {
    mocks.transaction.mockImplementationOnce(async () => {
      throw makePgError(code);
    });

    const res = await invokeApp({
      body: { name: `constraint-${code}`, password: "Inspectflow1!" }
    });

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual(body);
  });
});
