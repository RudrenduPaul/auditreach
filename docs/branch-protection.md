# Branch protection (ready to apply, not yet applied)

Not applied automatically -- this repo is early enough that fast solo commits to `main` are still useful. Apply once collaborators or external PRs start landing.

## Apply via `gh api`

```bash
gh api repos/RudrenduPaul/auditreach/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

## Or via the GitHub UI

Settings -> Branches -> Add branch protection rule -> `main`:

- Require a pull request before merging (1 approval)
- Require status checks to pass before merging -- select `ci`
- Require branches to be up to date before merging
- Do not allow force pushes
- Do not allow deletions
