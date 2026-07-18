import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

async function readJson(relativePath: string): Promise<unknown> {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(await readFile(filePath, "utf8"));
}

interface AgentManifest {
  name: string;
  description: string;
  auth: {
    model: string;
    description: string;
    setup_command: string;
    clear_command: string;
  };
  mcp: {
    protocol: string;
    transport: string;
    invocation: Record<string, string>;
    tools: Array<{ name: string; description: string; parameters: unknown }>;
  };
  rate_limits: Record<string, unknown>;
}

describe(".well-known/agent.json", () => {
  it("is valid JSON with the required top-level shape", async () => {
    const manifest = (await readJson("../.well-known/agent.json")) as AgentManifest;
    expect(typeof manifest.name).toBe("string");
    expect(manifest.description.toLowerCase()).toContain("byok");
    expect(manifest.description.toLowerCase()).toContain("official");
  });

  it("declares the BYOK auth requirement and the CLI commands to set up / clear credentials", async () => {
    const manifest = (await readJson("../.well-known/agent.json")) as AgentManifest;
    expect(manifest.auth.model).toBe("byok");
    expect(manifest.auth.setup_command).toContain("auditreach auth --platform");
    expect(manifest.auth.clear_command).toContain("--clear");
    expect(manifest.auth.description.toLowerCase()).not.toContain("shared credential");
  });

  it("declares protocol mcp over stdio, with real npx/installed invocation commands", async () => {
    const manifest = (await readJson("../.well-known/agent.json")) as AgentManifest;
    expect(manifest.mcp.protocol).toBe("mcp");
    expect(manifest.mcp.transport).toBe("stdio");
    expect(manifest.mcp.invocation.npx).toBe("npx auditreach-cli mcp");
    expect(manifest.mcp.invocation.installed).toBe("auditreach mcp");
  });

  it("lists exactly the 3 MCP tools this PR implements, each with a parameter schema", async () => {
    const manifest = (await readJson("../.well-known/agent.json")) as AgentManifest;
    const names = manifest.mcp.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["auth_status", "search", "verify_log"]);
    for (const tool of manifest.mcp.tools) {
      expect(tool.parameters).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("never claims to expose credential set/clear as a tool", async () => {
    const manifest = (await readJson("../.well-known/agent.json")) as AgentManifest;
    const toolNames = manifest.mcp.tools.map((tool) => tool.name);
    expect(toolNames).not.toContain("auth_set");
    expect(toolNames).not.toContain("auth_clear");
    expect(toolNames).not.toContain("auth");
  });

  it("does not fabricate a numeric rate limit -- only a note pointing at the underlying platform APIs", async () => {
    const manifest = (await readJson("../.well-known/agent.json")) as AgentManifest;
    expect(Object.keys(manifest.rate_limits)).toEqual(["note"]);
    expect(typeof manifest.rate_limits.note).toBe("string");
    // No bare numeric-rate-limit phrasing like "100 requests/min" anywhere in the note.
    expect(manifest.rate_limits.note).not.toMatch(
      /\d+\s*(requests?|calls?)\s*(\/|per)\s*(sec|second|min|minute|hour|day)/i,
    );
  });

  it("ships in the published npm package via package.json's files field", async () => {
    const pkg = (await readJson("../package.json")) as { files: string[] };
    expect(pkg.files).toContain(".well-known");
  });
});
