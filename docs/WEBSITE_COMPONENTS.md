# Website Components — Reference

Overview of the **aiess_website** React/Next.js component structure. Components live under `components/` and are grouped by domain or type.

---

## 1. Layout & Shell

| Component | Path | Purpose |
|-----------|------|---------|
| **Header** | `components/header.tsx` | Site-wide nav: logo, main links, language switcher, mobile sheet, optional top banner. Uses `AnimatedAiessLogo`, `LanguageSwitcher`, `Sheet`, `DropdownMenu`. |
| **Footer** | `components/footer.tsx` | Site-wide footer: company info, nav links, support links, social, locale-aware. |
| **Skip to content** | `components/ui/skip-to-content.tsx` | A11y link to skip nav and jump to main content. |
| **Language switcher** | `components/language-switcher.tsx` | PL/EN toggle; integrates with routing and header. |

---

## 2. Brand & Logo

| Component | Path | Purpose |
|-----------|------|---------|
| **AiessLogoText** | `components/aiess-logo-text.tsx` | Renders "AIESS" for nav/logo; supports `variant="dark"` for dark backgrounds. |
| **AnimatedAiessLogo** | `components/animated-aiess-logo.tsx` | Animated logo used in header. |
| **AiessBrand / BrandAI** | `components/energy-core/brand-text.tsx` | In-content brand: "AIESS" and standalone "AI" in Montserrat Alt1 + AIESS blue. See `context/AIESS_LOGO_IMPLEMENTATION.md`. |

---

## 3. Page Compositions

Each "page" is a composition of sections and optional graphics. Content is driven by `*-content.ts` (or similar) and `locale`.

### 3.1 About (O Nas)

- **Page:** `components/about/about-page.tsx`
- **Content:** `components/about/about-content.ts`
- **Sections:**  
  `hero-section`, `who-we-are-section`, `core-product-section`, `philosophy-section`, `values-section`, `team-section`, `facts-section`, `cta-section`

### 3.2 Energy Core (AIESS Energy Core)

- **Page:** `components/energy-core/energy-core-page.tsx`
- **Content:** `components/energy-core/energy-core-content.ts`
- **Sections:**  
  `hero-section`, `market-problem-section`, `architecture-section`, `how-it-works-section`, `scalability-section`, `learning-section`, `economic-section`, `credibility-section`, `security-section`, `enex-footer-section`
- **Graphics:**  
  `energy-core-hero-graphic`, `energy-core-architecture-graphic`, `energy-core-flowchart-graphic`, `energy-core-comparison-graphic`, `energy-core-learning-graphic`, `energy-core-learning-comparison-graphic`, `energy-core-scalability-graphic`
- **Brand:** `components/energy-core/brand-text.tsx` (`AiessBrand`, `BrandAI`)

### 3.3 Cloud (AIESS Cloud)

- **Page:** `components/cloud/cloud-page.tsx`
- **Content:** `components/cloud/cloud-content.ts`
- **Sections:**  
  `hero-section`, `problem-section`, `architecture-section`, `features-section`, `strategy-section`, `scalability-section`, `credibility-section`, `enex-footer-section`
- **Graphics:**  
  `cloud-hero-graphic`, `cloud-architecture-graphic`, `cloud-strategy-flow-graphic`, `cloud-scalability-graphic`

### 3.4 Shared / Home

- **Energy Core showcase** (e.g. homepage): `components/sections/energy-core-showcase-section.tsx`

---

## 4. UI Primitives & Effects (`components/ui/`)

Reusable building blocks: shadcn-style primitives plus project-specific effects.

| Component | Purpose |
|-----------|---------|
| **button**, **input**, **label**, **textarea**, **select**, **checkbox**, **switch** | Form and control primitives. |
| **card**, **badge**, **separator** | Layout and labels. |
| **alert**, **dialog**, **sheet**, **dropdown-menu** | Overlays and feedback. |
| **animated-tooltip** | Tooltips. |
| **heading-with-anchor** | Headings with anchor links for deep-linking. |
| **hero-highlight**, **aiess-hero-highlight** | Hero text highlight styling. |
| **typewriter-effect**, **text-generate-effect** | Text animation effects. |
| **sticky-scroll-reveal** | Reveal content on scroll. |
| **focus-cards**, **bento-grid**, **wobble-card** | Card layouts and hover effects. |
| **infinite-moving-cards** | Horizontal scrolling card strip. |
| **aurora**, **aurora-background**, **background-beams**, **background-gradient** | Background effects. |
| **spotlight**, **light-rays**, **meteors**, **orb** | Decorative / spotlight effects. |
| **brain-animations**, **brain-overlay** | Brain-themed visuals (e.g. AIESS AI). |
| **floating-navbar** | Floating nav variant (if used). |
| **skip-to-content** | Accessibility skip link. |

