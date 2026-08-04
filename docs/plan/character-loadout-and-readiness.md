# Character Loadout, Skills & Readiness

| Field | Value |
| :--- | :--- |
| **Author** | Design draft (AI agent) |
| **Date** | 2026-08-04 |
| **Status** | Design proposal — supersedes **PR-3c** of [player-threat-cull-jobs.md](./player-threat-cull-jobs.md). **EQ-1 implemented** (loadout schema + estate seed). |
| **Intended repo path** | `docs/plan/character-loadout-and-readiness.md` |
| **Depends on** | Characters extension (`Character`, `personFactory`, backstory estate/stratum); Economy goods + `Character.inventory` + market commerce; `individualSkills` / `martialIndividualMastery`; threat cull combat (`threatCullCombat.ts`); PC panel |
| **Related** | [individual-skill-mastery-system.md](./individual-skill-mastery-system.md); [player-character-market-commerce.md](./player-character-market-commerce.md) §10 (consume/equip deferred); [player-threat-cull-jobs.md](./player-threat-cull-jobs.md) K5 / PR-3c; [characters/appearance-and-reproduction.md](./characters/appearance-and-reproduction.md) (phenotype only — not clothing); [goods-unit-scale.md](./goods-unit-scale.md) (Garments/Arms as `set`) |

---

## 1. Problem

### 1.1 Immediate (hunt / adventurer readiness)

Monster / pest cull jobs resolve combat from base `martial` + `prowess` only (`domainBonus = 0`). The deferred **PR-3c** would only enable a small `individualSkills` swordsmanship/archery bonus.

That is insufficient for the intended player fantasy:

- Adventurers are **unstable day laborers** who should be able to **prepare** before a mission (buy arms, wear something more than rags, have domain practice).
- Auto-generated characters who will take those jobs need plausible **starting kit + domain practice**, not a naked skill number.
- The player must be able to **edit** kit, skills, and practice before applying to a hunt board.

PR-3c alone does not create that prep loop; it only polishes combat math.

### 1.2 Systemic (attire vacuum)

There is no durable model of **what a person is wearing or carrying as equipment**:

| Layer | What exists today | Gap |
| :--- | :--- | :--- |
| Phenotype | `looks` axes (stature, build, …, ornament) | Ornament is scars/adornment *phenotype*, not clothes |
| Bulk property | `Character.inventory` (goodId → units) from gifts / market buy | Ownership only — not worn or wielded |
| Goods catalog | Cloth, Garments, Silk, Furs, Jewelry, Arms, Horses, … | Commodity stock; no “this person wears fine garments” |
| Domain practice | Economy `individualSkills` (blacksmithing, swordsmanship, archery, …) | Seeded for commanders / guild roles only; no PC prep UI |
| Base skills | `Character.skills` (martial, prowess, …) | Generated at create; editable only via general character tools |

Consequences visible across fantasy and non-fantasy settings:

- Commoners are effectively **unclothed** in data (no Garments seed, no loadout).
- Rulers have wealth and titles but **no status-appropriate attire** in data.
- Buying Garments / Arms in market commerce stops at inventory bags; nothing becomes **worn kit**.

This plan closes both gaps with one coherent **loadout + readiness** model.

---

## 2. Goals

1. **Loadout slots** — each character can have worn/wielded equipment derived from economy goods (clothing body, primary weapon, optional later slots).
2. **Auto-seed on creation** — estate, social stratum, role class, and wealth drive a default kit so the world is dressed without manual setup.
3. **Editor / prep UX** — Character Details + PC Work panel let the player (or GM) equip from inventory, tweak domain practice within soft bounds, and inspect readiness for hunt jobs.
4. **Combat / mission coupling** — cull combat (and future personal combat) reads **equipment quality + domain proficiency**, not only base skills; hunt missions grant **practice credit** (absorbs PR-3c).
5. **Setting-agnostic attire** — High Fantasy monsters and mundane peasantries both get cloth; rulers get court-grade garments regardless of magic.
6. **Ownership purity** — Characters own person-shaped data; Economy owns goods transfer and `individualSkills` growth; no nobility→economy reverse imports.

### Non-goals (v1)

- Unique named magic items, durability, repair mini-games, full D&D inventory grids.
- Rendering 3D clothing meshes or portrait sprites (text + quality tier is enough).
- Replacing phenotype `looks` / beauty system.
- Simulating every inhabitant as a full Character with loadout (roster characters only; same boundary as `individualSkills`).
- Instantly rewriting all military unit equipment / regiment supply (may consume quality later).
- Full RPG XP levels / skill-point budgets (practice proficiency growth stays UO-style domain skill).

