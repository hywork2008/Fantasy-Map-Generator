# JS2TS Monorepo Migration Overview

## Background
Over many years of development, Fantasy Map Generator accumulated legacy JavaScript under the `public` directory, which caused the following issues.

- Low type safety made it hard to detect breaking impacts during changes
- Dependencies were implicit, and module boundaries were unclear
- Heavy global-variable usage increased regression risk during maintenance
- Build and test integration was weak, leaving little foundation for incremental migration

## Primary Goal of the Monorepo Migration
**The primary goal is to incrementally migrate legacy JavaScript files in `public` to TypeScript.**

To achieve that goal, the monorepo migration focused on the following.

- Separation of responsibilities across shared types, shared utilities, generation logic, and UI
- A migration path that preserves compatibility with existing `.map` files during TS transition
- A compatibility layer that protects existing runtime behavior
- Build and E2E test foundations that are reproducible in both CI and local environments

## New Structure (High Level)
A workspace-based structure was introduced to enable staged migration.

- `@fmg/types`: Global declarations and shared types
- `@fmg/shared`: Shared utilities
- `@fmg/core`: Generation algorithms and core modules
- `@fmg/legacy-ui`: Compatibility layer for existing UI and editor features

At the repository root, npm workspaces + TypeScript + Vite are coordinated so migration can proceed without breaking legacy behavior abruptly (via path aliases and build aliases).

## Key Items Implemented in This Migration

1. Defined workspace boundaries and separated responsibilities by package
2. Added compatibility layers such as `src/modules/index.ts` to absorb legacy references
3. Consolidated type definitions and global declarations into `@fmg/types`
4. Reorganized utility functions into reusable `@fmg/shared`
5. Unified alias resolution for Vite and tsconfig to reduce build-time resolution errors
6. Restored a stable build pipeline (`tsc` -> `vite build`)

## Why the Monorepo Approach Works
When migrating JavaScript in `public` to TypeScript, legacy and new code must coexist for a long period.
The monorepo approach makes it possible to:

- Reuse shared types across packages and keep migration quality consistent
- Preserve dependency visibility even with incremental migration (file-by-file or feature-by-feature)
- Localize regression impact while old and new implementations coexist
- Limit change scope by package, improving review and testing efficiency

## Near-Term Migration Strategy (public JS -> TS)

- Prioritize high-usage modules in `public` (based on impact and benefit)
- Move type definitions into `@fmg/types` as each file is migrated
- Extract common logic into `@fmg/shared` to remove duplication
- Absorb UI-specific legacy coupling in `@fmg/legacy-ui` and clean up gradually
- Run `npm run build` and E2E tests at each step to detect regressions early

## Success Metrics (Definition of Done Examples)

- Target JavaScript in `public` is replaced with TypeScript and has no type errors
- Compatibility is preserved for loading, generation, and editing of existing `.map` data
- Production build (`npm run build`) succeeds consistently
- E2E tests for core user flows remain green

---
This document provides a high-level overview of the JS2TS migration. Detailed execution logs should be maintained separately as phase-by-phase documents.
