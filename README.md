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
      "args": ["${MC_MOD_CONFIG_ROOT}/dist/index.js"]
    }
  }
}
```

> **Path note:** Replace `${MC_MOD_CONFIG_ROOT}` with the absolute path to this project's root directory. On Windows, use forward slashes: `["C:/path/to/mc-mod-config-mcp/dist/index.js"]`（把 `C:/path/to/` 替换成你的实际路径）。 Alternatively, set an environment variable `MC_MOD_CONFIG_ROOT` pointing to the project root and use the variable in the config.

## Configuration

本工具零配置即可用（内置默认值，任何环境开箱即用）。以下项目可通过环境变量或项目根目录 `.env` 文件覆盖（复制 `.env.example` 为 `.env`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MOD_CONFIG_EXTENSIONS` | `cfg,toml,json` | 支持扫描/解析的配置文件扩展名（逗号分隔，可扩展自定义扩展名） |
| `MOD_CONFIG_MAX_FILE_MB` | `50` | 单个配置文件大小上限（MB），超过则跳过 |
| `MOD_CONFIG_MAX_STRING_LEN` | `500` | 校验时字符串值长度告警阈值 |

**扩展已知模组默认配置库**：编辑 `src/mod-defaults.json`（构建后为 `dist/mod-defaults.json`），在 `defaults` 下新增/覆盖模组即可，无需改代码。例如新增 `"iris": { "name": "Iris", "fallbackConfig": { "enableShaders": true } }`。

优先级：环境变量 > `.env` 文件 > 内置默认值。改动后重启 MCP server 生效。

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
