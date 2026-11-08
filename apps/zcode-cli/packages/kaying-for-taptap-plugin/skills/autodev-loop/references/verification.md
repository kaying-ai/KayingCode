# Comparing game behavior

Match the relevant device, viewport, scene and starting conditions. For changing or
random gameplay, choose an observable condition instead of expecting identical pixels.
Keep before/after images when useful. Browser Use viewport screenshots are model-visible evidence;
a byte array or saved path without image inspection is not.

Distinguish the following facts in your conclusion:

- A publication completed and the corresponding preview was refreshed.
- The game displayed a visible change or responded to a particular input.
- A running build identifier was independently checked, if such a mechanism exists.

Without an independently observed build identifier, a visible fix confirms only the requested
appearance or behavior in the captured preview state, not every remote artifact.

Browser/outer-shell errors may be unrelated to the game, and JavaScript console events do not
automatically expose Lua VM errors. Use diagnostics to choose the next investigation, not as an
automatic pass/fail gate.

No probe is required for a supported visual conclusion. If optional state and images
disagree, investigate their timing and provenance. Do not trust a state flag over actual
behavior by default. Loading and authorization pages need appropriate waiting or user
authorization, not speculative game-code repairs.
