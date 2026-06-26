---
---

Internal CI change (no version bump): skip the `changeset-check` job on the
changesets bot's "version packages" PR (`changeset-release/main`). That PR
consumes (deletes) changesets rather than adding them, so the check counted 0
added/modified changeset files and always failed.
