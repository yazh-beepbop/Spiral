# ROLLBACK.md: safe ways back when the AI breaks things

## The habit that makes rollback easy

Commit after every working feature. Tag the good ones.

```bash
git add -A
git commit -m "T4: session screen saves answers"
git tag t4-working
git push && git push --tags
```

## Recipes

**Undo uncommitted changes to one file**
```bash
git restore path/to/file.ts
```

**Undo all uncommitted changes (careful: they are gone)**
```bash
git stash            # safer: keeps them in case you want them back
git stash drop       # only when you are sure
```

**Undo a bad commit that is already pushed (keeps history)**
```bash
git revert <commit-hash>
git push
```

**Go back to the last known good tag (local, before pushing anything new)**
```bash
git reset --hard t4-working
```

**Try a risky refactor without breaking main**
```bash
git switch -c refactor-try
# let the agent work here; if it goes well:
git switch main && git merge refactor-try
# if not:
git switch main && git branch -D refactor-try
```

**Find a commit you lost after a reset**
```bash
git reflog
git reset --hard <hash-from-reflog>
```

**See exactly what the AI changed**
```bash
git diff            # uncommitted
git diff HEAD~1     # last commit
```

## If an API key was pushed by mistake

Act fast. A new commit that deletes the key is not enough, because it stays in the history.

1. Go to aistudio.google.com/api-keys
2. Delete the leaked key
3. Create a new key and put it in `.env.local` only
4. Log it in `BUGS.md`

## When to roll back instead of fixing forward

- The agent has made three attempts at the same bug and things are getting worse
- A change touched files outside the task
- The safety layer or the gap stopped working after an unrelated change
