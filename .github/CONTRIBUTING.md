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

- **pre-commit**: Runs lint and format checks on staged files (fast, parallel)
- **pre-push**: Runs typecheck and tests (comprehensive, parallel)

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

### view

Launches a web-based documentation viewer for knowledge base files.

**Invocation**:
```bash
rp1 view [path]
```

**Purpose**: Development utility for previewing knowledge base documentation. Hidden from help output but functional when invoked directly.

**Why Hidden**: These commands serve internal/development purposes and would confuse end users who have no use for them. The `build:opencode` command is only needed during releases and development. The `view` command requires Bun runtime and is primarily for contributors debugging KB generation.

## Questions?

Open an issue or discussion on GitHub!