---

## 3. Design summary

```text
                    ┌─────────────────────────────┐
  personFactory     │ Character.loadout (slots)    │  Characters-owned
  estate/role seed  │  body / weapon / …           │
                    │ Character.inventory (bulk)   │  already exists
                    └──────────────┬──────────────┘
                                   │ equip / unequip
                    ┌──────────────▼──────────────┐
  market commerce   │ Economy goods (Garments,    │
  gifts, editor     │ Arms, Silk, Jewelry, …)     │
                    └──────────────┬──────────────┘
                                   │ readiness readers
                    ┌──────────────▼──────────────┐
  individualSkills  │ domain proficiency +        │  Economy-owned
  martial mastery   │ practiceCoverage growth     │
                    └──────────────┬──────────────┘
                                   │ combatScore(…)
                    ┌──────────────▼──────────────┐
  threat cull, …    │ equipmentBonus + domainBonus│
                    └─────────────────────────────┘
```

**Principle:** Inventory is *bags of goods*. Loadout is *what is on the body right now*. Domain skills are *practiced ability*. Base skills remain *broad aptitude / social capability*. Combat and social display combine them; none replaces another.

---

## 4. Data model

### 4.1 Loadout (Characters-owned)

Add optional `loadout` on `Character` (save-compatible; missing = undressed / unarmed until seed or equip):

```ts
/** Quality band shared by attire and weapons (1 = rags / farm tool … 5 = royal / masterwork). */
export type EquipmentQuality = 1 | 2 | 3 | 4 | 5;

export type LoadoutSlotId = "body" | "weapon" | "accessory" | "mount";

export interface EquippedItem {
  /** Catalog good id (Garments, Arms, Silk, Jewelry, Horses, …). */
  goodId: number;
  quality: EquipmentQuality;
  /**
   * How this item entered the loadout.
   * - seeded: world-gen / role seed (may not debit inventory)
   * - equipped: taken from inventory units
   * - editor: free GM override
   * - gift / spoils: future transfer sources
   */
  source: "seeded" | "equipped" | "editor" | "gift" | "spoils";
  /** Optional short flavor key for UI (e.g. "court_robe", "hunting_bow"). English catalog. */
  styleKey?: string;
}

export interface CharacterLoadout {
  body?: EquippedItem;       // clothing / armor-as-attire (Garments, Silk, Furs, Cloth as rags)
  weapon?: EquippedItem;     // Arms primary
  accessory?: EquippedItem;  // Jewelry, optional prestige
  mount?: EquippedItem;      // Horses head — optional v1.1
}
```

**Rules:**

| Rule | Detail |
| :--- | :--- |
| One item per slot | Equip replaces; previous item returns to inventory if `source === "equipped"` |
| Seeded items | Do not require inventory stock; they represent household issue / birth kit. Optional later: convert seeded → equipped by consuming 1 set when first sold |
| Bulk goods stay bulk | Equipping Arms consumes **1 set** from `inventory[Arms]` when source is `equipped`; unequip restores 1 set |
| Quality is metadata | Quality is not a separate Good; it is rolled at seed or copied from purchase policy (v1: seed + editor; market quality tags later) |
| Slot eligibility | Table of allowed good names/tags per slot (see §5) |

### 4.2 Readiness snapshot (pure, derived)

Not stored. Pure helper for UI and combat:

```ts
interface CharacterReadiness {
  attireQuality: EquipmentQuality | 0; // 0 = none
  weaponQuality: EquipmentQuality | 0;
  martialDomain: { swordsmanship: number; archery: number }; // proficiency 0..100 or 0 if absent
  combatScoreEstimate: number; // same formula as cull combat (preview)
  attireLabel: string; // English display, e.g. "Worn garments (common)"
  readinessTips: string[]; // e.g. "No weapon equipped — hunt risk high"
}
```

### 4.3 Domain practice (Economy-owned, unchanged storage)

Keep `CharacterDomainSkill` in `individualSkills`. Extend **consumers and seeders**, not the schema:

- Seed swordsmanship/archery for martial-leaning roster roles and for **PC focus** when first selected / when first viewing prep.
- Cull mission success/fail contributes `practiceCoverage`-style growth (small annual or per-mission credit).
- `cullDomainBonus` (from PR-3c sketch) becomes one input to combat, alongside equipment.

### 4.4 Base skills (Characters-owned)

