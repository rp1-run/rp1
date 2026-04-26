# macOS Native Shell

The macOS native shell is a development-ready Arcade entrypoint for this phase.
It is a thin Electrobun wrapper around the existing local Arcade daemon and
React UI, not a separate native implementation of Arcade.

Browser Arcade remains supported. The native shell uses the same daemon
lifecycle, project registry, and project routes that `rp1 arcade` uses, so the
browser path is still the fallback when you need it.

## Development Launch

From the repository root, start the native shell with the local development
binary:

```bash
cd native-app
bun install --no-save
cd ..
```

Run that setup once before the first native launch so Electrobun and the native
TypeScript declarations are available locally.

```bash
just native-app-dev
```

With no project supplied, the app opens the existing registered projects route.
Select any registered project from that page to open the normal Arcade project
experience. If the registry is empty, Arcade shows its normal empty projects
state.

To register and open a specific local rp1 project:

```bash
just native-app-dev PROJECT=/path/to/rp1-project
```

To use a different executable:

```bash
just native-app-dev RP1_EXECUTABLE=/absolute/path/to/rp1
```

The recipe builds the local development CLI through `build-local-dev`, then
starts `native-app` in Electrobun dev mode with an explicit `rp1` executable.
It does not change the single-executable CLI build or production install path.

For repeated launch checks where rebuilding would interfere with daemon reuse,
build once with `just build-local-dev`, then run Electrobun directly:

```bash
cd native-app
RP1_NATIVE_RP1_EXECUTABLE="$(pwd)/../bin/rp1" bun run dev -- --rp1-executable "$(pwd)/../bin/rp1"
```

## Launch Inputs

The native app accepts the same development inputs through flags or environment
variables:

| Input | Purpose |
|-------|---------|
| `--project <path>` | Optional project to register and open directly |
| `RP1_NATIVE_PROJECT_PATH` | Environment equivalent for the project path |
| `--rp1-executable <path>` | Explicit `rp1` binary for daemon startup |
| `RP1_NATIVE_RP1_EXECUTABLE` | Environment equivalent for the executable path |

Native executable resolution checks explicit inputs first, then native bundle
and development locations. Native launch does not silently depend on a user
shell `PATH`; if resolution fails, the launch view shows the checked locations
and the override options.

## Manual Verification

Run these checks on macOS before treating the shell bootstrap as complete:

| Check | Command or setup | Expected result |
|-------|------------------|-----------------|
| Cold launch | Stop Arcade with `./bin/rp1 arcade --stop`, then run `just native-app-dev PROJECT=/path/to/rp1-project` | The daemon starts or is replaced and the native window loads the project route |
| Warm launch | Start Arcade first, then run the direct Electrobun command above with optional `--project /path/to/rp1-project` | The existing compatible daemon is reused without a conflicting daemon |
| No-path startup | Run `just native-app-dev` | The native window loads the registered projects route instead of requiring a launch-time path |
| Registered project selection | Ensure at least one project is registered, run `just native-app-dev`, then select that project | The selected project opens in the native window through the existing Arcade project route |
| Optional direct project launch | Run `just native-app-dev PROJECT=/path/to/rp1-project` | The project registers through Arcade if needed and the returned project URL loads |
| Failure state | Use an invalid `PROJECT` path or non-executable `RP1_EXECUTABLE` | The launch view shows a clear failure instead of stale project content |
| Browser fallback | From the same project directory, run `./bin/rp1 arcade` after native launch | Browser Arcade still opens the same project experience |

## Deferred Scope

This phase proves a macOS shell bootstrap only. It does not include signing,
notarization, auto-update, production packaging, tray or menu controls, native
notifications, route deep links, a native folder picker, or Linux and Windows
parity.
