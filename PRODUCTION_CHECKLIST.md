# 101 COFFEE production checklist

Run `powershell -ExecutionPolicy Bypass -File .\verify-production.ps1` from this repository before any production deploy.

The verification must pass all of these gates:

- The current directory is the approved repository path.
- The working tree has no tracked or untracked changes.
- `HEAD` and `origin/main` match `101-PRODUCTION-BASELINE.json`.
- The configured `origin` is `https://github.com/NAJF8/cof1.git`.
- Worker tests pass.
- `node --check` passes for the root, Worker, and Firebase Functions entry points.
- `git diff --check` passes.
- Firebase Realtime Database Rules dry-run validation passes.
- The live Worker build header matches the baseline.

This checklist never prints or exports secret values, customer data, PINs, or Firebase Auth records.
