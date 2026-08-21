import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

/**
 * mc-mod-config-mcp — Minecraft Mod Configuration File Management MCP Server
 *
 * Tools:
 *   - read_mod_config: Read and parse a mod config file (.cfg, .toml, .json)
 *   - list_mod_configs: List all config files in a modpack/mods directory
 *   - validate_mod_configs: Validate all configs for common issues
 *   - compare_mod_configs: Compare two sets of mod configs (before/after update)
 *   - find_orphaned_configs: Find configs for mods that are no longer installed
 *   - get_mod_default_config: Get the default config for a known mod (from bundled defaults)
 */

// ── Forge .cfg parser ────────────────────────────────────────────────
function parseForgeCfg(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const currentSection: Record<string, any> = {};
  let currentPath = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentPath = sectionMatch[1];
      currentSection[currentPath] = {};
      continue;
    }

    const eqIdx = line.indexOf("=");
    if (eqIdx > 0 && currentPath) {
      const key = line.substring(0, eqIdx).trim();
      let value = line.substring(eqIdx + 1).trim();
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Type detection
      if (value === "true" || value === "false") {
        currentSection[currentPath][key] = value === "true";
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        currentSection[currentPath][key] = parseFloat(value);
      } else {
        currentSection[currentPath][key] = value;
      }
    }
  }
  return currentSection;
}

// ── Simple TOML parser (covers Fabric config format) ─────────────────
function parseToml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentSection = result;
  let stack: Array<{ map: Record<string, any>; key: string }> = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;

    const tableMatch = line.match(/^\[(.+)\]$/);
    if (tableMatch) {
      const sections = tableMatch[1].split(".").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      currentSection = result;
      stack = [];
      for (const sec of sections) {
        if (!(sec in currentSection)) {
          currentSection[sec] = {};
          stack.push({ map: currentSection, key: sec });
        }
        currentSection = currentSection[sec] as Record<string, any>;
      }
      continue;
    }

    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const key = line.substring(0, eqIdx).trim().replace(/^["']|["']$/g, "");
      let value = line.substring(eqIdx + 1).trim();
      // Handle arrays [a, b, c]
      if (value.startsWith("[") && value.endsWith("]")) {
        const inner = value.slice(1, -1);
        currentSection[key] = inner.split(",").map((v) => parseTomlValue(v.trim()));
        continue;
      }
      currentSection[key] = parseTomlValue(value);
    }
  }
  return result;
}

function parseTomlValue(value: string): any {
  if (value === "true" || value === "false") return value === "true";
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

// ── Read a config file ───────────────────────────────────────────────
function readConfigFile(filePath: string): { content: Record<string, any>; format: string; issues: string[] } {
  const ext = path.extname(filePath).toLowerCase();
  const issues: string[] = [];
  let content: Record<string, any>;
  let format: string;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      issues.push("Config file is empty");
      return { content: {}, format: ext.replace(".", ""), issues };
    }

    switch (ext) {
      case ".cfg":
        format = "forge_cfg";
        content = parseForgeCfg(raw);
        break;
      case ".toml":
        format = "toml";
        content = parseToml(raw);
        break;
      case ".json":
        format = "json";
        content = JSON.parse(raw);
        break;
      default:
        issues.push(`Unsupported config format: ${ext}`);
        return { content: {}, format: ext.replace(".", ""), issues };
    }
  } catch (e: any) {
    issues.push(`Parse error: ${e.message}`);
    content = {};
    format = ext.replace(".", "");
  }

  return { content, format, issues };
}

