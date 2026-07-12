# Branch protection (applied 2026-07-12)

Applied via the `gh api` command below when the repo went public. `enforce_admins: false` means the repo owner can still push directly to `main` for fast solo commits -- collaborators and external PRs go through the required PR + status check + 1 approval flow.

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
