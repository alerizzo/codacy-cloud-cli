---
---

Internal release-infra change (no version bump): make Changesets changelog
generation resilient to transient GitHub GraphQL failures by retrying and
falling back to a git-based changelog, so the "version packages" release step
no longer aborts on "Failed to parse data from GitHub / Premature close".
