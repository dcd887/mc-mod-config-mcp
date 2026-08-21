const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const mod = require("../dist/index");

describe("readModConfigExport — Forge .cfg", () => {
  let tmpDir;
  before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-")); });
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("parses a valid Forge .cfg file", () => {
    const cfgPath = path.join(tmpDir, "sodium.cfg");
    fs.writeFileSync(cfgPath, `[general]\nrender_distance=12\nmemory_trash_limit=256\n`);
    const result = mod.readModConfigExport(cfgPath);
    assert.equal(result.format, "forge_cfg");
    assert.equal(result.issues.length, 0);
    assert.equal(result.content.general.render_distance, 12);
    assert.equal(result.content.general.memory_trash_limit, 256);
  });

  it("handles empty config file", () => {
    const cfgPath = path.join(tmpDir, "empty.cfg");
    fs.writeFileSync(cfgPath, "");
    const result = mod.readModConfigExport(cfgPath);
    assert.ok(result.issues.some((i) => i.includes("empty")));
  });

  it("returns parse error for malformed cfg", () => {
    const cfgPath = path.join(tmpDir, "bad.cfg");
    fs.writeFileSync(cfgPath, "[broken\nsome key no equals\n");
    const result = mod.readModConfigExport(cfgPath);
    assert.equal(result.format, "forge_cfg");
  });
});

describe("readModConfigExport — Fabric .toml", () => {
  let tmpDir;
  before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-toml-")); });
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("parses a valid Fabric TOML config", () => {
    const cfgPath = path.join(tmpDir, "mod.toml");
    fs.writeFileSync(cfgPath, `[general]\nenabled=true\nmode="performance"\n`);
    const result = mod.readModConfigExport(cfgPath);
    assert.equal(result.format, "toml");
    assert.equal(result.content.general.enabled, true);
    assert.equal(result.content.general.mode, "performance");
  });

  it("parses TOML arrays", () => {
    const cfgPath = path.join(tmpDir, "array.toml");
    fs.writeFileSync(cfgPath, `[lists]\nitems=[a, b, c]\n`);
    const result = mod.readModConfigExport(cfgPath);
    assert.deepEqual(result.content.lists.items, ["a", "b", "c"]);
  });
});

describe("readModConfigExport — JSON", () => {
  let tmpDir;
  before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-json-")); });
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("parses a valid JSON config", () => {
    const cfgPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(cfgPath, JSON.stringify({ setting: 42, enabled: true }));
    const result = mod.readModConfigExport(cfgPath);
    assert.equal(result.format, "json");
    assert.equal(result.content.setting, 42);
  });
});

describe("listModConfigsExport", () => {
  let tmpDir;
  before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-list-")); });
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("lists config files recursively", () => {
    const cfgDir = path.join(tmpDir, "config");
    fs.mkdirSync(path.join(cfgDir, "sodium"), { recursive: true });
    fs.mkdirSync(path.join(cfgDir, "phosphor"), { recursive: true });
    fs.writeFileSync(path.join(cfgDir, "sodium", "sodium.toml"), "[general]\nrender_distance=8\n");
    fs.writeFileSync(path.join(cfgDir, "phosphor", "phosphor.cfg"), "[general]\nthreads=4\n");
    const result = mod.listModConfigsExport(cfgDir);
    assert.equal(result.total, 2);
    const formats = result.configs.map((c) => c.format).sort();
    assert.deepEqual(formats, ["forge_cfg", "toml"]);
  });

  it("returns empty for missing directory", () => {
    const result = mod.listModConfigsExport(path.join(tmpDir, "nonexistent"));
    assert.equal(result.total, 0);
  });
});

describe("validateModConfigsExport", () => {
  let tmpDir;
  before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-val-")); });
  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("detects empty string values as warnings", () => {
    const cfgDir = path.join(tmpDir, "config");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, "test.toml"), '[general]\nname=""\nvalue=42\n');
    const result = mod.validateModConfigsExport(cfgDir);
    assert.ok(result.summary.totalIssues > 0);
    assert.ok(result.findings.some((f) => f.issue.includes("Empty")));
  });

  it("reports zero findings for a clean config", () => {
    const cfgDir = path.join(tmpDir, "clean");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, "good.toml"), '[general]\nrender_distance=16\nenabled=true\n');
    const result = mod.validateModConfigsExport(cfgDir);
    assert.equal(result.summary.totalIssues, 0);
    assert.equal(result.findings.length, 0);
  });
});

