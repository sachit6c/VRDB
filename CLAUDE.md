# CLAUDE.md

Operational guide for Claude/Copilot when working in this repo.

## Project

**VRDB** — a movie & TV backlog app for two. Tinder-style swiping, shared matched list, TMDB-powered. Mobile-first web. See [movie_tv_backlog_PRD.md](movie_tv_backlog_PRD.md) for full spec.

## Stack

- Vanilla JS + ES Modules (no build step)
- [Supabase](https://supabase.com) — storage + realtime
- [TMDB API](https://www.themoviedb.org/documentation/api) — all content data
- CSS with `clamp()` for fluid responsive layout
- Vercel — static deployment

## Repo Conventions

- No build pipeline. Source files are served directly.
- Keys (Supabase anon, TMDB) are **inlined client-side** in `lib/*-client.js`. This is intentional — see PRD threat model. Never commit anything that needs to stay secret.
- Local config in `vrdb-config.js` (gitignored). Example in `vrdb-config.example.js`.
- Partner names are **hardcoded** in `vrdb-config.js`. No auth, no OAuth.

## Deployment

Deployments go to **Vercel**, triggered automatically when `main` is pushed to GitHub.

The GitHub PAT lives in `~/.zshrc` as `$GITHUB_TOKEN` (user: `$GITHUB_USER` = `sachit6c`). Never commit the literal token.

**Always use this exact push command** (authenticated as `sachit6c`). Never push via any other account — do not use `sharmasachit`, Claude's identity, VS Code signed-in accounts, or any system credential helper:

```bash
git push "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/sachit6c/VRDB.git" main --tags
```

### Release workflow

```bash
# 1. Make sure you're on main and it's clean
git checkout main
git status   # should be clean

# 2. Bump "version" in package.json to X.Y.Z

# 3. Commit, tag, and push
git add -A
git commit -m "chore: bump version to X.Y.Z"
git tag release-vX.Y HEAD
git push "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/sachit6c/VRDB.git" main --tags
```

### Before every deploy

This repo has no test/build pipeline — it's a static site. Smoke-test locally:

```bash
npm start    # serve index.html and click through the main flows
```

## Security

- The PAT is in `~/.zshrc` only — never paste it into source files, commit messages, or shared chats.
- If the token leaks, revoke it at https://github.com/settings/tokens and update `~/.zshrc`.
- Supabase anon key and TMDB key are inlined intentionally for a 2-user trusted-URL app. Do not treat them as secrets, but also do not use them in any new context without re-evaluating the threat model.

## Token Rotation Playbook

When pushes start failing with `Invalid username or token` / HTTP 401:

1. Quick check the current token in a fresh shell:
   ```bash
   curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
     -u "sachit6c:${GITHUB_TOKEN}" https://api.github.com/repos/sachit6c/VRDB
   ```
   `200` = good. `401` = token is expired or revoked.
2. Generate a new **classic PAT** at https://github.com/settings/tokens with `repo` scope (or a fine-grained one with read/write **Contents** on the relevant `sachit6c/*` repos).
3. Edit `~/.zshrc` and replace the `export GITHUB_TOKEN=...` line.
4. `source ~/.zshrc` in any open terminal, or open a new one.
5. Retry the push command from the Release workflow above.

When piping pushes through tools that print URLs, always sanitize the output so the token doesn't appear in logs:

```bash
git push "https://sachit6c:${GITHUB_TOKEN}@github.com/sachit6c/VRDB.git" main --tags 2>&1 \
  | sed -E "s|${GITHUB_TOKEN}|***|g"
```
