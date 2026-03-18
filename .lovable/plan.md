

## Plan: Elevate Admin Onboarding UX — Google Workspace-inspired Polish

### What Changes

Rewrite `src/pages/admin/AdminOnboard.tsx` with a premium, landscaping-themed UX overhaul while keeping all existing logic (invite generation, manual creation, confirmation) intact.

### Key UX Improvements

**1. Welcome Hero (New Step 0 → becomes Step 1, shifting others)**
- Full-width hero with gradient background (emerald-to-teal) and an SVG illustration of a growing tree/garden schematic
- Heading: "Your business, in full bloom."
- Subtext: "The all-in-one tool to manage designs, irrigation, and maintenance without the paperwork."
- Large "Let's get started" button with hover scale effect
- This becomes the entry point; existing steps shift by +1

**2. Refined Step Transitions**
- Replace `animate-in fade-in` with custom CSS keyframe transitions: slide-in from right when advancing, slide-in from left when going back
- Add these keyframes to `tailwind.config.ts`: `slide-in-left`, `slide-in-right` with translateX + opacity
- Each step wrapper gets a key-based transition class

**3. Progress Bar Instead of Dots**
- Replace the dot indicators with a smooth animated progress bar (using the existing `Progress` component)
- Show step label text below: "Welcome → Choose Type → Method → Details → Done"

**4. Selection Cards Upgrade**
- Larger cards with a subtle gradient border on hover (not just ring)
- Add a decorative background pattern (CSS radial gradient dots) to the card area
- Icon containers get a soft bounce animation on hover

**5. Form Improvements (Steps 3a/3b)**
- Floating label style: labels inside the input that float up on focus (CSS-only with peer classes)
- Green checkmark validation indicators on filled fields
- Phone input with a country code prefix badge (+40)
- Grouped fields in a clean card with section dividers

**6. Celebration Page Overhaul (Final Step)**
- Full-screen gradient background (emerald)
- Animated green leaf confetti effect (CSS keyframes — multiple small leaf shapes floating down)
- Large heading: "Congratulations! Your digital garden is ready."
- Subtle pulsing glow on the success icon
- Action buttons with hover-scale effect

**7. Mobile Responsiveness**
- Single-column card layout on mobile
- Hero text scales down gracefully
- Forms stack vertically with full-width inputs

### Files to Edit

| File | Change |
|------|--------|
| `src/pages/admin/AdminOnboard.tsx` | Full UX rewrite — add welcome hero, leaf confetti, progress bar, floating labels, slide transitions |
| `tailwind.config.ts` | Add `slide-in-left`, `slide-in-right`, `float-down` keyframes |
| `src/index.css` | Add leaf confetti `@keyframes` and floating label utility classes |

### What Stays the Same
- All business logic (invite generation, manual creation via edge function, confirmation data)
- Email template HTML functions (untouched)
- State management and API calls
- Routing

