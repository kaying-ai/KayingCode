# Third-party notices

This plugin redistributes an unmodified source snapshot of
[MCP for Blender](https://github.com/ahujasid/mcp-for-blender) by Siddharth Ahuja
and contributors under the MIT license. The exact revision and file hashes are
recorded in `upstream-lock.json`. The complete original license is distributed
at `vendor/mcp-for-blender/LICENSE`.

KayingCode's launcher, diagnostic tools and workflow instructions are separate
from the upstream snapshot. Python runtime dependencies are resolved from the
snapshot's `uv.lock` into a user cache; their licenses remain in their installed
distributions. Blender itself is not bundled. This integration is not affiliated
with the Blender Foundation.
