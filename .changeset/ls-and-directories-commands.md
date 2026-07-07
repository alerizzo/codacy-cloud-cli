---
"@codacy/codacy-cloud-cli": minor
---

Add `ls` and `directories` commands to browse a repository's tree with quality
metrics. `ls` lists the directories and files at a path — showing Grade, Issues,
Complexity, Duplication, and Coverage per row — and `directories` (alias `dirs`)
lists folders only, with `--plus-children` to also show one level of
sub-directories as a `└─` tree. Both auto-detect the provider/organization/repository
from the git remote and the path from your current directory (relative to the
repo root); override with positional args, `--path`, and `--branch`. Sort with
`--sort <field>` (`name`, `issues`, `grade`, `duplication`, `complexity`,
`coverage`) and `--direction asc|desc`. `codacy ls --search <term>` finds files
at any depth under the path. Folders and files are marked with `▸` and `·` (no
emojis). Both commands fetch every page of results, so nothing is truncated.
