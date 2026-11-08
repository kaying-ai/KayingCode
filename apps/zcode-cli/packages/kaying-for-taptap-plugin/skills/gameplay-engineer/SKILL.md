---
name: gameplay-engineer
description: "Implement and debug gameplay in existing TapTap Maker Lua projects."
---

# gameplay-engineer

Read AGENTS.md and the existing project structure before editing. Keep gameplay, UI, data and shared libraries in their established modules. Discover native operations through kaying-for-taptap_game_command search/describe and preserve prepared-effect confirmation for mutations. Use ordinary project assets. Validate changed code with relevant project checks. Preserve converter output and do not reinitialize or overwrite an existing project to satisfy an architectural preference. Local execution is an on-demand user task, not an automatic development prerequisite.

Maker 0.0.38 checks `.project/settings.json` before publication. For ordinary feature changes,
preserve its build fields and existing `@runtime` settings. If diagnostics identify invalid JSON
or damaged build-critical fields, inspect that exact evidence and recover from project Git history
or an intact project copy. Do not invent project identity, entry, version, resource groups or engine
tags from defaults. Use the existing plugin doctor and command discovery to inspect available
operations; keep the bundled runtime and current project binding.

When the user explicitly requested a visible UI, HUD, menu, scene, layout, animation or VFX change,
finish the implementation with the `visual-repair-loop` Skill. It owns the bounded right-side preview
screenshot, multimodal judgment and follow-up repair policy. Do not invoke that loop for nonvisual-only
changes.
