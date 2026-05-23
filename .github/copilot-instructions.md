# Fantasy Map Generator

Azgaar's Fantasy Map Generator is a client-only web application for creating fantasy maps. It generates detailed fantasy worlds with countries, cities, rivers, biomes, and cultural elements.

Always reference these instructions first.

# Architecture

The codebase is gradually transitioning from **vanilla JavaScript to TypeScript** while maintaining compatibility with the existing generation pipeline and legacy `.map` user files.

The expected **future architecture** is based on a separation between **world data**, **procedural generation**, **interactive editing**, and **rendering**.

The application is conceptually divided into four main layers:

- **State** — world data and style configuration, the single source of truth
- **Generators** — procedural world simulation (model)
- **Editors** — user-driven mutations of the world state (controllers)
- **Renderer** — map visualization (view)

Flow:
settings → generators → world data → renderer
UI → editors → world data → renderer

### Layer responsibilities

**State (world data)**  
Stores all map data and style configuration.  
The data layer must contain **no logic and no rendering code**.

**Generators**  
Implement the procedural world simulation and populate or update world data based on generation settings.

**Editors**  
Implement interactive editing tools used by the user.  
Editors perform controlled mutations of the world state and can be viewed as **interactive generators**.

**Renderer**  
Converts the world state into **SVG or WebGL graphics**.  
Rendering must be a **pure visualization step** and must **not modify world data**.

# Working Effectively

The project uses **NPM**, **Vite**, and **TypeScript** for development and building.

## Setup

Install dependencies: `npm install`

Requirements: Node.js **>= 24.0.0**

## Development

Start the development server: `npm run dev`

Access the application at: http://localhost:5173

## Build

Create a production build: `npm run build`

Build steps:

1. TypeScript compilation (`tsc`)
2. Vite build
3. Output written to `dist/`

## Testing

Run end-to-end tests with Playwright:

```bash
npm run test:e2e
```

### Arch Linux Environment Setup

On Arch Linux, Playwright npm module installation can fail. Instead, install binaries directly to the system:

```bash
sudo pacman -S playwright chromium
```

The Playwright test configuration will use the system binaries:
- Playwright: `/usr/bin/playwright`
- Chromium: `/usr/bin/chromium`

Ensure `playwright.config.ts` is properly configured to reference these system-installed binaries when running tests.

### AI Browser-Diagnostics Guidance (Arch Linux)

Use Playwright MCP server for browser console / runtime diagnostics in this environment.

Recommended MCP server configuration uses the Chromium system binary:

```json
{
	"servers": {
		"playwright": {
			"command": "npx",
			"args": [
				"@playwright/mcp@latest",
				"--executable-path",
				"/usr/bin/chromium"
			],
			"type": "stdio"
		}
	}
}
```

When an AI agent needs browser diagnostics:
- Prefer Playwright MCP browser tools for navigation, console checks, and runtime verification.
- Keep using `playwright.config.ts` for e2e test runs (`npm run test:e2e`), where `launchOptions.executablePath` is set to `/usr/bin/chromium`.
- If MCP is unavailable, use local Node.js Playwright execution with explicit `/usr/bin/chromium` as a fallback.
