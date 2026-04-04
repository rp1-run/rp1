# Contributing to rp1

Thank you for contributing to rp1!

## Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated version management and changelog generation.

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat:` - A new feature (triggers **minor** version bump)
- `fix:` - A bug fix (triggers **patch** version bump)
- `docs:` - Documentation only changes
- `style:` - Code style changes (formatting, missing semi colons, etc)
- `refactor:` - Code refactoring without adding features or fixing bugs
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks, dependency updates

### Breaking Changes

Add `!` after the type or include `BREAKING CHANGE:` in the footer to trigger a **major** version bump:

```
feat!: redesign plugin architecture

BREAKING CHANGE: Plugin configuration format has changed
```

### Examples

```bash
# Patch version bump (1.3.0 → 1.3.1)
git commit -m "fix: resolve command injection vulnerability in bash tool usage"

# Minor version bump (1.3.0 → 1.4.0)
git commit -m "feat: add automatic KB loading to analysis agents"

# Major version bump (1.3.0 → 2.0.0)
git commit -m "feat!: redesign command-agent architecture"
```

## Release Process

Releases are managed via **release-please** with manual approval gates:

1. Merge your PR to `main` with conventional commit messages
2. release-please automatically creates/updates a Release PR with changelog
3. **Manual Approval Required**: A maintainer must review and merge the Release PR
   - This prevents accidental releases during development/debugging
   - Only maintainers with write access can merge release PRs
4. When the Release PR is manually merged, GitHub Actions automatically:
   - Creates GitHub Release with version tag
   - Builds and attaches OpenCode tarball artifacts
   - Updates version files (`plugin.json`, `package.json`, README badges)
   - Triggers GoReleaser for Homebrew/Scoop distribution

Auto-merge is intentionally disabled to ensure release quality and timing control.

## Post-Beta Cleanup

After a beta has been validated and promoted to a stable release, complete the following cleanup steps:

1. **Archive or remove the GitHub pre-release**: Navigate to the beta's GitHub Release (tagged `v*.*.*-beta.*`) and either delete it or mark it as archived. This prevents stale beta binaries from appearing in the releases list.

2. **Reset or remove the beta cask**: In the `rp1-run/homebrew-tap` repository, either remove `Casks/rp1-beta.rb` or reset it to a placeholder. This prevents users from installing an outdated beta after the stable release is available.

3. **Notify beta testers**: Post a comment on the relevant GitHub issue or discussion thread informing testers that the beta has been promoted to stable and they should switch back via:
   ```bash
   brew uninstall rp1-beta && brew install rp1-run/tap/rp1
   ```

The `just beta-release` recipe prints this checklist automatically after a successful beta publish.

## Development Workflow

See [DEVELOPMENT.md](../DEVELOPMENT.md) for detailed project architecture and testing setup.

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes
3. Commit with conventional commits: `git commit -m "feat: add new capability"`
4. Push and create PR: `git push origin feat/your-feature`
5. After PR approval and merge, automation handles the release

## Git Hooks (Optional)

This project uses [Lefthook](https://github.com/evilmartians/lefthook) for local git hooks. Installing it is optional but recommended.

### Setup

```bash
# macOS
brew install lefthook

# Or via npm
npm install -g @evilmartians/lefthook

# Then install hooks
lefthook install
```

### What the hooks do

- **pre-commit**: Blocks direct commits on `main`/`master` and runs lint/format checks on staged files (fast, parallel)
- **pre-push**: Blocks pushes targeting `main`/`master`, then runs typecheck and tests (comprehensive, parallel)

### Skipping hooks

If you need to skip hooks temporarily:

```bash
git commit --no-verify -m "your message"
git push --no-verify
```

## Testing

Before submitting a PR:

1. Test your changes with Claude Code locally
2. Verify command/agent functionality
3. Check for any breaking changes
4. Update documentation if needed

## Internal Commands

The following commands are hidden from the public CLI but remain available for development and contributor use:

### build:opencode

Builds OpenCode artifacts from Claude Code plugin sources.

**Invocation** (development only):
```bash
cd cli
bun run build:opencode
```

This runs the standalone build script at `scripts/build-opencode.ts`.

**Purpose**: Transforms Claude Code plugins into OpenCode-compatible format for release artifacts. This command is used by GitHub Actions during the release process and by contributors building OpenCode tarballs locally.

### arcade

Launches a web-based dashboard for knowledge base files and agent activity monitoring.

**Invocation**:
```bash
rp1 arcade [path]
```

**Purpose**: Development utility for previewing knowledge base documentation and monitoring agent workflows. The `arcade` command requires Bun runtime.

## Questions?

Open an issue or discussion on GitHub!
