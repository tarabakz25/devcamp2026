# Roomi Design System

## Color Palette

| Token | Hex | Usage |
|---|---:|---|
| `--color-primary` | `#5B6CFF` | Primary actions, Roomi identity, active states |
| `--color-secondary` | `#6ED8C3` | Positive states, supporting highlights |
| `--color-accent` | `#FF8F7A` | Attention, urgency, human warmth |
| `--color-background` | `#F8F9FC` | Main app background |
| `--color-surface` | `#EEF2F7` | Secondary surfaces, cards, inactive controls |
| `--color-text` | `#253047` | Primary text |

```css
:root {
  --color-primary: #5B6CFF;
  --color-secondary: #6ED8C3;
  --color-accent: #FF8F7A;

  --color-background: #F8F9FC;
  --color-surface: #EEF2F7;
  --color-text: #253047;
}
```

### Usage

- Use `Primary` for main actions and Roomi-specific emphasis.
- Use `Secondary` for calm, positive, or supportive states.
- Use `Accent` sparingly for urgency or human emphasis.
- Keep most screens visually neutral with `Background`, `Surface`, and `Text`.

---

## Typography

### Font Family

```css
:root {
  --font-display: "Poppins", "Inter", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
}
```

### Type Scale

| Style | Font | Weight | Size / Line Height |
|---|---|---:|---:|
| Display | Poppins | 600 | 48 / 56 |
| Heading 1 | Poppins | 600 | 32 / 40 |
| Heading 2 | Poppins | 600 | 24 / 32 |
| Heading 3 | Poppins | 600 | 20 / 28 |
| Body | Inter | 400 | 16 / 24 |
| Body Small | Inter | 400 | 14 / 20 |
| Caption | Inter | 400 | 12 / 16 |

### Rules

- Prefer sentence case.
- Avoid all-caps except for small system labels.
- Use bold text only when it helps hierarchy.
- Keep body text readable and compact.

---

## Layout

Roomi uses an **8px grid system**.

### Spacing Scale

| Token | Value |
|---|---:|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `16px` |
| `--space-4` | `24px` |
| `--space-5` | `32px` |
| `--space-6` | `40px` |
| `--space-7` | `48px` |
| `--space-8` | `64px` |

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;
  --space-6: 40px;
  --space-7: 48px;
  --space-8: 64px;
}
```

### Radius Scale

| Token | Value |
|---|---:|
| `--radius-sm` | `4px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `12px` |
| `--radius-xl` | `16px` |
| `--radius-2xl` | `24px` |

```css
:root {
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
}
```

### Layout Rules

- Base all spacing on multiples of 8px where possible.
- Use `16px` to `24px` internal padding for standard cards.
- Use `24px` to `32px` gaps between major content groups.
- Use `12px` to `16px` corner radius for standard UI components.
- Use `24px` radius for large Roomi / AI surfaces.
