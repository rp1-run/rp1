# RP1 Brand Assets

This directory contains the checked-in RP1 brand source copies, role-specific SVGs, and deterministic raster derivatives used by README, documentation, Arcade, and the native shell.

## Authoritative Sources

Corrected source assets were copied from `/Users/prem/Development/rp1/assets/brand` on 2026-05-01. The authoritative no-text mark source for checked-in role derivatives is `assets/brand/rp1-mark-only.svg`; use it for every favicon, compact mark, app icon, and no-text UI mark.

| Source Path | Local Copy | Role Use |
|-------------|------------|----------|
| `assets/brand/rp1-mark-only.svg` | `rp1-mark-only.svg` | authoritative mark-only source |
| `/Users/prem/Development/rp1/assets/brand/rp1 logo-01.svg` | `source/rp1-logo-01.svg` | corrected source reference; not used by mark-only roles |
| `/Users/prem/Development/rp1/assets/brand/rp1 logo-02.svg` | `source/rp1-logo-02.svg` | contained lockup, social preview source |
| `/Users/prem/Development/rp1/assets/brand/rp1 logo-03.svg` | `source/rp1-logo-03.svg` | corrected source reference; superseded by `rp1-mark-only.svg` for mark-only roles |
| `/Users/prem/Development/rp1/assets/brand/rp1 logo-04.svg` | `source/rp1-logo-04.svg` | transparent horizontal wordmark/lockup |
| `/Users/prem/Development/rp1/assets/brand/rp1 logo-05.svg` | `source/rp1-logo-05.svg` | corrected source reference; superseded by `rp1-mark-only.svg` for mark-only roles |
| `/Users/prem/Development/rp1/assets/brand/rp1-logo-system.png` | `source/rp1-logo-system.png` | reference sheet for source provenance only |

## Palette

| Token | Hex | Source |
|-------|-----|--------|
| `rp1-charcoal` | `#0f1113` | source SVG fills and logo-system palette |
| `rp1-off-white` | `#f6f4ef` | source SVG fills and logo-system palette |
| `rp1-green` | `#23d188` | source SVG fills and logo-system palette |
| `rp1-amber` | `#ffb000` | logo-system palette |

## Mark-only Variants

`rp1-mark-only.svg` is the source of truth for mark-only surfaces. Dark-ink variants use the source charcoal fills (`#0f1113`) with the green accent (`#23d188`) for light contexts. Light-ink variants replace only the charcoal fills with off-white (`#f6f4ef`) and keep the green accent for dark contexts. Favicon and app-icon derivatives use the same paths centered in a square canvas.

## Role Map

| Role | Asset | Source |
|------|-------|--------|
| Compact mark | `rp1-mark-only-dark.svg`, `rp1-mark-only-light.svg`, `rp1-mark.svg`, `rp1-mark-light.svg`, `rp1-mark-32.png` | `rp1-mark-only.svg` |
| Favicon | `favicon.svg`, `rp1-mark-32.png` | `rp1-mark-only.svg` |
| Horizontal lockup for dark contexts | `rp1-lockup-light.svg` | `source/rp1-logo-02.svg` |
| Horizontal lockup for light contexts | `rp1-lockup-dark.svg` | `source/rp1-logo-04.svg` |
| Contained wordmark | `rp1-wordmark.svg` | `source/rp1-logo-04.svg` |
| Empty-state mark | `rp1-empty-state-dark.svg`, `rp1-empty-state-light.svg`, `rp1-empty-state.svg` | `rp1-mark-only.svg` |
| Social preview | `social-preview.svg`, `social-preview.png` | `source/rp1-logo-02.svg` |
| Native app icon | `app-icon.svg`, `native/icon.png`, `native/icon.ico`, `native/icon.iconset/**` | `rp1-mark-only.svg` |

`favicon.svg`, `app-icon.svg`, and `social-preview.svg` adjust only the SVG canvas/viewBox so `resvg` emits fixed-size derivatives without changing the source artwork. Wordmark and lockup sources are used only for text-bearing brand surfaces.

## Generated Derivatives

Run these commands from the repository root after refreshing source copies:

```bash
resvg --width 32 --height 32 assets/brand/favicon.svg assets/brand/rp1-mark-32.png
resvg --background "#0f1113" --width 1200 --height 630 assets/brand/social-preview.svg assets/brand/social-preview.png
resvg --background "#0f1113" --width 512 --height 512 assets/brand/app-icon.svg assets/brand/native/icon.png
```

```bash
for entry in icon_16x16.png:16 icon_16x16@2x.png:32 icon_32x32.png:32 icon_32x32@2x.png:64 icon_128x128.png:128 icon_128x128@2x.png:256 icon_256x256.png:256 icon_256x256@2x.png:512 icon_512x512.png:512 icon_512x512@2x.png:1024; do
  name=${entry%%:*}
  size=${entry##*:}
  resvg --background "#0f1113" --width "$size" --height "$size" assets/brand/app-icon.svg "assets/brand/native/icon.iconset/${name}"
done
```

```bash
for size in 16 32 48 128 256; do
  resvg --background "#0f1113" --width "$size" --height "$size" assets/brand/app-icon.svg "/tmp/rp1-brand-assets-ico/icon_${size}.png"
done
magick /tmp/rp1-brand-assets-ico/icon_16.png /tmp/rp1-brand-assets-ico/icon_32.png /tmp/rp1-brand-assets-ico/icon_48.png /tmp/rp1-brand-assets-ico/icon_128.png /tmp/rp1-brand-assets-ico/icon_256.png assets/brand/native/icon.ico
```

ImageMagick is used only to package the ICO from PNGs rendered by `resvg`.

## Consumer Copies

Consumer assets are byte-for-byte copies of these canonical files:

| Canonical | Consumer |
|-----------|----------|
| `rp1-lockup-light.svg` | `docs/assets/rp1-lockup-light.svg` |
| `rp1-lockup-dark.svg` | `docs/assets/rp1-lockup-dark.svg` |
| `rp1-mark-only-light.svg` | `docs/assets/rp1-mark.svg`, `cli/web-ui/public/rp1-mark-only-light.svg` |
| `rp1-mark-only-dark.svg` | `cli/web-ui/public/rp1-mark-only-dark.svg` |
| `favicon.svg` | `docs/assets/favicon.svg`, `cli/web-ui/public/favicon.svg` |
| `rp1-empty-state-light.svg` | `cli/web-ui/public/rp1-empty-state-light.svg` |
| `rp1-empty-state-dark.svg` | `cli/web-ui/public/rp1-empty-state-dark.svg` |
| `social-preview.png` | `docs/assets/social-preview.png` |
| `native/icon.png` | `native-app/assets/icon.png` |
| `native/icon.ico` | `native-app/assets/icon.ico` |
| `native/icon.iconset/**` | `native-app/assets/icon.iconset/**` |

Do not replace third-party platform logos, partner marks, shields badges, status badges, or harness icons as part of RP1 brand migration work.
