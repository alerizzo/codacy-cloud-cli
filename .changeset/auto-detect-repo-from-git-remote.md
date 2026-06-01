---
"@codacy/codacy-cloud-cli": minor
---

Auto-detect provider, organization, and repository from the git remote origin URL. All repository-scoped commands now work without explicitly passing `<provider> <organization> <repository>` — just run them inside a git repo with an `origin` remote pointing at GitHub, GitLab, or Bitbucket.
