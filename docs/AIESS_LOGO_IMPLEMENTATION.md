# AIESS Brand Text — Implementation Guide

This is the authoritative reference for rendering the AIESS brand name and the "AI" text token in the **aiess_website** Next.js project.

> **Rule:** Never render "AIESS" or "AI" as plain text in visible UI. Always use a brand component.

---

## Quick Reference

| What you want to render | Component to use | Import from |
|---|---|---|
| "AIESS" (inherits parent size/color for ESS) | `<AiessBrand />` | `@/components/energy-core/brand-text` |
| "AI" standalone in blue | `<BrandAI />` | `@/components/energy-core/brand-text` |
| "AIESS" with `variant="dark"` for dark backgrounds | `<AiessLogoText variant="dark" />` | `@/components/aiess-logo-text` |
| Raw Tailwind class | `font-aiess-logo` + `text-aiess-blue` | globals.css utilities |

---

## 1. Primary Components

### `<AiessBrand />` — use everywhere in page content

**File:** `components/energy-core/brand-text.tsx`

```tsx
import { AiessBrand, BrandAI } from '@/components/energy-core/brand-text'

// In a heading — inherits the h1/h2 font size via text-[1em]
<h1 className="text-6xl font-bold">
  <AiessBrand className="text-[1em]" /> Energy Core
</h1>

// In body text
<p>
  System <AiessBrand /> automatycznie optymalizuje harmonogram ładowania.
</p>

// Standalone "AI" mention in a sentence
<p>
  Autonomiczny system z dialogowym interfejsem <BrandAI />.
</p>
```

**Props:**
- `className` — forwarded to the wrapper `<span>`. Use `text-[1em]` to inherit parent font size.

**Behaviour:**
- Font: Montserrat Alt1 Bold (`font-aiess-logo font-bold`)
- "AI" → `#008CFF` (AIESS blue, via `text-aiess-blue`)
- "ESS" → inherits parent text color (black on light bg, white on dark bg)

---

### `<AiessLogoText />` — use in nav/logo contexts or when you need explicit dark variant

**File:** `components/aiess-logo-text.tsx`

```tsx
import { AiessLogoText } from '@/components/aiess-logo-text'

// Light background (default)
<AiessLogoText />

// Dark background — ESS becomes white
<AiessLogoText variant="dark" />

// Custom size
<AiessLogoText className="text-4xl" as="span" />
```

**Props:**
- `variant` — `'light'` (default, ESS in `#0F172A`) | `'dark'` (ESS in white)
- `className` — forwarded to wrapper
- `as` — `'span'` (default) | `'div'`

---

## 2. Infrastructure (already set up — do not re-add)

### Font: Montserrat Alt1

Declared in `app/globals.css` via `@font-face`, loaded from jsDelivr CDN + local fallback in `public/fonts/`.

All weights (300–700) are registered. **Do not use "Montserrat Alternates" from Google Fonts — it is a different font.**

### Tailwind utilities

`tailwind.config.cjs`:
```js
fontFamily: {
  'aiess-logo': ['Montserrat Alt1', 'var(--font-manrope)', 'sans-serif']
}
```

`globals.css`:
```css
:root { --aiess-blue: #008CFF; }
.font-aiess-logo { font-family: 'Montserrat Alt1', var(--font-manrope), sans-serif; font-weight: 600; }
.text-aiess-blue { color: var(--aiess-blue); }
```

### Using raw Tailwind (fallback only)

Only when a component is not appropriate (e.g. inside a string-only context):

```tsx
<span className="font-aiess-logo font-bold tracking-tight">
  <span className="text-aiess-blue">AI</span>ESS
</span>
```

---

## 3. Brand Specs

| Token | Value |
|---|---|
| "AI" color | `#008CFF` — `text-aiess-blue` / `var(--aiess-blue)` |
| "ESS" color | Inherits parent (do not hardcode) |
| Font family | `Montserrat Alt1` via `font-aiess-logo` |
| Font weight | `font-bold` (700) |
| Letter spacing | `tracking-tight` |

---

## 4. Common Patterns

### Page heading

```tsx
<h1 className="text-7xl font-bold text-ink-900">
  <AiessBrand className="text-[1em]" /> Energy Core
</h1>
```

### Card title

```tsx
<h3 className="text-xl font-semibold text-ink-800">
  <AiessBrand className="text-[1em]" /> Platform
</h3>
```

### Sentence with "AI"

```tsx
<p className="text-lg text-ink-600">
  Predykcja zużycia (<BrandAI />) na podstawie danych historycznych.
</p>
```

### Footer / dark background

```tsx
// AiessBrand inherits white from parent — works naturally
<footer className="bg-ink-900 text-white">
  <AiessBrand className="text-2xl" />
</footer>

// Or explicitly with AiessLogoText for guaranteed white ESS
<AiessLogoText variant="dark" className="text-2xl" />
```

---

## 5. Where it's used in this project

| File | Usage |
|---|---|
| `components/energy-core/sections/hero-section.tsx` | `<AiessBrand />` in h1, `<BrandAI />` in subtitle |
| `components/energy-core/sections/market-problem-section.tsx` | `<AiessBrand />` in comparison card header |
| `components/energy-core/sections/architecture-section.tsx` | `<AiessBrand />` in layer names, `<BrandAI />` for AI Interface |
| `components/energy-core/sections/scalability-section.tsx` | `<AiessBrand />` in description |
| `components/energy-core/sections/credibility-section.tsx` | `<AiessBrand />` in section title |
| `components/energy-core/sections/enex-footer-section.tsx` | `<AiessBrand />` in footer brand slot |
| `components/gdzie-kupic/gdzie-kupic-hero.tsx` | `<AiessLogoText />` in animated hero heading |
| `components/footer.tsx` | Raw `font-aiess-logo` + `text-primary-500` span pattern |

---

## 6. Anti-patterns — never do these

```tsx
// ❌ Plain text
<h1>AIESS Energy Core</h1>

// ❌ Manual hardcoded color
<span style={{ color: '#008CFF' }}>AI</span>ESS

// ❌ Wrong font (Google Montserrat Alternates ≠ Montserrat Alt1)
<span className="font-['Montserrat_Alternates']">AIESS</span>

// ❌ Only styling "AIESS" blue without brand font
<span className="text-blue-500 font-bold">AIESS</span>
```
