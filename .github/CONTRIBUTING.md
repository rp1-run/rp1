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

Releases are fully automated via **release-please**:

1. Merge your PR to `main` with conventional commit messages
2. release-please automatically creates/updates a Release PR with changelog
3. When the Release PR is merged, GitHub Actions automatically:
   - Creates GitHub Release with version tag
   - Builds and attaches OpenCode tarball artifacts
   - Publishes to npm with OIDC provenance
   - Updates version files (`plugin.json`, `package.json`, README badges)

No manual tagging or scripts required - just write good commit messages!

## Development Workflow

See [DEVELOPMENT.md](../DEVELOPMENT.md) for detailed project architecture and testing setup.

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes
3. Commit with conventional commits: `git commit -m "feat: add new capability"`
4. Push and create PR: `git push origin feat/your-feature`
5. After PR approval and merge, automation handles the release

## Testing

Before submitting a PR:

1. Test your changes with Claude Code locally
2. Verify command/agent functionality
3. Check for any breaking changes
4. Update documentation if needed

## Questions?

Open an issue or discussion on GitHub!