---

## 5. Feature Areas

### 5.1 Blog

- **anchor-scroll** — In-page anchor navigation.
- **blog-image** — Blog image with consistent styling.
- **callout** — Callout/quote blocks in posts.
- **download-button** — Download CTA in blog.
- **image-gallery** — Image gallery in posts.

### 5.2 Contact

- **contact-info** — Contact details block.
- **contact-form** — Contact form.
- **google-maps** — Embedded Google Map.

### 5.3 Gdzie Kupić (Where to buy / installers)

- **gdzie-kupic-hero** — Hero for installer page.
- **installer-search** — Search/filter installers.
- **installer-list** — List of installers.
- **google-maps-installers** — Map with installer pins.
- **map-container** — Wrapper for map.

### 5.4 Catalogue (product specs / PDF)

- **micro-series-catalogue-a4**, **micro-product-spec-page** — Micro series.
- **pro-series-catalogue-a4**, **pro-product-spec-page** — Pro series.
- **titan-series-catalogue-a4**, **titan-product-spec-page**, **titan-cabinet-spec-page** — Titan series.

### 5.5 Enex (events / tickets)

- **EnexRegistrationForm** — Event registration.
- **EnexTicketForm** — Ticket form.

### 5.6 Admin

- **admin-sidebar** — Admin layout sidebar.
- **blog-preview-modal** — Preview blog posts.
- **image-upload** — Image upload for admin.

### 5.7 Other

- **analytics/google-analytics** — GA integration.
- **cookie-consent** — Cookie banner/consent.
- **case-study-card** — Case study card.
- **author/author-bio** — Author bio for blog.
- **aeo/qa-section**, **aeo/fact-box** — AEO/QA content blocks.
- **export-guard/export-guard-dashboard** — Export Guard feature UI.
- **kalkulator/lightning-loader** — Loader for calculator.
- **animated-product-name** — Animated product name.
- **DecryptedText** — Decrypted text display (e.g. for protected content).

---

## 6. File Layout Summary

```
components/
├── ui/                    # Primitives, cards, effects, backgrounds
├── about/                 # About page + sections
├── energy-core/           # Energy Core page, sections, graphics, brand-text
├── cloud/                 # Cloud page, sections, graphics
├── sections/              # Shared sections (e.g. energy-core-showcase)
├── blog/                  # Blog UI (image, callout, gallery, etc.)
├── contact/               # Contact form, info, map
├── gdzie-kupic/           # Installer search, list, map
├── catalogue/             # Product catalogues and spec pages
├── enex/                  # Enex forms
├── admin/                 # Admin sidebar, preview, image upload
├── analytics/             # Google Analytics
├── author/                # Author bio
├── aeo/                   # AEO/QA sections
├── export-guard/          # Export Guard dashboard
├── kalkulator/            # Calculator loader
├── header.tsx             # Site header
├── footer.tsx             # Site footer
├── language-switcher.tsx
├── aiess-logo-text.tsx
├── animated-aiess-logo.tsx
├── animated-product-name.tsx
├── case-study-card.tsx
├── cookie-consent.tsx
├── DecryptedText.tsx
└── ...
```

---

## 7. Conventions

- **Locale:** Page-level components typically accept `locale: Locale` (e.g. `'pl' | 'en'`) and pull copy from `*-content.ts`.
- **Brand text:** Use `<AiessBrand />` / `<BrandAI />` or `<AiessLogoText />` for "AIESS"/"AI"; see `context/AIESS_LOGO_IMPLEMENTATION.md` and `.cursor/rules/aiess_brand_text.mdc`.
- **UI primitives:** Prefer `components/ui/` for buttons, inputs, cards, dialogs, etc., to keep styling and behavior consistent.
- **Graphics:** Product/feature graphics live next to their page (e.g. `energy-core/graphics/`, `cloud/graphics/`).

For logo and font specs (Montserrat Alt1, AIESS blue), see **`context/AIESS_LOGO_IMPLEMENTATION.md`**.
