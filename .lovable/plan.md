

# Playful & Colorful Landing Page for GreenGrass CRM

## Concept
A vibrant, whimsical landing page that feels hand-crafted and approachable — like a friendly lawn care brand that doesn't take itself too seriously. Think Mailchimp meets a garden journal: bold pops of color, hand-drawn style icons, organic shapes, and playful micro-interactions — all while maintaining professional credibility.

## Hand-Drawn Icon Strategy
Use **Phosphor Icons** (`@phosphor-icons/react`) with the `duotone` weight — they have a softer, sketchier feel compared to Lucide's geometric precision. Alternatively, use Lucide icons but style them with a custom CSS class that applies a slight rotation, thicker stroke, and a "wobbly" SVG filter to simulate a hand-drawn look without adding a new dependency.

**Recommended approach**: CSS-only hand-drawn effect on existing Lucide icons:
- Slight random rotation per icon (`-2deg` to `3deg`)
- `stroke-linecap: round; stroke-linejoin: round;` for softer edges
- Thicker stroke width (2.5-3px)
- Subtle drop shadow in the accent color
- Icons placed inside colorful, rounded "blob" backgrounds

## Color Palette (extends existing theme)
Keep the green primary but add playful pops:
- **Coral/Salmon** `#FF6B6B` — CTAs and highlights
- **Sunny Yellow** `#FFD93D` — badges, accents (already close to `--accent`)
- **Sky Blue** `#6CB4EE` — info sections
- **Lavender** `#C4B5FD` — testimonial cards
- **Mint** `#6EE7B7` — success/feature cards
- These are used as section backgrounds and card accents, NOT replacing the core theme variables

## Page Sections

### 1. Navbar
- Transparent on top, white on scroll
- Logo with a leaf icon that wiggles on hover
- "Sign In" ghost button, "Start Free" coral CTA with rounded-full shape

### 2. Hero
- Split layout: left text, right illustration area
- Headline in a large playful font weight: **"Your Lawn Care Business, Blooming."**
- Subtext with a casual tone: "The CRM that grows with you — schedule jobs, delight customers, get paid."
- Email input + coral "Get Growing 🌱" button
- Background: subtle scattered leaf/flower doodle pattern (CSS-generated or inline SVG)
- Floating animated elements: small leaf, flower, and grass blade SVGs drifting gently

### 3. Social Proof Strip
- Pastel yellow background strip
- "Trusted by 500+ lawn care pros" with hand-drawn underline effect on "500+"
- Small animated counter or static badges

### 4. Features Grid (3x2)
Each card has:
- A colorful blob background (different pastel per card)
- A Lucide icon styled hand-drawn inside the blob
- Playful title + 1-line description
- Slight tilt on hover (`rotate-1` → `rotate-0` transition)

Features: Customer Management, Smart Scheduling, Sales Pipeline, Invoicing, Feedback Loop, Team Dashboard

### 5. How It Works
- 3-step horizontal flow with hand-drawn numbered circles
- Dashed connecting line (SVG or border-dashed)
- Each step has an icon in a colored circle + short text
- Steps: Sign Up → Add Your First Customer → Watch It Grow

### 6. Testimonials
- Alternating pastel card backgrounds (lavender, mint, sky blue)
- Quote marks styled as large, faded, hand-drawn glyphs
- Star ratings with filled yellow stars
- Rounded avatar placeholders

### 7. CTA Banner
- Full-width coral/salmon gradient background
- Bold white text: "Ready to ditch the clipboard?"
- Large "Start Free — No Credit Card" button
- Small scattered grass/leaf doodles

### 8. Footer
- Dark green (`sidebar-background`) footer
- Organized link columns
- Small leaf icon flourishes

## Files Changed

| File | Change |
|------|--------|
| `src/pages/LandingPage.tsx` | **New** — full playful landing page with all sections |
| `src/App.tsx` | Add `/` route for `<LandingPage />` when unauthenticated (lines 66-73) |
| `src/index.css` | Add hand-drawn icon utility classes, blob shapes, doodle patterns, wobble animations |

## Technical Notes
- No new icon library needed — Lucide icons + CSS transforms for hand-drawn feel
- All animations use CSS (`@keyframes`) — no JS animation libraries
- Inline SVG doodles for leaf/flower/grass decorations (small, performant)
- Fully responsive: stacked layout on mobile, side-by-side on desktop
- Smooth-scroll navigation between sections
- "Sign In" navigates to `/auth`, "Get Growing" can also link to `/auth`

