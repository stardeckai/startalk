# Block Aesthetic Design System

A design language for Stardeck's public-facing pages that creates a modern, editorial feel through strategic use of borders, whitespace, and content containment.

## Core Concept

The "Block Aesthetic" creates visual structure through **full-bleed borders** that extend edge-to-edge while **content remains constrained** within a max-width container. This creates the illusion of content floating within defined horizontal "rails" while vertical borders anchor sections to the viewport edges.

## Key Principles

### 1. Full-Bleed Horizontal Borders

Horizontal borders (`border-y`, `border-t`, `border-b`) extend to the full width of the viewport, creating strong visual dividers between sections.

```tsx
<div className="border-border border-y">{/* Content inside */}</div>
```

### 2. Constrained Content with Side Borders

Content is constrained to `max-w-7xl` and centered with `mx-auto`. Vertical borders (`border-x`) are applied to this constrained container, creating visible "rails" on either side when the viewport is wider than the content.

```tsx
<div className="border-border border-y bg-white/40">
  <div className="border-border mx-auto max-w-7xl border-x px-4 py-16">
    {/* Content here stays within max-width */}
    {/* Side borders show in the whitespace */}
  </div>
</div>
```

### 3. Continuous Vertical Flow

Section headers and content should share the same `max-w-7xl` constraint so their side borders align, creating a continuous vertical "column" effect down the page.

```
┌────────────────────────────────────────────────────────────┐
│                    (viewport edge)                          │
│     │                                              │        │
│     │         SECTION HEADER                       │        │
│     │         (border-x on max-w-7xl)              │        │
│     │                                              │        │
├─────┴──────────────────────────────────────────────┴────────┤  ← full-bleed border
│     │                                              │        │
│     │         SECTION CONTENT                      │        │
│     │         (border-x on max-w-7xl)              │        │
│     │                                              │        │
└─────┴──────────────────────────────────────────────┴────────┘
      ↑                                              ↑
      side borders align vertically
```

## Implementation Patterns

### Section with Header

```tsx
<section className="relative z-10">
  {/* Header block */}
  <div className="border-border border-y bg-white/40 backdrop-blur-md">
    <div className="border-border mx-auto max-w-7xl border-x px-4 py-16">
      <h2 className="text-foreground text-center text-4xl font-light">Section Title</h2>
      <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-center text-lg">
        Section description text.
      </p>
    </div>
  </div>

  {/* Content block */}
  <div className="border-border border-b">
    <div className="mx-auto max-w-7xl">{/* Section content */}</div>
  </div>
</section>
```

### Dark Header Variant

For sections that need visual emphasis (like the Agent section):

```tsx
<div className="bg-foreground">
  <div className="border-background/20 mx-auto max-w-7xl border-x px-4 py-16">
    <h2 className="text-background text-center text-4xl font-light">Dark Section Title</h2>
    <p className="text-background/60 mx-auto mt-4 max-w-2xl text-center text-lg">
      Description with inverted colors.
    </p>
  </div>
</div>
```

### Grid with Internal Dividers

For multi-column layouts, use `divide-x` and `divide-y` for internal borders:

```tsx
<div className="border-border border-b">
  <div className="divide-border mx-auto grid max-w-7xl divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
    {items.map((item) => (
      <div className="bg-white/40 p-8 md:p-12">{/* Item content */}</div>
    ))}
  </div>
</div>
```

### Two-Column Split Layout

For layouts where you need a vertical border between two halves:

```tsx
<div className="border-border border-y">
  <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
    {/* Left column */}
    <div className="border-border md:w-2/5 md:border-r">{/* Left content */}</div>

    {/* Right column */}
    <div className="flex-1">{/* Right content */}</div>
  </div>
</div>
```

## Color & Background Treatments

### Surface Tokens (Recommended)

Use surface tokens for interactive elements - they work in both light and dark mode:

| Token                 | Use Case                       |
| --------------------- | ------------------------------ |
| `bg-surface`          | Default interactive surface    |
| `bg-surface-hover`    | Hover state                    |
| `bg-surface-selected` | Selected/active state          |
| `bg-surface-muted`    | Video backgrounds, muted areas |

```tsx
<button className="bg-surface hover:bg-surface-hover">Works in both light and dark!</button>
```

### Legacy Patterns (Light Mode Only)

| Use Case        | Background                                    | Border Color    |
| --------------- | --------------------------------------------- | --------------- |
| Default section | `bg-white/40 backdrop-blur-md`                | `border-border` |
| Hover state     | `bg-white/60`                                 | `border-border` |
| Subtle gradient | `bg-gradient-to-br from-white/80 to-white/40` | `border-border` |

## Dark Mode Sections

Wrap any section in `className="dark"` to invert the theme:

```tsx
<section className="dark">
  {/* All semantic colors are now inverted */}
  <div className="bg-background text-foreground border-border">
    Dark bg, light text, visible borders
  </div>

  {/* Surface tokens automatically use dark variants */}
  <button className="bg-surface hover:bg-surface-hover">Works correctly in dark mode</button>
</section>
```

## Spacing Guidelines

| Element                | Mobile         | Desktop         |
| ---------------------- | -------------- | --------------- |
| Section header padding | `px-4 py-16`   | `px-4 py-16`    |
| Content block padding  | `p-6` or `p-8` | `p-8` or `p-12` |
| Grid gap               | `divide-y`     | `divide-x`      |

## Typography in Headers

- **Title**: `text-4xl font-light md:text-5xl`
- **Subtitle/Description**: `text-lg text-muted-foreground` (or `text-background/60` on dark)
- **Max width for readability**: `max-w-2xl mx-auto text-center`

## Do's and Don'ts

### Do

- Use `max-w-7xl` consistently across sections for aligned side borders
- Let horizontal borders extend full viewport width
- Use `divide-x`/`divide-y` for internal grid borders
- Keep backgrounds semi-transparent (`/40`, `/60`) for the glassmorphism effect

### Don't

- Add rounded corners (`rounded-*`) - the aesthetic is sharp and editorial
- Use shadows - we're a flat design with borders
- Mix different max-width values within the same visual section
- Add padding to the outer full-bleed containers (padding goes on inner max-width containers)

## Reference Components

- `platform-section.tsx` - Grid layout with header
- `agent-features-section.tsx` - Two-column tabbed layout with dark header
