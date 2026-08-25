# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅                 |

## Security Considerations

This MCP server operates entirely on local filesystem paths. No network requests are made by default.

### What this tool does NOT do
- ❌ Execute arbitrary shell commands
- ❌ Make network requests (fully offline)
- ❌ Read or write files outside the provided paths
- ❌ Install or modify system packages

### Safe usage recommendations
- Always provide absolute paths to config directories you control
- Do not pass untrusted user input as `configPath` or `configDir` without path validation
- The server validates all paths exist before reading — non-existent paths return an error, not a crash

## Reporting a Vulnerability

Please report security issues via the repository's [Security Advisories](../../advisories/new) page or contact the maintainer directly.
