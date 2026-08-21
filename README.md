# mc-mod-config-mcp

MCP server for Minecraft mod configuration file management. Reads, validates, compares, and cleans up `.cfg`, `.toml`, and `.json` config files from modpacks.

## Tools

| Tool | Description |
|------|-------------|
| `read_mod_config` | Parse a single config file (`.cfg`, `.toml`, `.json`) and return structured data with any issues |
| `list_mod_configs` | Recursively scan a config directory and list all configs with mod ID, format, and size |
| `validate_mod_configs` | Validate all configs for common issues: empty values, invalid numbers, parse errors, oversized strings |
| `compare_mod_configs` | Diff two config directories (before/after modpack update) and report added/removed/changed files |
| `find_orphaned_configs` | Find config files whose mod JAR is no longer present in the `mods/` directory |
| `get_mod_default_config` | Return known default/baseline config for popular mods (Sodium, OptiFine, Phosphor, Lithium, Fabric API) |

## Supported Config Formats

| Format | Extension | Loader |
|--------|-----------|--------|
| Forge INI-style | `.cfg` | Forge |
| Fabric TOML | `.toml` | Fabric |
| JSON | `.json` | Any |

## Features

- **Multi-format parsing** — handles Forge `.cfg`, Fabric `.toml`, and `.json` configs natively
- **Validation engine** — detects empty values, invalid numbers, parse errors, and oversized strings
- **Config comparison** — key-level diff for tracking changes across modpack updates
- **Orphan detection** — matches config files against installed mod JARs plus a built-in known-mods database
- **Default configs** — bundled known-good defaults for popular performance mods
- **Fully offline** — no network calls; all data is local or built-in

## Installation

### Prerequisites

- Node.js 18+
- npm

### Build

```bash
cd mc-mod-config-mcp
npm install
npm run build
```

### Run as standalone MCP server

```bash
node dist/index.js
```

The server communicates via stdio (JSON-RPC 2.0). It can be consumed by any MCP-compatible client.

### Configuration for MCP clients

Add to your MCP client config:

```json
{
  "mcpServers": {
    "mc-mod-config": {
      "command": "node",
      "args": ["<path/to/mc-mod-config-mcp>/dist/index.js"]
    }
  }
}
```

## Usage Examples

### Read a config file

```json
{
  "name": "read_mod_config",
  "arguments": {
    "configPath": "/path/to/mods/sodium/sodium.toml"
  }
}
```

### List all configs in a modpack

```json
{
  "name": "list_mod_configs",
  "arguments": {
    "configDir": "/path/to/modpack/config"
  }
}
```

### Validate configs for issues

```json
{
  "name": "validate_mod_configs",
  "arguments": {
    "configDir": "/path/to/modpack/config"
  }
}
```

### Compare configs before and after an update

```json
{
  "name": "compare_mod_configs",
  "arguments": {
    "oldConfigDir": "/path/to/old-modpack/config",
    "newConfigDir": "/path/to/new-modpack/config"
  }
}
```

### Find orphaned configs

```json
{
  "name": "find_orphaned_configs",
  "arguments": {
    "modsDir": "/path/to/modpack/mods",
    "configDir": "/path/to/modpack/config"
  }
}
```

### Get default config for a mod

```json
{
  "name": "get_mod_default_config",
  "arguments": {
    "modId": "sodium"
  }
}
```

## Architecture

```
mc-mod-config-mcp/
├── src/
│   └── index.ts        # MCP server + all tool implementations
├── dist/               # Compiled JavaScript (output of tsc)
├── skills/
│   └── mc-mod-config-helper.md  # Trae Work skill for config management
├── __tests__/
│   └── unit.test.ts    # Unit tests (fully offline)
├── package.json        # Node.js dependencies (@modelcontextprotocol/sdk, zod)
├── tsconfig.json       # TypeScript config (CommonJS output)
└── .gitignore
```

The MCP uses the official `@modelcontextprotocol/sdk` v1.x with `McpServer` and `StdioServerTransport`.

## Testing

```bash
npm run build
npm test
```

All unit tests are fully offline and do not require a Minecraft installation.

## Platform Compatibility

| Tool | Windows | macOS | Linux |
|------|---------|-------|-------|
| `read_mod_config` | ✅ | ✅ | ✅ |
| `list_mod_configs` | ✅ | ✅ | ✅ |
| `validate_mod_configs` | ✅ | ✅ | ✅ |
| `compare_mod_configs` | ✅ | ✅ | ✅ |
| `find_orphaned_configs` | ✅ | ✅ | ✅ |
| `get_mod_default_config` | ✅ | ✅ | ✅ |

All tools use cross-platform Node.js `fs` and `path` APIs. All paths are resolved as absolute paths before processing. The Forge `.cfg` parser handles sections, type detection, and quoted values; the Fabric `.toml` parser handles nested tables and arrays.

## License

MIT
