# mc-mod-config-mcp Skill

## Overview

The mc-mod-config-mcp provides tools for managing Minecraft mod configuration files. It reads and parses `.cfg` (Forge), `.toml` (Fabric), and `.json` config files; lists all configs in a directory; validates configs for common issues; compares two config sets (before/after updates); finds orphaned configs for removed mods; and provides known defaults for popular mods.

## When to Use This MCP

- When the user wants to read or inspect a mod's config file
- When the user needs to list all mod configs in a modpack
- When the user wants to validate configs for syntax errors or bad values
- When the user is upgrading a modpack and wants to diff old vs new configs
- When the user removed a mod and wants to clean up leftover config files
- When the user needs a known-good default config for a popular mod

## Supported Config Formats

| Format | Extension | Loader |
|--------|-----------|--------|
| Forge INI-style | `.cfg` | Forge |
| Fabric TOML | `.toml` | Fabric |
| JSON | `.json` | Any |

## Available Tools

### read_mod_config
Reads and parses a single mod config file. Returns the parsed config tree, format type, and any parse issues.

**Parameters:**
- `configPath` (string): Absolute or relative path to the config file (`.cfg`, `.toml`, or `.json`)

**Returns:** `{ content, format, issues[], source }`

### list_mod_configs
Recursively scans a config directory and lists every config file found with mod ID, format, and file size.

**Parameters:**
- `configDir` (string): Path to the `config/` directory of a Minecraft instance or modpack

**Returns:** `{ configs[{file, modId, format, size}], total, source }`

### validate_mod_configs
Validates all config files in a directory for common issues: empty values, invalid numbers, parse errors, and oversized strings.

**Parameters:**
- `configDir` (string): Path to the `config/` directory

**Returns:** `{ findings[{file, modId, key, issue, severity}], summary{totalConfigs, totalIssues, errors, warnings}, source }`

### compare_mod_configs
Compares two config directories (e.g. before and after a modpack update). Reports added, removed, changed, and unchanged config files with key-level diff information.

**Parameters:**
- `oldConfigDir` (string): Path to the old config directory
- `newConfigDir` (string): Path to the new config directory

**Returns:** `{ added[], removed[], changed[{file, keysChanged[]}], unchanged, summary{addedCount, removedCount, changedCount, ...}, oldSource, newSource }`

### find_orphaned_configs
Finds config files whose mod JAR is no longer present in the `mods/` directory. Useful after removing mods to identify leftover configs.

**Parameters:**
- `modsDir` (string): Path to the `mods/` directory
- `configDir` (string): Path to the `config/` directory

**Returns:** `{ orphans[{configFile, modId, reason}], total, summary{totalConfigs, orphanCount}, source }`

### get_mod_default_config
Returns the known default/baseline config for a specific popular mod. Supports Sodium, OptiFine, Phosphor, Lithium, and Fabric API.

**Parameters:**
- `modId` (string): Mod ID (e.g. `"sodium"`, `"optifine"`, `"phosphor"`)

**Returns:** `{ modId, name, hasDefault, fallbackConfig, note? }`

## Integration

Add to Trae MCP config (`~/.trae-cn/mcp_config.json`):

```json
{
  "mcpServers": {
    "mc-mod-config-mcp": {
      "command": "node",
      "args": ["<path/to/mc-mod-config-mcp>/dist/index.js"]
    }
  }
}
```

## Notes

- All paths are resolved as absolute paths before processing
- Config files are discovered recursively inside the config directory
- The mod ID is inferred from the first directory component of the config path (e.g. `sodium/sodium.toml` → modId `sodium`)
- Orphan detection matches against JAR filenames in the mods directory plus a built-in known-mods database
- Forge `.cfg` parser handles sections `[general]`, type detection (boolean, number, string), and quoted values
- Fabric `.toml` parser handles nested tables, arrays, and standard value types
