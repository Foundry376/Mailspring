# Event Popover Design Specification

This document defines the design system for the Calendar Event Popover components.

## CSS Variables & Colors

Use these existing LESS variables from `ui-variables.less`:

### Backgrounds
- `@background-primary` (#ffffff) - Main popover background
- `@background-secondary` (#f6f6f6) - Subtle row backgrounds on hover
- `@background-tertiary` (#6d7987) - Dark mode elements (future)

### Text Colors
- `@text-color` (#231f20) - Primary text, values
- `@text-color-subtle` (80% opacity) - Secondary text
- `@text-color-very-subtle` (50% opacity) - Labels, placeholders
- `@text-color-inverse` (#ffffff) - Text on accent backgrounds

### Accent & Interactive
- `@accent-primary` (#419bf9) - Primary accent, focus states
- `@accent-primary-dark` (#3187e1) - Hover states
- `@border-color-divider` - Row separators

### Component-Specific (to add to main-calendar.less)
```less
@event-popover-width: 320px;
@event-popover-row-height: 32px;
@event-popover-label-width: 90px;
@event-popover-padding: @padding-base-horizontal; // 12px
@event-popover-row-padding: @padding-small-vertical @padding-base-horizontal; // 4px 12px
```

## Typography

### Hierarchy
1. **Title** - `@font-size-larger` (18px), `@font-weight-medium` (500)
2. **Values** - `@font-size-small` (13px), `@font-weight-normal` (400)
3. **Labels** - `@font-size-small` (13px), `@font-weight-normal`, `@text-color-very-subtle`
4. **Action Links** - `@font-size-small`, `@text-color-very-subtle`, hover: `@text-color`

## Layout Pattern

### Two-Column Grid Row
All property rows should follow this pattern:
```
┌─────────────────────────────────────────┐
│ [label: 90px]    [value: flex-1]        │
│  right-aligned    left-aligned          │
└─────────────────────────────────────────┘
```

### CSS Pattern for Rows
```less
.event-property-row {
  display: flex;
  align-items: center;
  min-height: @event-popover-row-height;
  padding: @event-popover-row-padding;
  border-bottom: 1px solid @border-color-divider;

  .row-label {
    width: @event-popover-label-width;
    text-align: right;
    padding-right: @padding-base-horizontal;
    color: @text-color-very-subtle;
    font-size: @font-size-small;
    flex-shrink: 0;
  }

  .row-value {
    flex: 1;
    font-size: @font-size-small;
    color: @text-color;
    display: flex;
    align-items: center;
    gap: @padding-base-vertical; // 5px
  }
}
```

## Component Specifications

### 1. EventPropertyRow (Base Component)
Reusable row component for consistent layout.

### 2. CalendarColorPicker
Color dot with dropdown showing available calendar colors.

### 3. LocationVideoInput
Location text input with video call toggle button.

### 4. AllDayToggle
Row with Switch component for all-day events.

### 5. RepeatSelector
Dropdown for recurrence (None, Daily, Weekly, Monthly, Yearly, Custom).

### 6. AlertRow
Alert configuration with type and timing.

### 7. ShowAsSelector
Dropdown for availability status (Busy, Free, Tentative).

### 8. EventPopoverActions
Footer with Save/Cancel buttons using `.btn` classes.

## Popover Structure

```
┌──────────────────────────────────────────┐
│ [Title Input]              [ColorPicker] │
├──────────────────────────────────────────┤
│ [LocationVideoInput]                     │
├──────────────────────────────────────────┤
│   all-day: │ [Switch]                    │
│    starts: │ [Date] [Time]               │
│      ends: │ [Date] [Time]               │
│ time zone: │ [Dropdown]                  │
│    repeat: │ [Dropdown]                  │
│     alert: │ [AlertRow]                  │
│   show as: │ [Dropdown]                  │
├──────────────────────────────────────────┤
│ [Add Invitees]                           │
├──────────────────────────────────────────┤
│ [Add Notes or URL]                       │
├──────────────────────────────────────────┤
│              [Cancel] [Save]             │
└──────────────────────────────────────────┘
```

## Interaction States

### Inputs
- Default: transparent background, no border
- Hover: `@background-secondary` background
- Focus: `@accent-primary` 2px outline

### Dropdowns
- Styled consistently with existing app dropdowns
- Use `@shadow-border` for dropdown menus

### Buttons
- Cancel: `.btn` (default style)
- Save: `.btn.btn-emphasis` (blue gradient)
