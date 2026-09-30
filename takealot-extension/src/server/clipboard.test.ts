import assert from "node:assert/strict";
import test from "node:test";
import { copyText } from "../ui/clipboard.ts";

test("copies the sign-in link when clipboard access is granted", async () => {
  let copied = "";
  const result = await copyText("http://127.0.0.1:1234/sign-in?token=temporary", {
    writeText: async (value) => { copied = value; },
  });
  assert.equal(result, true);
  assert.equal(copied, "http://127.0.0.1:1234/sign-in?token=temporary");
});

test("reports missing or denied clipboard access for the manual-copy fallback", async () => {
  assert.equal(await copyText("http://127.0.0.1/sign-in"), false);
  assert.equal(await copyText("http://127.0.0.1/sign-in", { writeText: async () => { throw new Error("denied"); } }), false);
});