No schema change. Editor may nudge `martial` / `prowess` within soft bounds for GM prep; live tick growth remains out of scope (domain practice grows instead).

---

## 5. Goods → slots mapping

Use existing catalog names (resolve via `pack.goods` / economy goods list at runtime):

| Slot | Allowed goods (name) | Notes |
| :--- | :--- | :--- |
| `body` | Garments, Cloth, Linen, Silk, Furs | Cloth/Linen alone = poor wraps (quality ≤2). Garments default. Silk/Furs raise quality floor by stratum |
| `weapon` | Arms | Primary personal weapon set. Style key may distinguish bow vs blade for domain hint only |
| `accessory` | Jewelry | Prestige / ornament display; tiny combat bonus only at quality ≥4 (or none in v1) |
| `mount` | Horses | Deferred combat effect; seed for high estate / nomadic cultures in v1.1 |

Tags already present (`clothing`, `military`, `luxury`) can validate eligibility without hardcoding every id.

**Quality bands (shared):**

| Q | Attire meaning | Weapon meaning | Typical seed sources |
| ---: | :--- | :--- | :--- |
| 1 | Rags / undyed wraps | Farm tool / club | slave_born, destitute |
| 2 | Plain working clothes | Militia spear / short blade | commoner, freeman |
| 3 | Decent town dress | Soldier arms | officer, merchant_born, commander |
| 4 | Fine / courtly | Officer / knight arms | court_noble, landed_noble, high wealth |
| 5 | Regalia / ceremonial | Masterwork / heirloom | reigning_dynasty, royal |

Fantasy and non-fantasy share the same bands; style keys (and later culture packs) change labels, not mechanics.

---

## 6. Auto-generation (seed loadout + practice)

### 6.1 When

| Event | Action |
| :--- | :--- |
| `createPerson` / backstory finalize | Seed `loadout.body` (always if missing). Seed `weapon` for martial roles / officers / commanders / military raisedIn |
| First PC set (`setPlayerCharacter`) | Ensure body + optional weapon seed if still missing; ensure martial domain rows if prowess/martial above threshold |
| Economy enable mid-session | Idempotent backfill for living characters without body (batch, once) |
| Map regenerate | New roster seeds as usual |

### 6.2 Seed inputs

Priority (highest wins for quality floor/ceiling):

1. `backstory.origin.estateStatus` / `socialStratum`
2. Active `titles` (landed ruler / court office → quality floor 4)
3. `roleClass` / primary skill (commander → weapon Q≥3 + swordsmanship seed)
4. `wealth` bands (very rich can bump attire +1 cap 5)
5. Culture type hints (Nomadic / Hunting → Furs or Horses tendency; optional styleKey)
6. RNG gauss around target quality (deterministic from `character.i` + seed)

**Minimum social dignity rule (core of the attire vacuum fix):**

```text
if loadout.body is missing after seed:
  every living Character gets body with quality ≥ 1
  estate reigning_dynasty | court_noble | landed_noble → quality ≥ 3
  titles with landed sovereign → quality ≥ 4
```

Commoners are no longer data-naked; rulers are no longer data-undressed.

### 6.3 Inventory interaction on seed

- Seeded kit **does not** create inventory units (avoids flooding markets).
- Optional display: inventory tab shows “Equipped (household)” separately from bulk bags.
- When player **buys** Garments/Arms and clicks Equip: consume 1 set, set `source: "equipped"`, quality from purchase policy (v1 default Q=3 for new purchase, or editor-chosen).

### 6.4 Domain skill seed

| Condition | Domain | Initial proficiency band |
| :--- | :--- | :--- |
| roleClass commander / primary martial | swordsmanship | max(20, 0.65*martial+0.35*prowess) (existing martialIndividualMastery) |
| raisedIn military_camp / hunting culture | archery or swordsmanship | slightly lower than commander |
| PC prep “adventurer” template (editor) | both at low–mid | player-adjustable |
| merchant / religious only | none | — |

Idempotent: `ensureMartialSkill` already exists — reuse for hunters.

---

## 7. Experience / practice growth

Replaces standalone PR-3c “practiceCoverage only for commanders.”

| Source | Credit | Applied to |
| :--- | :--- | :--- |
| Command regiment (existing) | annual practiceCoverage | swordsmanship/archery by unit mix |
| Successful named cull mission | small proficiency gain (e.g. +0.3…1.0 with diminishing returns) | domain matching weapon styleKey or higher of sword/bow |
| Failed / injured mission | smaller gain or none; injury cooldown unchanged | same |
| Editor “train” | not automatic XP dump; soft manual set with clamp | GM tool |
| Base `skills.*` | **not** inflated by practice (K5 preserved) | — |

