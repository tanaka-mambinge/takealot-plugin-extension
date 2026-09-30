import assert from "node:assert/strict";
import test from "node:test";
import { secretToolEnvironment } from "./session-store.ts";

test("uses the running user's session bus when Codex omitted its D-Bus address", () => {
  const env = secretToolEnvironment({ XDG_RUNTIME_DIR: "/run/user/1000", PATH: "/usr/bin" }, (path) => path === "/run/user/1000/bus");
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, "unix:path=/run/user/1000/bus");
  assert.equal(env.XDG_RUNTIME_DIR, "/run/user/1000");
  assert.equal(env.PATH, "/usr/bin");
});

test("preserves an existing session bus and never fabricates one when missing", () => {
  const existing = secretToolEnvironment({ DBUS_SESSION_BUS_ADDRESS: "unix:path=/custom/bus" }, () => { throw new Error("should not inspect fallback paths"); });
  assert.equal(existing.DBUS_SESSION_BUS_ADDRESS, "unix:path=/custom/bus");
  const absent = secretToolEnvironment({ DISPLAY: ":0" }, () => false);
  assert.equal(absent.DBUS_SESSION_BUS_ADDRESS, undefined);
});