describe("compareModConfigsExport", () => {
  let oldDir, newDir;
  before(() => {
    oldDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-old-"));
    newDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-new-"));
  });
  after(() => {
    fs.rmSync(oldDir, { recursive: true, force: true });
    fs.rmSync(newDir, { recursive: true, force: true });
  });

  it("detects added and removed config files", () => {
    fs.mkdirSync(path.join(oldDir, "oldmod"), { recursive: true });
    fs.mkdirSync(path.join(newDir, "oldmod"), { recursive: true });
    fs.mkdirSync(path.join(newDir, "newmod"), { recursive: true });
    fs.writeFileSync(path.join(oldDir, "oldmod", "old.cfg"), "[g]\nk=1\n");
    fs.writeFileSync(path.join(newDir, "oldmod", "old.cfg"), "[g]\nk=1\n");
    fs.writeFileSync(path.join(newDir, "newmod", "new.cfg"), "[g]\nk=2\n");
    const result = mod.compareModConfigsExport(oldDir, newDir);
    assert.equal(result.added.length, 1);
    assert.equal(result.removed.length, 0);
    assert.equal(result.unchanged, 1);
  });

  it("detects changed config keys", () => {
    fs.mkdirSync(path.join(oldDir, "sodium"), { recursive: true });
    fs.mkdirSync(path.join(newDir, "sodium"), { recursive: true });
    fs.writeFileSync(path.join(oldDir, "sodium", "sodium.toml"), "[general]\nrender_distance=8\nmemory=128\n");
    fs.writeFileSync(path.join(newDir, "sodium", "sodium.toml"), "[general]\nrender_distance=16\nmemory=256\n");
    const result = mod.compareModConfigsExport(oldDir, newDir);
    assert.equal(result.changed.length, 1);
    assert.ok(result.changed[0].keysChanged.length > 0);
  });
});

describe("findOrphanedConfigsExport", () => {
  it("finds configs for mods not present in mods dir", () => {
    const modsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-mods-"));
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-conf-"));
    try {
      fs.writeFileSync(path.join(modsDir, "sodium.jar"), "");
      fs.mkdirSync(path.join(configDir, "sodium"), { recursive: true });
      fs.mkdirSync(path.join(configDir, "removedmod"), { recursive: true });
      fs.writeFileSync(path.join(configDir, "sodium", "sodium.toml"), "[g]\nk=1\n");
      fs.writeFileSync(path.join(configDir, "removedmod", "removed.cfg"), "[g]\nk=2\n");
      const result = mod.findOrphanedConfigsExport(modsDir, configDir);
      assert.equal(result.summary.orphanCount, 1);
      assert.equal(result.orphans[0].modId, "removedmod");
    } finally {
      fs.rmSync(modsDir, { recursive: true, force: true });
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });

  it("reports zero orphans when all mods present", () => {
    const modsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-mods2-"));
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-modcfg-conf2-"));
    try {
      fs.writeFileSync(path.join(modsDir, "sodium.jar"), "");
      fs.mkdirSync(path.join(configDir, "sodium"), { recursive: true });
      fs.writeFileSync(path.join(configDir, "sodium", "sodium.toml"), "[g]\nk=1\n");
      const result = mod.findOrphanedConfigsExport(modsDir, configDir);
      assert.equal(result.summary.orphanCount, 0);
    } finally {
      fs.rmSync(modsDir, { recursive: true, force: true });
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });
});

describe("getModDefaultConfigExport", () => {
  it("returns known default for sodium", () => {
    const result = mod.getModDefaultConfigExport("sodium");
    assert.equal(result.modId, "sodium");
    assert.equal(result.name, "Sodium");
    assert.ok(result.fallbackConfig.render_distance !== undefined);
  });

  it("returns not-found for unknown mod", () => {
    const result = mod.getModDefaultConfigExport("unknownmod123");
    assert.equal(result.hasDefault, false);
    assert.ok(result.note.includes("not in known defaults"));
  });
});