// ── Scan config directory ────────────────────────────────────────────
function scanConfigDir(configDir: string): Array<{ path: string; file: string; modId: string; format: string; size: number }> {
  const configs: Array<{ path: string; file: string; modId: string; format: string; size: number }> = [];
  if (!fs.existsSync(configDir)) return configs;

  function walk(dir: string, relPrefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".cfg", ".toml", ".json"].includes(ext)) {
          try {
            const stat = fs.statSync(full);
            const modId = rel.split(/[/\\]/)[0];
            const formatMap: Record<string, string> = { ".cfg": "forge_cfg", ".toml": "toml", ".json": "json" };
            configs.push({ path: full, file: rel, modId, format: formatMap[ext] || ext.replace(".", ""), size: stat.size });
          } catch { /* ignore */ }
        }
      }
    }
  }
  walk(configDir, "");
  return configs;
}

// ── Build mod registry from mods directory ──────────────────────────
function buildModRegistry(modsDir: string): Map<string, { version?: string; name?: string; filePath: string }> {
  const registry = new Map<string, { version?: string; name?: string; filePath: string }>();
  if (!fs.existsSync(modsDir)) return registry;
  for (const entry of fs.readdirSync(modsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".jar")) {
      const modId = entry.name.replace(/\.jar$/i, "").toLowerCase();
      registry.set(modId, { filePath: path.join(modsDir, entry.name) });
      // Try to extract mod info from jar (simplified: just use filename)
    }
  }
  return registry;
}

// ── Built-in known mod defaults ──────────────────────────────────────
const KNOWN_MOD_DEFAULTS: Record<string, { name: string; fallbackConfig: Record<string, any> }> = {
  "sodium": { name: "Sodium", fallbackConfig: { render_distance: 8, advanced: { memory_trash_limit: 256 } } },
  "optifine": { name: "OptiFine", fallbackConfig: { Fps: "normal", Graphics: " fancy" } },
  "phosphor": { name: "Phosphor", fallbackConfig: { light_pipeline: true } },
  "lithium": { name: "Lithium", fallbackConfig: {} },
  "fabric-api": { name: "Fabric API", fallbackConfig: {} },
};

function getKnownModInfo(modId: string): { name: string; hasConfig: boolean; fallbackConfig: Record<string, any> } | null {
  const info = KNOWN_MOD_DEFAULTS[modId.toLowerCase()];
  if (!info) return null;
  return { name: info.name, hasConfig: false, fallbackConfig: info.fallbackConfig };
}

// ── Validation ───────────────────────────────────────────────────────
function validateConfigValues(config: Record<string, any>, filePath: string): Array<{ key: string; issue: string; severity: string }> {
  const findings: Array<{ key: string; issue: string; severity: string }> = [];
  function walk(obj: any, prefix: string) {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        walk(obj[i], `${prefix}[${i}]`);
      }
      return;
    }
    if (typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v === "" || v === null || v === undefined) {
        findings.push({ key: fullKey, issue: "Empty or null value", severity: "warning" });
      }
      if (typeof v === "number" && (isNaN(v) || !isFinite(v))) {
        findings.push({ key: fullKey, issue: "Invalid numeric value", severity: "error" });
      }
      if (typeof v === "string" && v.length > 500) {
        findings.push({ key: fullKey, issue: `String value very long (${v.length} chars)`, severity: "warning" });
      }
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        walk(v, fullKey);
      }
    }
  }
  walk(config, "");
  return findings;
}

// ── Exported public API ──────────────────────────────────────────────

export function readModConfigExport(configPath: string): { content: Record<string, any>; format: string; issues: string[]; source: string } {
  const resolved = path.resolve(configPath);
  const { content, format, issues } = readConfigFile(resolved);
  return { content, format, issues, source: path.basename(resolved) };
}

export function listModConfigsExport(configDir: string): { configs: Array<{ file: string; modId: string; format: string; size: number }>; total: number; source: string } {
  const resolved = path.resolve(configDir);
  const configs = scanConfigDir(resolved);
  return { configs, total: configs.length, source: path.basename(resolved) };
}

