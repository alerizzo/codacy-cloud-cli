---
"@codacy/codacy-cloud-cli": patch
---

Fix tools import to preserve cloud-only tools (only disable tools the local CLI supports), handle config-file mode correctly (skip pattern reset when useLocalConfigurationFile is set), and surface structured API error details on import failures.