`cullDomainBonus(characterId)`:

```text
bonus = 0.08 * max(swordProf, bowProf) / 100 * 100  // ~0..8 points on combat score scale
// exact constants tuned in implementation; pure function + unit tests
```

`equipmentBonus(loadout)`:

```text
weapon: (quality - 1) * 2.5   // 0..10
body:   (quality >= 4 ? 1 : 0) // light only — clothes ≠ plate armor sim
// total equipmentBonus soft-capped (e.g. 12)
```

```text
combatScore = 0.55*prowess + 0.45*martial + domainBonus + equipmentBonus
```

Anonymous hunters remain `ANON_COMBAT_SCORE` with no equipment path.

---

## 8. UI / editor surfaces

### 8.1 Character Details Dialog

New tab **Loadout** (or Inventory sub-section):

- Current slots with good icon, quality stars/label, styleKey text.
- Actions: Equip from inventory (eligible goods), Unequip (if equipped), Set quality (editor mode / debug if not player).
- Domain practice read-only list (prowess-linked skills) with optional GM sliders when “Edit character” mode is on.
- Readiness summary for PC: combat estimate vs typical pest/monster difficulties.

### 8.2 Player Character Panel (Work)

Under hunt board:

- One-line readiness: “Garments Q2 · Arms Q3 · Sword 41 · Est. score 52”.
- Buttons: **Prepare…** opens Details Loadout tab; Apply Hunt disabled tooltip if score << post difficulty is **advisory only** (do not hard-block apply — day laborers can still try).
- After mission resolve, toast/log already exists; optional “practice improved” line.

### 8.3 Auto-gen templates (adventurer prep)

Lightweight presets in editor (not a full class system):

| Template | Body | Weapon | Domain seed | Wealth nudge |
| :--- | :--- | :--- | :--- | :--- |
| Peasant laborer | Garments Q2 | none | none | — |
| Town militia | Garments Q2 | Arms Q2 | sword ~25 | — |
| Hireling adventurer | Garments Q3 | Arms Q3 | sword ~40, bow ~25 | small cost from wealth if available |
| Court officer | Garments/Silk Q4 | Arms Q3–4 | sword ~45 | — |
| Sovereign | Silk/Garments Q5 + Jewelry | Arms Q4 (ceremonial) | low practice unless martial primary | — |

Templates only adjust **this character**; they do not spawn new goods into markets.

---

## 9. Ownership & architecture

| Concern | Owner | Storage | Notes |
| :--- | :--- | :--- | :--- |
| `Character.loadout` | Characters | character object / characters slice | Host archive via existing character serialization |
| `Character.inventory` | Characters field; Economy mutates via commands | character object | Already commerce path |
| `individualSkills` | Economy | economy slice | Unchanged ownership |
| Seed rules | Characters (`loadoutSeed.ts`) | pure + factory hook | May read goods catalog via ExtensionAPI / context |
| Equip commands | Economy (goods debit) + Characters (slot write) | command on economy or characters | Prefer **one command** on economy that validates goods then writes loadout through a characters-safe callback, **or** characters command that only touches inventory+loadout without market prices |
| Combat bonuses | Economy pure functions | none | `threatCullCombat` imports pure helpers; no UI |
| PC panel | Nobility | none | getters only |

**Recommended command shape (v1):**

```ts
// characters extension (person-shaped)
dispatchExtensionCommand("characters.equipFromInventory", { characterId, slot, goodId, quality? })
dispatchExtensionCommand("characters.unequipSlot", { characterId, slot })
dispatchExtensionCommand("characters.setLoadoutEditor", { characterId, loadout }) // GM / seed repair

// economy (practice only — already has individualSkills)
// reuse ensureMartialSkill; add applyCullPracticeCredit(characterId, outcome)
```

Avoid economy owning clothing fashion; avoid nobility owning goods math.

**Archive:** `loadout` rides with character records already archived; add validation clamp quality 1–5 and drop unknown slots. No new economy slice required for v1.

**Data topics:** equip/unequip → `characters` (or existing character topic) + UI event `fmg:character-loadout-changed` (mirror inventory-changed). Mid-year practice credit → existing individualSkills path / economy tick.

---

## 10. Integration with threat cull