export function validateModConfigsExport(configDir: string): { findings: Array<{ file: string; modId: string; key: string; issue: string; severity: string }>; summary: { totalConfigs: number; totalIssues: number; errors: number; warnings: number }; source: string } {
  const resolved = path.resolve(configDir);
  const configs = scanConfigDir(resolved);
  const allFindings: Array<{ file: string; modId: string; key: string; issue: string; severity: string }> = [];
  let errors = 0, warnings = 0;

  for (const cfg of configs) {
    const { content, format, issues: parseIssues } = readConfigFile(cfg.path);
    for (const iss of parseIssues) {
      allFindings.push({ file: cfg.file, modId: cfg.modId, key: "(parse)", issue: iss, severity: "error" });
    }
    const validation = validateConfigValues(content, cfg.path);
    for (const v of validation) {
      allFindings.push({ file: cfg.file, modId: cfg.modId, key: v.key, issue: v.issue, severity: v.severity });
    }
  }

  for (const f of allFindings) {
    if (f.severity === "error") errors++;
    else warnings++;
  }

  return {
    findings: allFindings,
    summary: { totalConfigs: configs.length, totalIssues: allFindings.length, errors, warnings },
    source: path.basename(resolved),
  };
}

export function compareModConfigsExport(oldConfigDir: string, newConfigDir: string): { added: Array<{ file: string; modId: string }>; removed: Array<{ file: string; modId: string }>; changed: Array<{ file: string; modId: string; keysChanged: string[] }>; unchanged: number; summary: Record<string, any>; oldSource: string; newSource: string } {
  const oldResolved = path.resolve(oldConfigDir);
  const newResolved = path.resolve(newConfigDir);

  const oldConfigs = scanConfigDir(oldResolved);
  const newConfigs = scanConfigDir(newResolved);

  const byFile = (list: typeof oldConfigs) => {
    const m = new Map<string, typeof list[0]>();
    for (const c of list) m.set(c.file, c);
    return m;
  };
  const oldMap = byFile(oldConfigs);
  const newMap = byFile(newConfigs);

  const added: Array<{ file: string; modId: string }> = [];
  const removed: Array<{ file: string; modId: string }> = [];
  const changed: Array<{ file: string; modId: string; keysChanged: string[] }> = [];
  let unchangedCount = 0;

  for (const [file, cfg] of newMap) {
    if (!oldMap.has(file)) {
      added.push({ file, modId: cfg.modId });
    } else {
      const oldCfg = oldMap.get(file)!;
      const oldContent = readConfigFile(oldCfg.path).content;
      const newContent = readConfigFile(cfg.path).content;
      const oldKeys = new Set(Object.keys(oldContent));
      const newKeys = new Set(Object.keys(newContent));
      const diffKeys: string[] = [];
      for (const k of newKeys) { if (!oldKeys.has(k)) diffKeys.push(k); }
      for (const k of oldKeys) { if (!newKeys.has(k)) diffKeys.push(`-${k}`); }
      // Check nested value differences
      for (const k of oldKeys) {
        if (newKeys.has(k) && JSON.stringify(oldContent[k]) !== JSON.stringify(newContent[k])) {
          diffKeys.push(`.${k}=<changed>`);
        }
      }
      if (diffKeys.length > 0) {
        changed.push({ file, modId: cfg.modId, keysChanged: diffKeys });
      } else {
        unchangedCount++;
      }
    }
  }
  for (const [file] of oldMap) {
    if (!newMap.has(file)) removed.push({ file, modId: oldMap.get(file)!.modId });
  }

  return {
    added, removed, changed, unchanged: unchangedCount,
    summary: {
      addedCount: added.length, removedCount: removed.length, changedCount: changed.length,
      unchangedCount, totalOld: oldConfigs.length, totalNew: newConfigs.length,
    },
    oldSource: path.basename(oldResolved),
    newSource: path.basename(newResolved),
  };
}

