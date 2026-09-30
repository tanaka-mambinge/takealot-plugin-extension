import { spawn } from "node:child_process";

export type TakealotSession = {
  jwt: string;
  idToken?: string;
  refreshToken: string;
  csrfToken?: string;
  trackingId?: string;
  customerId: string;
  did?: string;
  jwtExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  cookies?: Record<string, string>;
};

export interface SessionStore {
  load(): Promise<TakealotSession | undefined>;
  save(session: TakealotSession): Promise<void>;
  delete(): Promise<void>;
}

const ATTRIBUTES = ["service", "takealot-extension", "account", "default"];
const NOT_FOUND = /secret not found|no such secret|object does not exist/i;
type SecretToolRunner = (args: string[], input?: string) => Promise<string>;

class MissingSecretError extends Error {}

function secretTool(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("secret-tool", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", () => reject(new Error("Linux Secret Service is unavailable. Unlock your desktop password vault and try again.")));
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trimEnd());
      else if (code === 1 && !stderr.trim() && ["lookup", "clear"].includes(args[0] ?? "")) reject(new MissingSecretError("No saved Takealot session."));
      else reject(new Error(stderr || `secret-tool exited with code ${code ?? "unknown"}`));
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Stores session material in the desktop's Secret Service keyring, never in a file. */
export class SystemSessionStore implements SessionStore {
  private readonly runSecretTool: SecretToolRunner;

  constructor(runSecretTool: SecretToolRunner = secretTool) {
    this.runSecretTool = runSecretTool;
  }

  async load(): Promise<TakealotSession | undefined> {
    try {
      const encoded = await this.runSecretTool(["lookup", ...ATTRIBUTES]);
      const session = JSON.parse(encoded) as TakealotSession;
      if (!session.jwt || !session.refreshToken || !session.customerId) {
        throw new Error("Saved Takealot session is incomplete. Sign in again.");
      }
      return session;
    } catch (error) {
      if (error instanceof MissingSecretError) return undefined;
      if (error instanceof Error && NOT_FOUND.test(error.message)) return undefined;
      if (error instanceof SyntaxError) throw new Error("Saved Takealot session is unreadable. Sign in again.");
      throw new Error(`Could not read the system password vault: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async save(session: TakealotSession): Promise<void> {
    if (!session.jwt || !session.refreshToken || !session.customerId) {
      throw new Error("Takealot did not return a complete sign-in session.");
    }
    try {
      await this.runSecretTool(["store", "--label=Takealot Extension session", ...ATTRIBUTES], JSON.stringify(session));
    } catch (error) {
      throw new Error(`Could not save the session in the system password vault: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async delete(): Promise<void> {
    try {
      await this.runSecretTool(["clear", ...ATTRIBUTES]);
    } catch (error) {
      if (error instanceof MissingSecretError) return;
      if (error instanceof Error && NOT_FOUND.test(error.message)) return;
      throw new Error(`Could not remove the session from the system password vault: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}
