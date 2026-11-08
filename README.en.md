# KayingCode

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="KayingCode" width="128" height="128" />
</div>
<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

**KayingCode uses the ZCode harness as its foundation, bringing game development workflows into a harness designed for multiple game engines and platforms.** It connects agents, engine tools, running previews and tests to iterate from gameplay goals through implementation to verified results.

We retain and reuse ZCode's general coding capabilities, interactions and runtime logic wherever possible, focusing KayingCode's changes on game workflows, engine integration and platform validation. Multiple engines and platforms are an ongoing direction; application guides distinguish implemented capabilities and validated targets. This is an unofficial Apache-2.0 derivative of [official ZCode](https://github.com/zai-org/ZCode).

## Game development workflow

- **Projects and engine tools:** Game Center connects project lists, local workspaces and development references. The current TapTap Maker plugin provides project, diagnostics, build and release-preparation tools.
- **Implementation and running previews:** Agents execute development tasks in the existing harness. Local Desktop provides game previews, screenshots and functional validation entry points.
- **Visual comparison and iteration:** Dual previews and pixel differences support comparison. Visual repair has budgets and stopping conditions; acceptance relies on actual runtime, gameplay and visual results.
- **Prototyping and porting:** Validate a three.js Web demo, adapt it to TapTap Maker module by module, and compare gameplay and visuals in actual previews.
- **Engine and platform integration:** Extend through plugins, MCP, Skills and existing interfaces while preserving general coding capabilities. Current support is documented per application and plugin.

## Usage and connections

Use Desktop or CLI locally without registering a KayingCode account. To connect a phone, open remote control at the lower left of Desktop and scan the code. The browser joins the existing Host and sessions. Clients manage device identity and browser credentials automatically; users do not register, set passwords or enter tokens. Scan again after authorization expires, logout or browser-storage clearing.

For self-hosting, serve Web and Relay on one HTTPS origin and follow the [Relay deployment guide](apps/kayingcode-relay-cloudflare/DEPLOYMENT.en.md). Mobile entry points include [Taro (H5/WeChat)](apps/kayingcode-mobile-taro/README.md) and [Flutter](apps/kayingcode-mobile-flutter/README.md); application guides describe access methods and validated platforms. Desktop targets Windows, macOS and Linux, including SSH/WSL/Docker development environments.

| Interface                         | Purpose                                                                 | Development command              |
| --------------------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| Desktop                           | Local game development, preview and debugging workspace                 | pnpm run dev:desktop             |
| Web / KayingCode CLI distribution | Browser and terminal entry points combining Web, TUI, backend and Agent | pnpm run dev:web                 |
| Agent CLI                         | The kayingcode terminal interface and Desktop/Web runtime               | pnpm --filter @zcode/cli run dev |

## Reading guide

- [Deployment guide](docs/deploy.md) (Chinese): choose Desktop, Web, CLI or mobile access.
- [Relay documentation](apps/kayingcode-relay-cloudflare/README.en.md): implementation, flows and first deployment with Chinese/English navigation.
- [Contributing](CONTRIBUTING.md), [code of conduct](CODE_OF_CONDUCT.md) and [security reporting](SECURITY.md).

The documentation describes an initial release. Installer and platform availability depend on actual builds and acceptance. Local mode uses configured Providers and built-in or locally installed plugins. Model calls send context to the selected endpoint; TapTap and other platform tools have their own sign-in, authorization and publishing confirmation. Remote scanning authorizes a device connection rather than a subscription or quota account. See [NOTICE.md](NOTICE.md) for data and network behavior.

## Setup

Install Git, Node.js **24.14.0**, and pnpm **10.31.0**. [mise.toml](mise.toml) is the source of truth for tool versions. Run all development and packaging commands below from the repository root.

```bash
pnpm run bootstrap
```

`pnpm run bootstrap` installs workspace dependencies, prepares local desktop runtime assets, and runs `build:bootstrap`.

The Agent CLI and runtime source code lives in [apps/zcode-cli/packages/cli/](apps/zcode-cli/packages/cli/) as a regular directory included when you clone this repository. No separate checkout or Git submodule initialization is required.

Additional setup and build commands:

| Command                            | Purpose                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                     | Install dependencies                                                                                                                |
| `pnpm run prepare:desktop-runtime` | Prepare desktop runtime assets, including remote assets by default                                                                  |
| `pnpm run prepare:remote-assets`   | Prepare remote runtime assets separately                                                                                            |
| `pnpm run bootstrap:with-remote`   | Set up dependencies and local and remote assets, then build the relevant packages sequentially; skip the desktop application bundle |
| `pnpm run build`                   | Recursively run each workspace package's build script, including its asset preparation steps                                        |

The default `bootstrap` skips remote asset preparation and is suitable for local desktop development. Run the corresponding preparation command when working with remote workspaces or validating remote distribution assets.

## Development and Usage

### Desktop

```bash
pnpm run dev:desktop

# Use the test environment
pnpm run dev:desktop:test
```

`pnpm run dev:desktop` defaults to `pnpm run dev:desktop:prod` and uses production service configuration. The startup script prepares local runtime assets, builds the desktop Agent, then starts Electron and source watchers.

Set `KAYINGCODE_DATA_BASE_DIR` to use a separate development data directory. For example, on macOS / Linux:

```bash
KAYINGCODE_DATA_BASE_DIR="$HOME/.kayingcode-dev-home" pnpm run dev:desktop:test
```

### Web Development

For Web or backend development, install dependencies and build the TypeScript project references before starting the development servers. On Windows, use a short clone path such as `D:\src\KayingCode`.

```bash
pnpm install --frozen-lockfile --child-concurrency=1
pnpm run typecheck
pnpm run dev:web

# Set the backend workspace (macOS / Linux)
KAYINGCODE_SERVER_WORKSPACE=/path/to/project pnpm run dev:web
```

This starts both the Web development server (default: `http://localhost:5173`) and the backend (default: `http://localhost:3030`). Open the Web development server in your browser. `/ws` and general `/api` requests are proxied to the local backend; `/api/v1/oauth/token` is proxied separately to the configured product service.

After changing Agent source code, run `pnpm exec turbo run build --filter=@zcode/cli...` and restart the service. To validate the complete distribution, extract and run it as described under Packaging → KayingCode CLI distribution below.

### KayingCode CLI distribution

The command-line distribution includes the TUI, Web client, and Agent behind one `kayingcode` command. With no arguments it starts the TUI; a leading `--web` starts Web mode; all other arguments go to the existing Agent CLI. Both modes run locally without Electron.

```bash
# Start the terminal UI by default
kayingcode

# Start the Web interface
kayingcode --web

# Set the project and port without opening a browser automatically
kayingcode --web --workspace /path/to/project --port 3030 --no-open

# Show CLI or Web options
kayingcode --help
kayingcode --web --help
```

In Web mode, it uses the current directory as the workspace, listens on `127.0.0.1` without token authentication by default, selects an available port, and opens a browser. Use the URL printed in the terminal and press `Ctrl+C` to stop the service. For LAN access, use `--host 0.0.0.0`; listening on a non-local address generates an access token by default. Use the token-bearing URL printed in the terminal. Set a token with `--token`, or disable token authentication with `--no-token`.

When starting the general Web service's HTTP entry directly, configure API/WebSocket authentication with `KAYINGCODE_SERVER_AUTH_TOKEN`. When creating the service programmatically, use the `authToken` option.

See Packaging below for build instructions. `pnpm run build:kayingcode` only creates the distribution; it does not replace an existing `kayingcode` on `PATH`. If the command still points to an older installation or another checkout, check it with `command -v kayingcode` on macOS / Linux or `where.exe kayingcode` on Windows.

### CLI Source Development

Use the source entry when developing the TUI or Agent:

```bash
pnpm --filter @zcode/cli run dev --help
pnpm --filter @zcode/cli run dev

# Build the CLI and its workspace dependencies
pnpm exec turbo run build --filter=@zcode/cli...
node apps/zcode-cli/packages/cli/dist/kayingcode.cjs --help
```

This entry runs the Agent CLI directly and does not handle the distribution's `--web` switch. Use `pnpm run dev:web` for Web development, or the extracted `bin/kayingcode.mjs` shown below to test the unified command.

## Configuration

The root [.env.example](.env.example) provides sample service URLs and build configuration. Copy it to `.env` as needed and place local overrides in `.env.local`. Select the Desktop development environment with `dev:desktop:test` or `dev:desktop:prod`.

| Setting                                   | Purpose                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `KAYINGCODE_DATA_BASE_DIR`                | Base directory for application data, stored under its `.kayingcode/` subdirectory       |
| `KAYINGCODE_SERVER_WORKSPACE`             | Workspace path for the Web backend                                                      |
| `KAYINGCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Path to a local provider configuration file; uses the built-in configuration when unset |
| `KAYINGCODE_DIST_BASE_URL`                | Download base URL used by the CLI distribution installer                                |

Runtime variables can be set explicitly in the environment of the startup command. See [config/README.md](config/README.md) for the default configuration shipped with the client.

## Packaging

See [third-party/README.md](third-party/README.md) for notice generation, distribution checks, and where the notices are included in each distribution.

### Desktop

```bash
pnpm run package

# Set the target platform and CPU architecture
pnpm run bundle:desktop -- --os win --arch x64

pnpm run bundle:desktop -- --help
```

Without explicit `--os` or `--arch` options, the default target is the current operating system and CPU architecture. The default output directory is `packages/desktop/dist/`. `--os` accepts `mac`, `win`, or `linux`; `--arch` accepts `x64` or `arm64`. Packaging and signing require the tools and configuration for the target platform.

### KayingCode CLI distribution

Run `pnpm run build:kayingcode` to build the CLI/TUI, backend, and Web client, collect the TUI native libraries, workers, and runtime dependencies, then assemble the distribution. Running the distribution still requires Node.js; use the version specified in `mise.toml`.

Before packaging, set the download base URL with `KAYINGCODE_DIST_BASE_URL` in `.env`, `.env.local`, or the process environment, or pass it through `--base-url`. The URL below is a placeholder; replace it with your hosting URL when publishing:

```bash
pnpm run build:kayingcode --base-url https://downloads.example.com/kayingcode/

# When KAYINGCODE_DIST_BASE_URL is already configured
pnpm run build:kayingcode

# Repackage existing Agent, backend, and Web build outputs
pnpm run build:kayingcode --skip-build

# Show options for the version, output directory, and more
pnpm run build:kayingcode --help
```

The version defaults to the root `package.json` version. Output is written to `dist/kayingcode/`:

- `releases/<version>/kayingcode-<version>.tar.gz`: runtime package.
- `releases/<version>/sha256.txt`: checksum file.
- `latest.json` and `install.sh`: version index and installer.

Upload the entire directory to the configured download base URL. The installer downloads the runtime package from that URL, installs it to `~/.kayingcode/runtime` by default, and creates the `kayingcode` command in `~/.local/bin`. Override these directories with `KAYINGCODE_DIST_HOME` and `KAYINGCODE_DIST_BIN_DIR`, respectively.

To test a packaged build locally, extract and run it directly without uploading or installing it:

```bash
kayingcode_version=$(node -p "require('./dist/kayingcode/latest.json').version")
mkdir -p dist/kayingcode/debug
tar -xzf "dist/kayingcode/releases/$kayingcode_version/kayingcode-$kayingcode_version.tar.gz" \
  -C dist/kayingcode/debug
# Start the TUI by default
node dist/kayingcode/debug/kayingcode/bin/kayingcode.mjs

# Start Web mode
node dist/kayingcode/debug/kayingcode/bin/kayingcode.mjs --web \
  --workspace "$PWD" --port 3030 --no-open
```

Open `http://127.0.0.1:3030` to validate the complete flow, with one backend serving the Web pages and running the Agent. The port must be available; if `pnpm run dev:web` is already running, choose another `--port`.

## Repository Structure

### apps: runnable and distributable entry points

| Directory                                                               | Current package or project entry | Responsibility                                                                             |
| ----------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| [`packages/desktop`](packages/desktop/)                                 | `@zcode/desktop`                 | Electron Main, window-scoped Local Host, Renderer, and desktop packaging                   |
| [`packages/web`](packages/web/)                                         | `@zcode/web`                     | Browser workbench and Relay Web interface                                                  |
| [`apps/kayingcode-site`](apps/kayingcode-site/)                         | `kayingcode-product-site`        | Standalone static product site and local preview                                           |
| [`apps/zcode-cli/packages/cli`](apps/zcode-cli/packages/cli/)           | `@zcode/cli`                     | Agent CLI/TUI entry point and SEA distribution                                             |
| [`packages/zcode-server-cli`](packages/zcode-server-cli/)               | `@zcode/server-cli`              | Upstream resident service, remote staging and proxy; SSH/WSL/Docker development containers |
| [`apps/kayingcode-relay-cloudflare`](apps/kayingcode-relay-cloudflare/) | `@kayingcode/relay-cloudflare`   | Relay, device authorization and same-origin Web hosting                                    |
| [`apps/kayingcode-mobile-taro`](apps/kayingcode-mobile-taro/)           | `@kayingcode/mobile`             | Taro WeChat Mini Program and H5 client                                                     |
| [`apps/kayingcode-mobile-flutter`](apps/kayingcode-mobile-flutter/)     | `pubspec.yaml`                   | Flutter Android/iOS client; uses Dart tooling outside the Bun workspace                    |

### packages: capabilities shared across entry points

| Directory                                          | Responsibility                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/zcode-cli/packages/adapters`                 | Agent I/O adapters for files, network, models, and plugins                               |
| `apps/zcode-cli/packages/bootstrap`                | Agent service and protocol assembly                                                      |
| `apps/zcode-cli/packages/shared-types`             | Shared Agent CLI types                                                                   |
| `apps/zcode-cli/packages/contracts`                | Agent ports, events, and tool contracts                                                  |
| `packages/agent-gateway`                           | HTTP/WS RPC ingress shared by Web Host and Agent Node                                    |
| `apps/zcode-cli/packages/i18n`                     | Agent localization resources                                                             |
| `apps/zcode-cli/packages/core`                     | Agent command, session, and tool runtime                                                 |
| `apps/zcode-cli/packages/telemetry`                | Agent telemetry events and processing                                                    |
| `packages/client`                                  | Agent client SDK and connection adapters                                                 |
| `apps/zcode-cli/packages/dynamic-workflow`         | Dynamic workflow engine core                                                             |
| `apps/zcode-cli/packages/dynamic-workflow-runtime` | Sandbox execution and host bridge for workflow scripts                                   |
| `packages/mobile-client-core`                      | Pairing, connection, and projection logic shared by mobile, H5, and Mini Program clients |
| `packages/model-option-map`                        | Parsing and evaluation of model option mappings                                          |
| `apps/zcode-cli/packages/node-repl-host`           | JavaScript execution and Browser Use host                                                |
| `packages/provider`                                | Shared Provider capabilities                                                             |
| `packages/provider-node`                           | Node implementations of Provider capabilities                                            |
| `packages/rpc`                                     | Cross-process RPC framework                                                              |
| `packages/server`                                  | Web Host HTTP, WebSocket, and remote connection services                                 |
| `packages/services`                                | Business services and persistence                                                        |
| `packages/shared`                                  | Protocols, platform interfaces, and types shared across clients                          |
| `apps/zcode-cli/packages/swift-bridge`             | Swift interoperability placeholder package                                               |
| `apps/zcode-cli/packages/tui`                      | Agent terminal UI                                                                        |
| `packages/ui`                                      | Shared React components, hooks, and Zustand state                                        |

### Other directories

| Directory                             | Responsibility                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `plugins/`                            | User-managed built-in plugins and bundled assets, including the Computer Use runtime        |
| `tools/`                              | Development, debugging, research, and validation tools                                      |
| `scripts/`, `config/`, `third-party/` | Build and maintenance scripts, distribution configuration, and third-party notice materials |

See the [repository rules](AGENTS.md), [app directory guide](apps/README.md), and [generated package map](SOURCE_PACKAGES.md) for placement rules, public entry points, and distribution paths. After changing packages or plugin metadata, run `pnpm run source:plugins`, `pnpm run source:map`, and `pnpm run source:check`.

## Project Notice

See [NOTICE.md](NOTICE.md) for feature and promotion scope, maintenance policy, execution and data risks, licensing, and third-party copyright information.

## Branch workflow

- `main`: a pure ZCode upstream mirror, fast-forwarded from `upstream/main`; product commits belong on development branches.
- `kaying-code-dev`: the default development and integration branch.
- `kaying-code-release`: release preparation and stable fixes; its initial development snapshot is pending acceptance, not a published release.
- `kaying-code-feature-*`: short-lived work from dev, merged back into dev and then removed.
- `kaying-code-hotfix-*`: urgent fixes from release, integrated into both release and dev.

[GitHub](https://github.com/kaying-ai/KayingCode) hosts product development, pull requests, and releases. Gitee provides a one-way source mirror for backup and faster clones. In maintainer clones, `origin` points to GitHub, `gitee` to the dedicated mirror, `upstream` to ZCode, and `legacy` is available for old product history. Run `node scripts/check-workspace-freshness.mjs` before starting work. Product tags use `kaying-code-v*` and must be reachable from the GitHub release branch. See the [repository operations guide](docs/deploy/github-gitee-repository.md).

### Connecting and syncing upstream

Configure the official remote with `git remote add -t main upstream https://github.com/zai-org/ZCode.git`, or update an existing remote with `git remote set-url upstream`. Run `git fetch --no-tags upstream` before reviewing differences. An existing local `main` mirror can be fast-forwarded to `upstream/main`. The original [ZCode 3.17.2 documentation](https://github.com/zai-org/ZCode/tree/a9fe401eede6e6e5e01be9048679c206fe6f02d9/docs) remains in the upstream project.

Mirror updates do not update the product. Save current work, sync dev with `origin/kaying-code-dev`, and create `kaying-code-feature-upstream-<version>` (for example, `kaying-code-feature-upstream-3-17-2`). Compare `UPSTREAM_BASE.json.commit` against `upstream/main`, update each affected module's spec first, and adapt changes with tests while preserving product boundaries. Record adopted changes, intentionally retained differences, and unfinished work. Run relevant validation, root typecheck and lint before merging into dev; release acceptance remains a separate step.

Only advance `UPSTREAM_BASE.json` after all changes in the target baseline have been reviewed, adopted or explicitly excluded, and validated. Partial adoption keeps the previous baseline with progress recorded. Fetching or advancing main alone never advances this file. Changing a remote URL does not rewrite historical provenance. KayingCode's product version remains independent of the upstream version. See the [Chinese walkthrough](README.md#上游连接与更新) for the full command sequence.
