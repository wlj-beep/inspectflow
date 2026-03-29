import request from "supertest";
import app from "../../src/index.js";

export function roleHeader(role) {
  return { "x-user-role": role };
}

export function withRole(role) {
  return {
    get(path) {
      return request(app).get(path).set("x-user-role", role);
    },
    post(path) {
      return request(app).post(path).set("x-user-role", role);
    },
    put(path) {
      return request(app).put(path).set("x-user-role", role);
    },
    delete(path) {
      return request(app).delete(path).set("x-user-role", role);
    }
  };
}
