---
"@codacy/codacy-cloud-cli": minor
---

`codacy findings` and `codacy finding` now show the vulnerable dependency's import chain for SCA findings that carry the new `dependencyChains` field. Each finding is labelled **Direct** (`Update <pkg> to <fixedVersion>`) or **Transitive** (`<pkg> → … → <pkg> (Fixed in <fixedVersion>)`), and chains with 4+ packages collapse their middle to `<first> → ... N more ... → <last>`. The list shows the first chain plus `... and X more`; the detail lists every chain aligned under a single label. `dependencyChains` is also included in `--output json`.
