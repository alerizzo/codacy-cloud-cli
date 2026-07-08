---
"@codacy/codacy-cloud-cli": patch
---

Stop `issues --overview` from suggesting noise reduction on repositories that aren't
actually noisy. The "Suggested actions to reduce noise" section now requires two absolute
floors before anything is suggested: the repository must have at least 200 issues in total,
and an individual pattern must produce at least 100 issues on its own. The per-pattern floor
matters because a repository with a long tail of tiny patterns pulls the median issues-per-
pattern very low, which previously made a pattern with only a handful of issues look
disproportionate — now a rule has to genuinely flood the repo before it's flagged. On top of
those floors, a pattern must still show a relative signal: the "dominant share" rule (≥10% of
all issues) only applies when there are at least 11 distinct patterns (an even split of N
patterns only drops below 10% once N is above 10, so 8-10 balanced patterns would otherwise
all be flagged), and the "disproportionate count" rule now compares each
pattern against the **median** issues-per-pattern instead of the mean, so a single huge
pattern can no longer inflate the baseline and hide smaller-but-still-disproportionate ones.