export function findOrphanedConfigsExport(modsDir: string, configDir: string): { orphans: Array<{ configFile: string; modId: string; reason: string }>; total: number; summary: { totalConfigs: number; orphanCount: number }; source: string } {
  const modsResolved = path.resolve(modsDir);
  const configResolved = path.resolve(configDir);
  const modRegistry = buildModRegistry(modsResolved);
  const configs = scanConfigDir(configResolved);
  const orphans: Array<{ configFile: string; modId: string; reason: string }> = [];

  for (const cfg of configs) {
    const modIdLower = cfg.modId.toLowerCase();
    if (!modRegistry.has(modIdLower) && !getKnownModInfo(modIdLower)) {
      orphans.push({ configFile: cfg.file, modId: cfg.modId, reason: "Mod JAR not found in mods directory" });
    }
  }

  return {
    orphans,
    total: orphans.length,
    summary: { totalConfigs: configs.length, orphanCount: orphans.length },
    source: path.basename(configResolved),
  };
}

export function getModDefaultConfigExport(modId: string): { modId: string; name: string; hasDefault: boolean; fallbackConfig: Record<string, any>; note?: string } {
  const info = getKnownModInfo(modId);
  if (info) {
    return { modId, name: info.name, hasDefault: info.hasConfig, fallbackConfig: info.fallbackConfig, note: "No official default config bundled; shown config is a best-effort default" };
  }
  return { modId, name: modId, hasDefault: false, fallbackConfig: {}, note: "Mod not in known defaults database" };
}

// ── MCP Server Setup ─────────────────────────────────────────────────
function main() {
  const server = new McpServer({
    name: "mc-mod-config-mcp",
    version: "1.0.0",
  });

  // Tool: read_mod_config
  server.tool(
    "read_mod_config",
    "Read and parse a mod config file (.cfg for Forge, .toml for Fabric, .json for any). Returns the parsed config tree.",
    {
      configPath: z.string().describe("Path to the config file (.cfg, .toml, or .json)"),
    },
    async ({ configPath }) => {
      const result = readModConfigExport(configPath);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: list_mod_configs
  server.tool(
    "list_mod_configs",
    "List all mod config files in a config directory (recursively). Returns file path, mod ID, format, and size.",
    {
      configDir: z.string().describe("Path to the config/ directory of a Minecraft instance or modpack"),
    },
    async ({ configDir }) => {
      const result = listModConfigsExport(configDir);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: validate_mod_configs
  server.tool(
    "validate_mod_configs",
    "Validate all mod config files in a directory for common issues: empty values, invalid numbers, parse errors, oversized strings.",
    {
      configDir: z.string().describe("Path to the config/ directory"),
    },
    async ({ configDir }) => {
      const result = validateModConfigsExport(configDir);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: compare_mod_configs
  server.tool(
    "compare_mod_configs",
    "Compare two config directories (e.g. before/after a modpack update). Reports added, removed, changed, and unchanged config files with key-level diff info.",
    {
      oldConfigDir: z.string().describe("Path to the old config/ directory"),
      newConfigDir: z.string().describe("Path to the new config/ directory"),
    },
    async ({ oldConfigDir, newConfigDir }) => {
      const result = compareModConfigsExport(oldConfigDir, newConfigDir);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: find_orphaned_configs
  server.tool(
    "find_orphaned_configs",
    "Find config files whose mod JAR is no longer present in the mods/ directory. Useful after removing mods.",
    {
      modsDir: z.string().describe("Path to the mods/ directory"),
      configDir: z.string().describe("Path to the config/ directory"),
    },
    async ({ modsDir, configDir }) => {
      const result = findOrphanedConfigsExport(modsDir, configDir);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // Tool: get_mod_default_config
  server.tool(
    "get_mod_default_config",
    "Get the known default/baseline config for a specific mod. Supports Sodium, OptiFine, Phosphor, Lithium, Fabric API.",
    {
      modId: z.string().describe("Mod ID (e.g. 'sodium', 'optifine', 'phosphor')"),
    },
    async ({ modId }) => {
      const result = getModDefaultConfigExport(modId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  server.connect(transport);
}

main();