| Cull design item | Change |
| :--- | :--- |
| PR-3c | **Superseded** by this plan’s EQ-3 + EQ-4 |
| `combatScore` | Add `equipmentBonus` + enable `domainBonus` |
| `CULL_RESOLVE_ENABLED` | Unchanged (already true after PR-3b) |
| Anon contracts | Still no loadout / domain |
| PC panel | Show readiness (EQ-2 / EQ-5) |
| practiceCoverage | Cull credits + existing commander annual |

Update [player-threat-cull-jobs.md](./player-threat-cull-jobs.md) status line: PR-3c deferred → replaced by `character-loadout-and-readiness.md`.

---

## 11. Setting coverage (fantasy & mundane)

| Setting | Body seed | Weapon seed | Domain |
| :--- | :--- | :--- | :--- |
| Low / no fantasy rural | Cloth/Garments Q1–2 | rare | rare |
| Medieval polity court | Garments/Silk Q4–5 | ceremonial Arms | officer only |
| High Fantasy frontier burg | Garments Q2–3 | Arms Q2–3 common on hunt board applicants | sword/bow for adventurer template |
| Dark Fantasy | same mechanics; styleKeys grim | same | same |

No separate “fantasy clothing system.” Magic items stay out of v1; High Fantasy still benefits because **monsters are dangerous** and prep (Arms + practice) matters more.

---

## 12. Alternatives considered

| Option | Why rejected / deferred |
| :--- | :--- |
| Only enable PR-3c domainBonus | Does not fix nakedness or prep loop |
| Full unique item instances with durability | Too heavy for population roster; market already unit-based |
| Put loadout only on player character | Leaves rulers/commoners undressed; fails systemic goal |
| Derive clothing solely from wealth number | No equip action; market purchase stays meaningless |
| Store clothing as phenotype ornament | Conflates body with wardrobe; breaks beauty ideals |
| Economy-owned wardrobe slice | Duplicates character identity; worse for archive/UI |

---

## 13. Key Decisions

| ID | Decision | Rationale |
| :--- | :--- | :--- |
| **K1** | Loadout is optional structured field on `Character`, not a free-form inventory flag | Clear worn vs bagged; archive-simple |
| **K2** | Equipment reuses catalog goods (Garments, Arms, …) + quality band | Connects market commerce without new item tables |
| **K3** | Seeded kit does not mint inventory units | Prevents false market stock; household issue is free narrative kit |
| **K4** | Every living character gets at least body Q≥1; nobles/rulers get higher floors | Fixes attire vacuum in all settings |
| **K5** | Combat = base skills + domainBonus + equipmentBonus; no base skill inflation from practice | Preserves cull K5 and individual skill mastery design |
| **K6** | PR-3c is absorbed; no separate domain-only PR | Prep system is the real dependency for meaningful hunt risk |
| **K7** | Soft readiness UI; no hard apply-block on low score | Day-laborer fantasy: desperate hunts remain possible |
| **K8** | Characters own loadout; Economy owns practice growth and goods debit on equip-from-inventory | 4-layer + extension boundaries |
| **K9** | v1 slots: body + weapon (+ accessory optional); mount deferred | Ship the dignity + hunt prep path first |
| **K10** | Display is English labels + quality; no 3D clothing art in v1 | Matches project UI language rules; cheap |

---

## 14. PR Plan

### EQ-1 — Loadout schema + seed — **DONE**

- **Title:** `feat(characters): Character.loadout schema and estate-based attire seed`
- **Files:** `characterTypes.ts`, `loadoutSeed.ts`, `loadoutSeed.test.ts`, `charactersContext.ts` (catalog resolve), `backstoryProfile.ts`, `finalizeCharacterSociety.ts`
- **Dependencies:** none
- **Description:** Add `CharacterLoadout` types; seed body (always) and weapon (martial roles); dignity floors (K4); idempotent backfill helper; no UI yet.

### EQ-2 — Equip / unequip + Details UI

- **Title:** `feat(characters): equip from inventory and Loadout tab`
- **Files:** characters commands, `CharacterDetailsDialog.tsx`, i18n English strings, inventory interaction tests
- **Dependencies:** EQ-1; economy market inventory already live
- **Description:** Equip consumes 1 set; unequip restores; editor override path; `fmg:character-loadout-changed`.

### EQ-3 — Combat bonuses (replaces PR-3c domain half)

- **Title:** `feat(economy): cull combat equipmentBonus + cullDomainBonus`
- **Files:** `threatCullCombat.ts`, optional `loadoutCombat.ts` pure helper, tests for worked examples, wire RESOLVE
- **Dependencies:** EQ-1 (loadout present); PR-3b already live
- **Description:** Enable domainBonus for named hunters; add weapon/body equipmentBonus; update unit tests; keep anon path unchanged.

