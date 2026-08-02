# Character Flavor Text Guide

**Status**: Implemented (hooks generator)  
**Related**: `docs/plan/characters/backstory-profile.md` Phase E, `src/extensions/characters/flavorHooks.ts`

## Purpose

Turn structured character data (origin, commitment, tastes, bonds, dynasty) into short flavor lines for UI and future biography tools.

**i18n**: hooks are stored as `{ id, params }` (`CharacterFlavorHook`), not finished prose. Display uses `formatFlavorHook()` + `characters.flavorLines.*` in `en.json` / `ja.json`.

## Inputs

| Field | Use in prose |
| :--- | :--- |
| `origin.socialStratum` | Opening identity (“A high noble who…”) |
| `titles` / role class | Role verb phrase (crown, corridors, border, coin…) |
| `commitment.primary` | Core motive sentence |
| top `tastes` (likes / dislikes) | Habit / aversion line |
| `bonds` (rival / nemesis) | Enemy ledger line |
| `origin.lineageName` | House name on the tongue |

## Output

- `backstory.hooks: CharacterFlavorHook[]` — **1–3** structured entries at society finalize
- Resolve with `formatFlavorHook(hook, t)` for the active locale
- Legacy plain English strings (old saves) are shown as-is

## Generation rules (v1)

1. Prefer concrete motives over stat dumps (“Doctrine is the spine” not “Piety 87”).  
2. Cap at three lines; strongest axes first (role → commitment → tastes → bonds/house).  
3. Do not invent events not present in data (no “won the battle of X” unless stored).  
4. Bonds are **labels**; numbers live in `solidarity` / `favor`.  
5. Dynasty motto is shown next to house name in Details; hooks may mention the house name only.

## Example

```
A minor noble who keeps one eye on the border and one on the ledgers.
The name of the house matters more than any single life.
Drawn to hunting and sport; turns cold at merchants.
```

## Future

- Locale-specific hook tables  
- Event-driven hook refresh after major life events  
- Longer template biographies using the same axes  
