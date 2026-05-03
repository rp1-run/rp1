# Brand Asset Roles

Use this role map when adding or updating an RP1-owned brand surface. Choose the
role that matches the surface size and context, then reference the checked-in
asset for that role instead of copying artwork from another consumer.

Corrected source copies come from `/Users/prem/Development/rp1/assets/brand`.
The maintained role map, static derivatives, palette values, and generation
provenance live in `assets/brand/` in this repository.

Use checked-in assets only. Product and documentation surfaces must not depend on
runtime image generation or a network service to render RP1 identity.

## Palette

| Token | Hex | Use |
|-------|-----|-----|
| `rp1-charcoal` | `#0f1113` | Warm dark brand surface and primary ink |
| `rp1-off-white` | `#f6f4ef` | Light brand surface and inverse text |
| `rp1-green` | `#23d188` | Terminal-green brand accent |
| `rp1-amber` | `#ffb000` | Secondary accent from the logo-system source |

## Mark-only Variant Rule

Use `assets/brand/rp1-mark-only.svg` as the authoritative source for every no-text mark. Dark-ink variants keep the source charcoal fill (`#0f1113`) and green accent (`#23d188`) for light contexts. Light-ink variants replace only charcoal with off-white (`#f6f4ef`) and keep the green accent for dark contexts. Favicon and app-icon derivatives center those same paths in a square canvas.

## Asset Roles

| Role | Use For | Approved Assets |
|------|---------|-----------------|
| Compact mark | Small identity surfaces where text becomes illegible | `assets/brand/rp1-mark-only-dark.svg`, `assets/brand/rp1-mark-only-light.svg`, `assets/brand/rp1-mark.svg`, `assets/brand/rp1-mark-light.svg`, `assets/brand/rp1-mark-32.png` |
| Horizontal lockup | README header and wide documentation placements | `assets/brand/rp1-lockup-light.svg`, `assets/brand/rp1-lockup-dark.svg` |
| Contained wordmark | MkDocs navbar and bounded logo slots | `assets/brand/rp1-wordmark.svg` |
| Favicon | Browser tabs for docs and Arcade | `assets/brand/favicon.svg`, `assets/brand/rp1-mark-32.png` |
| Native app icon | Native Arcade shell packaging | `assets/brand/app-icon.svg`, `assets/brand/native/icon.png`, `assets/brand/native/icon.ico`, `assets/brand/native/icon.iconset/**` |
| Empty-state mark | Arcade artifact empty and loading states | `assets/brand/rp1-empty-state-dark.svg`, `assets/brand/rp1-empty-state-light.svg` |
| Social preview | Documentation OpenGraph and Twitter card previews | `assets/brand/social-preview.svg`, `assets/brand/social-preview.png` |

## Surface Mapping

| Surface | Role | Asset Source |
|---------|------|--------------|
| README header in light-preference contexts | Horizontal lockup | `rp1-lockup-dark.svg` |
| README header in dark-preference contexts | Horizontal lockup | `rp1-lockup-light.svg` |
| Documentation navbar identity | Compact mark | `docs/assets/rp1-mark.svg`, copied from `assets/brand/rp1-mark-only-light.svg` |
| Documentation favicon | Favicon | `docs/assets/favicon.svg` |
| Documentation social preview | Social preview | `docs/assets/social-preview.png` |
| Arcade browser favicon | Favicon | `favicon.svg` |
| Arcade shell navigation identity | Compact mark | `rp1-mark-only-dark.svg` or `rp1-mark-only-light.svg` |
| Arcade artifact empty and loading state | Empty-state mark | `rp1-empty-state-dark.svg` or `rp1-empty-state-light.svg` |
| Native Arcade shell app identity | Native app icon | `native/icon.iconset/**`, `native/icon.png`, `native/icon.ico` |
| Documentation screenshots showing old RP1 UI branding | Screenshot refresh | Refresh after visible UI migrations are complete |

## Non-target Guidance

Do not replace third-party platform logos, partner marks, shields badges, status badges, or harness icons as part of RP1 brand migration work. Known non-targets include `docs/assets/brands/lobehub-*.svg`, Font Awesome brand icons in documentation pages, and `img.shields.io` badge references.

Screenshots are only updated when they visibly show stale RP1-owned brand UI. Leave screenshots without RP1-owned brand surfaces unchanged.

## Provenance

The corrected lockup and wordmark sources are copied into `assets/brand/source/`. The authoritative no-text mark source is `assets/brand/rp1-mark-only.svg`, and mark-only role SVGs are deterministic variants of that file. `favicon.svg`, `app-icon.svg`, and `social-preview.svg` adjust only the SVG canvas/viewBox so `resvg` emits fixed-size derivatives without changing the artwork.

Raster derivatives are generated with `resvg` and checked in so each consumer can use static files. Native icon rasters render the light mark-only variant on the documented charcoal background. ImageMagick is used only to package `native/icon.ico` from PNGs already rendered by `resvg`.
