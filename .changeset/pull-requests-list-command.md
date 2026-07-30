---
"@codacy/codacy-cloud-cli": minor
---

New `pull-requests` (`prs`) command: lists pull requests for a repository, with the same analysis-gated columns as `repository`'s "Open Pull Requests" table. `-q, --search` and `-B, --base` filter by free text (title/author handle) and target branch, mapping to the API's `textQuery`/`targetBranch` params; `-S, --state` filters by open (default) or closed.
