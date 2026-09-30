import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { TakealotAccountClient } from "./account.ts";

type PendingOtp = { email: string; password: string; cookies: Record<string, string>; expiresAt: number };
type ActiveLogin = { url: string; close: () => void };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function page(message = "", error = false, email = "", otp = false, success = false): string {
  const status = message ? `<p class="status ${error ? "error" : "ok"}" role="${error ? "alert" : "status"}">${escapeHtml(message)}</p>` : "";
  const content = success
    ? `<h1>Takealot connected</h1><p class="intro">You’re signed in. Your session is saved in this computer’s password vault. You can close this tab.</p>`
    : `<h1>Connect your Takealot account</h1><p class="intro">Sign in to let the Takealot Extension manage your wishlists. Your password is sent directly to Takealot and is not shared with the assistant.</p>${status}<form method="post" autocomplete="on">${otp
      ? `<input type="hidden" name="step" value="otp"><p class="hint">Takealot sent a one-time password. Enter it below to finish signing in.</p><label for="otp">One-time password</label><input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" required autofocus><label class="check"><input type="checkbox" name="trust" value="true" checked> Trust this device</label><button type="submit">Verify and sign in</button>`
      : `<label for="email">Email address</label><input id="email" name="email" type="email" value="${escapeHtml(email)}" autocomplete="username" autocapitalize="none" required autofocus><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in to Takealot</button>`
    }</form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Takealot Extension sign in</title><style>
    :root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#20252b;background:#f4f7f9}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:18px}.card{width:min(100%,420px);background:white;border:1px solid #dce2e7;border-radius:12px;box-shadow:0 10px 28px #18233818;overflow:hidden}.brand{padding:16px 24px;background:#1682c4;color:white;font-weight:700;letter-spacing:.01em}.content{padding:26px}h1{margin:0;font-size:24px;line-height:1.2}.intro{margin:10px 0 22px;color:#626b74;font-size:14px;line-height:1.5}label{display:block;margin:16px 0 6px;font-size:14px;font-weight:650}input:not([type=checkbox]){width:100%;height:46px;padding:10px 12px;border:1px solid #bac4cc;border-radius:7px;font:inherit}input:focus{outline:2px solid #1682c4;outline-offset:1px}.check{display:flex;align-items:center;gap:9px;font-weight:400}.check input{width:18px;height:18px;accent-color:#1682c4}button{width:100%;min-height:46px;margin-top:22px;border:0;border-radius:7px;background:#1682c4;color:white;font:inherit;font-weight:700;cursor:pointer}button:hover{background:#086ea9}.status{padding:10px 12px;border-radius:7px;font-size:14px}.error{background:#fff0ef;color:#a5221d}.ok{background:#edf8f1;color:#1b713c}.hint{margin:0 0 18px;color:#626b74;font-size:14px;line-height:1.5}button:focus-visible{outline:2px solid #164b72;outline-offset:3px}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
    </style></head><body><main class="card"><header class="brand">Takealot Extension</header><section class="content">${content}</section></main></body></html>`;
}

function sendPage(response: ServerResponse, status: number, content: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(content);
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 16_384) throw new Error("The submitted form is too large.");
  }
  return new URLSearchParams(body);
}

export class LocalLoginFlow {
  private active?: ActiveLogin;
  private readonly api: TakealotAccountClient;

  constructor(api: TakealotAccountClient) {
    this.api = api;
  }

  async start(): Promise<{ url: string }> {
    if (this.active) return { url: this.active.url };
    const token = randomBytes(24).toString("base64url");
    let pending: PendingOtp | undefined;
    let serverInstance: ReturnType<typeof createServer>;
    let expiryTimer: NodeJS.Timeout | undefined;
    const close = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      pending = undefined;
      if (serverInstance.listening) serverInstance.close();
      this.active = undefined;
    };
    serverInstance = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.searchParams.get("token") !== token || url.pathname !== "/takealot-extension-login") {
        sendPage(response, 404, page("This sign-in link has expired. Start sign-in again.", true));
        return;
      }
      if (request.method === "GET") {
        sendPage(response, 200, page());
        return;
      }
      if (request.method !== "POST") {
        sendPage(response, 405, page("This page only accepts sign-in form submissions.", true));
        return;
      }
      let otpStep = false;
      try {
        const form = await readForm(request);
        if (form.get("step") === "otp") {
          otpStep = true;
          if (!pending || pending.expiresAt < Date.now()) {
            pending = undefined;
            sendPage(response, 400, page("Sign-in expired. Start again from the extension.", true));
            return;
          }
          await this.api.finishLogin(pending.email, pending.password, form.get("otp") ?? "", pending.cookies, form.get("trust") === "true");
          pending = undefined;
          sendPage(response, 200, page("Signed in successfully.", false, "", false, true));
          close();
          return;
        }
        const email = form.get("email") ?? "";
        const password = form.get("password") ?? "";
        const result = await this.api.beginLogin(email, password);
        if ("otpRequired" in result) {
          pending = { email: email.trim(), password, cookies: result.cookies, expiresAt: Date.now() + 5 * 60_000 };
          sendPage(response, 200, page("Takealot requires a one-time password.", false, email, true));
          return;
        }
        sendPage(response, 200, page("Signed in successfully.", false, "", false, true));
        close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sign-in failed. Try again.";
        sendPage(response, 400, page(message, true, pending?.email ?? "", otpStep && Boolean(pending)));
      }
    });
    serverInstance.on("error", () => { close(); });
    await new Promise<void>((resolve, reject) => {
      serverInstance.once("error", reject);
      serverInstance.listen(0, "127.0.0.1", () => resolve());
    });
    const address = serverInstance.address() as AddressInfo;
    const link = `http://127.0.0.1:${address.port}/takealot-extension-login?token=${encodeURIComponent(token)}`;
    expiryTimer = setTimeout(close, 5 * 60_000);
    expiryTimer.unref();
    this.active = { url: link, close };
    return { url: link };
  }
}