### EQ-4 — Practice credit from cull missions

- **Title:** `feat(economy): cull practice credit for individualSkills`
- **Files:** `threatCullHire.ts` resolve path, `martialIndividualMastery` or small `cullPractice.ts`, tests
- **Dependencies:** EQ-3
- **Description:** Success/fail practice gains with diminishing returns; still no base `skills.*` inflation; commander annual path untouched.

### EQ-5 — PC readiness + adventurer templates

- **Title:** `feat(nobility): PC readiness line and adventurer prep templates`
- **Files:** `PlayerCharacterPanel.tsx`, optional template helper in characters, getters
- **Dependencies:** EQ-2, EQ-3
- **Description:** Readiness summary; Prepare opens loadout; templates (peasant / militia / hireling / court); advisory tooltips only.

### EQ-6 — Soft social effects (optional)

- **Title:** `feat(characters): attire quality soft prestige / tooltip flavor`
- **Files:** prestige helper or display-only labels, CharacterDetails, optional world help blurb
- **Dependencies:** EQ-1
- **Description:** Small prestige display modifier or court tooltip from attire quality; must not rewrite political AI. Can ship after EQ-5.

### Merge order

```text
EQ-1 → EQ-2 → EQ-5
  │       ↘
  └→ EQ-3 → EQ-4
EQ-1 → EQ-6 (optional, parallel after EQ-1)
```

Threat-cull doc: mark PR-3c superseded; point to EQ-3/EQ-4.

---

## 15. Acceptance criteria

- [ ] Living roster characters after generate have `loadout.body` with quality ≥ 1.
- [ ] Reigning / court / landed nobles seed attire quality ≥ 3 (≥ 4 for sovereign landed titles).
- [ ] Martial commanders/officers usually seed a weapon; pure merchants usually do not.
- [ ] Equip from inventory decrements bulk goods by 1 set; unequip restores.
- [ ] Seeded items do not create false market supply.
- [ ] Named cull combat uses domainBonus + equipmentBonus; anon unchanged.
- [ ] Successful cull can raise swordsmanship/archery proficiency without raising base martial/prowess.
- [ ] PC panel shows readiness; Apply Hunt still available when undergeared.
- [ ] Character Details shows loadout in English; no Japanese UI strings.
- [ ] No economy→nobility imports; loadout archive-safe (clamp/drop invalid).
- [ ] Fantasy and non-fantasy maps both dress commoners and rulers (same code path).

---

## 16. Open questions

1. **Purchase quality:** Should market-bought Garments/Arms always enter at Q=3, or inherit a future goods-quality field?
2. **Accessory combat:** Jewelry combat bonus zero in v1, or tiny prestige-only?
3. **Backfill cost:** On enable mid-session, seed all living characters in one tick or lazy on first open of Details?
4. **Style keys catalog:** Minimal hardcoded English keys vs culture-pack driven fashion names in EQ-6?
5. **Player wealth cost for templates:** Should “Hireling adventurer” template spend wealth / inventory or only rearrange existing kit?

Defaults if unanswered before implementation: **Q=3 on purchase**, **jewelry no combat bonus**, **lazy backfill on Details/PC open + one-shot generate seed**, **minimal style keys**, **templates free rearrange only**.

---

## 17. Implementation notes (for agents)

- Prefer pure functions for seed quality and combat bonuses (easy tests).
- Reuse `ensureMartialSkill` rather than forking proficiency init.
- `CharacterDetailsDialog` already has inventory tab + `fmg:character-inventory-changed` — mirror that pattern for loadout.
- `personFactory` must stay free of economy module imports; seed may resolve good ids by name via a thin charactersContext goods lookup or pass goodId map from generate-post-core hook.
- E2E: only pin render mode if asserting SVG; loadout is data/UI — prefer unit + dialog tests.
- Update `docs/plan/player-threat-cull-jobs.md` status when EQ-1 starts.

---

## 18. Relationship to prior PR-3c

| PR-3c item | Disposition |
| :--- | :--- |
| `cullDomainBonus` in RESOLVE | **EQ-3** |
| practiceCoverage / hunt practice credit | **EQ-4** |
| no base skills inflation | **Kept (K5)** |
| Standalone small PR | **Cancelled** as sole deliverable |

This plan is the readiness layer cull jobs needed to feel like adventuring day labor rather than a pure dice roll on abstract prowess.
