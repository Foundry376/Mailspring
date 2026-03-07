# Accessibility Plan 08: Form Label Associations and Form Accessibility

## 1. ESLint Configuration Audit

**File:** `/home/user/Mailspring/.eslintrc`

Two a11y rules explicitly disabled:
```json
"jsx-a11y/tabindex-no-positive": 0,
"jsx-a11y/label-has-for": 0,
```

The `label-has-for` rule is disabled (no comment explaining why — almost certainly "silence the noise and ship it"). The modern replacement is `jsx-a11y/label-has-associated-control`, which handles both explicit `htmlFor`+`id` association and implicit wrapping. This should be the rule enabled in the final state.

---

## 2. Shared Form Component Audit: `form-field.tsx`

**File:** `app/internal_packages/onboarding/lib/form-field.tsx`

The component is structurally correct:
```tsx
<label htmlFor={props.field}>{props.title}:</label>
<input ... id={props.field} ... />
```

`htmlFor` matches `id` via `props.field`. **However:** some call sites pass bare string literals to `title` instead of `localized()` (see below).

---

## 3. Complete Findings

### Onboarding Forms

**`page-account-settings.tsx` line 90:**
```tsx
<FormField field="settings.imap_password" title="Password" ... />
// → title="Password" should be title={localized('Password')}
```

**`page-account-settings-imap.tsx` lines 131-144:**
- Custom port `<input>` shares the same `id` as the `<select>` above it — duplicate `id`, label only associates to the first element
- Server/Username/Container Folder titles are bare string literals not wrapped in `localized()`

### Composer Fields

**`composer-header.tsx` lines 148-162:** Subject `<input>` uses `placeholder={localized('Subject')}` as its only label — placeholder disappears on input, not a real label.

**`tokenizing-text-field.tsx` line 986:** "To/Cc/Bcc" labels are rendered as `<div className="tokenizing-field-label">` — not a `<label>` element, not associated to the input. A screen reader user hears "edit text" for recipient fields with no context.

### Search Bar

**`thread-search-bar.tsx`:** `TokenizingContenteditable` has no `aria-label` and no `<label>`. Uses placeholder text as the only context — placeholder-as-label antipattern on a custom contenteditable.

**`find-in-thread.tsx` lines 117-126:** `<input>` uses placeholder only. No `<label>`.

### Preferences Forms

**`config-schema-item.tsx` lines 79-92:** The `<select>` in the enum branch has NO `id` attribute, but the `<label>` has `htmlFor={this.props.keyPath}`. **Broken label association.** One-line fix that propagates to ALL General/Sending/Reading/Composing preferences.

**`preferences-account-details.tsx` lines 291-296, 298-303, 341-346:**
- Account Label, Sender Name, Account Color inputs have `<h6>` as visual label — not programmatically associated
- `AutoaddressControl` `<select>` has no label; `<input type="text">` has only a placeholder

**`preferences-appearance.tsx` lines 44-51:** Scale slider `<input type="range">` — only `<h6>` as visual label, not associated.

**`language-section.tsx` lines 23-48:** `<select>` for language has no label element.

**`preferences-mail-rules.tsx` lines 169-176:** Account picker `<select>` has no label.

### Signature and Template Editors

**`preferences-signatures.tsx`:**
- Signature title `<input id="title">` — has `id` but no `<label>`; placeholder-as-label
- Raw HTML `<textarea id="body">` — no `<label>`
- DataShape field `<label>` elements are siblings without `htmlFor` — label-to-input association broken

**`signature-photo-picker.tsx` line 222-228:** Photo URL `<input type="url" id="photoURL">` — has `id` but no `<label>`.

**`preferences-templates.tsx` lines 65-72:** Template name `<input id="title">` — has `id` but placeholder-as-label; no `<label>`.

### Contacts Edit Forms

**`ContactDetailEdit.tsx` lines 59-354:** ALL contact fields use `<label>Text</label>` followed by `<input>` as siblings — NOT wrapped and NOT linked with `htmlFor`/`id`. Affects: First Name, Last Name, Nickname, Title, Company, Email, Phone, Relation, Link. Empty `<label></label>` elements used as visual spacers — should be removed.

**`YYMMDDInput.tsx` lines 30, 33-65:** Birthday `<label>` has no `htmlFor`; YYYY/MM/DD sub-inputs are placeholder-only (no individual labels). Needs `<fieldset>`/`<legend>` pattern.

### Calendar Event Form

**`calendar-event-popover.tsx` lines 242-248, 353-358:** Event title and notes use placeholder-as-label; no `<label>` elements.

**`location-video-input.tsx` lines 28-34:** Location input uses placeholder-as-label.

### Switch Component

**`app/src/components/switch.tsx`:** Renders as `<div onClick>` with no `role`, no `aria-checked`, no `tabIndex`, no label API. Cannot be wrapped with `<label>` (it's a div, not an input).

---

## 4. Complete Findings Table

| File | Line(s) | Problem | Fix |
|---|---|---|---|
| `onboarding/page-account-settings.tsx` | 90 | `title="Password"` bare string | `title={localized('Password')}` |
| `onboarding/page-account-settings-imap.tsx` | 131-144 | Duplicate `id` on custom port input | Give input distinct `id`, add sr-only `<label>` |
| `onboarding/page-account-settings-imap.tsx` | 200, 205, 213 | Server/Username/Container titles bare strings | Wrap with `localized()` |
| `composer/composer-header.tsx` | 148-162 | Subject `<input>` placeholder-only | Add sr-only `<label htmlFor="composer-subject">` |
| `src/components/tokenizing-text-field.tsx` | 986 | To/Cc/Bcc label is `<div>`, not `<label>` | Change to `<label htmlFor>` linked to input's new `id` |
| `thread-search/thread-search-bar.tsx` | 358-365 | No `aria-label` on search contenteditable | Add `aria-label={this._placeholder()}` |
| `message-list/find-in-thread.tsx` | 117-126 | Placeholder-only search input | Add `aria-label={localized('Find in thread')}` |
| `preferences/config-schema-item.tsx` | 79-92 | `<select>` has no `id`, label `htmlFor` unmatched | Add `id={this.props.keyPath}` to `<select>` |
| `preferences/preferences-account-details.tsx` | 291-296, 298-303, 341-346 | Inputs labelled only by `<h6>` | Replace `<h6>` with `<label htmlFor>`, add `id` to inputs |
| `preferences/preferences-account-details.tsx` | 29-37, 40-45 | AutoaddressControl `<select>` and `<input>` unlabeled | Add `aria-label` or `<label htmlFor>` |
| `preferences/preferences-appearance.tsx` | 44-51 | Range slider `<input>` labelled only by `<h6>` | Add `aria-label` or `<label htmlFor>` with `id` |
| `preferences/language-section.tsx` | 23-48 | `<select>` for language has no label | Add `<label htmlFor="interface-language">` |
| `preferences/preferences-mail-rules.tsx` | 169-176 | Account picker `<select>` has no label | Add sr-only `<label htmlFor>` |
| `composer-signature/preferences-signatures.tsx` | 108-114 | Signature title placeholder-only, has `id` | Add `<label htmlFor="signature-title">` |
| `composer-signature/preferences-signatures.tsx` | 136-143 | HTML `<textarea id="body">` unlabeled | Add `<label htmlFor="body">` |
| `composer-signature/preferences-signatures.tsx` | 153 | DataShape `<label>` siblings without `htmlFor` | Add `htmlFor={item.key}` to existing labels |
| `composer-signature/signature-photo-picker.tsx` | 222-228 | Photo URL `<input id="photoURL">` unlabeled | Add `<label htmlFor="photoURL">` |
| `composer-templates/preferences-templates.tsx` | 65-72 | Template name placeholder-only, has `id="title"` | Add `<label htmlFor="template-title">`, rename `id` |
| `contacts/ContactDetailEdit.tsx` | 59-354 | All contact fields: sibling `<label>` without `htmlFor` | Convert to implicit wrapping |
| `contacts/YYMMDDInput.tsx` | 30, 33-65 | Birthday label no `htmlFor`; sub-inputs placeholder-only | `<fieldset><legend>Birthday</legend>`, `aria-label` per sub-input |
| `main-calendar/calendar-event-popover.tsx` | 242-248, 353-358 | Event title and notes placeholder-only | Add `aria-label` |
| `main-calendar/location-video-input.tsx` | 28-34 | Location input placeholder-only | Add `aria-label` |
| `src/components/switch.tsx` | 17-28 | No `role`, no `aria-checked`, no keyboard, no label API | Full Switch overhaul (see Phase 12) |

---

## 5. Implementation Phases

### Phase 1: Onboarding (Entry Point — Highest Priority)

**1.1** Fix `localized()` wrapping on bare string literals in `page-account-settings.tsx` and `page-account-settings-imap.tsx`:
```tsx
title={localized('Password')}
title={localized('Server')}
title={localized('Username')}
title={localized('Custom Container Folder')}
```

**1.2** Fix duplicate `id` on custom port input in `page-account-settings-imap.tsx`:
```tsx
{!isStandard && (
  <>
    <label htmlFor={`settings.${field}_custom`} className="sr-only">
      {localized('Custom Port')}
    </label>
    <input
      id={`settings.${field}_custom`}
      // ... rest unchanged
    />
  </>
)}
```

Add `.sr-only` CSS class to `app/static/style/utilities.less` (see Plan 07 for the class definition — can be shared).

### Phase 2: Composer Subject Field

**File:** `app/internal_packages/composer/lib/composer-header.tsx`

```tsx
_renderSubject = () => {
  if (!this.state.enabledFields.includes(Fields.Subject)) return false;
  return (
    <KeyCommandsRegion tabIndex={-1} className="composer-subject subject-field">
      <label htmlFor="composer-subject" className="sr-only">
        {localized('Subject')}
      </label>
      <input
        id="composer-subject"
        type="text"
        name="subject"
        placeholder={localized('Subject')}
        value={this.props.draft.subject}
        onChange={this._onSubjectChange}
      />
    </KeyCommandsRegion>
  );
};
```

### Phase 3: TokenizingTextField Label Association (To/Cc/Bcc)

**File:** `app/src/components/tokenizing-text-field.tsx`

1. Generate stable `id` in constructor: `this._inputId = `tokenizing-field-${Utils.generateTempId()}`;`
2. Change label `<div>` to `<label htmlFor>`:
   ```tsx
   {this.props.label && (
     <label htmlFor={this._inputId} className="tokenizing-field-label">
       {`${this.props.label}:`}
     </label>
   )}
   ```
3. Pass `id` to `SizeToFitInput` which forwards it to the underlying `<input>`:
   ```tsx
   <SizeToFitInput ref="input" id={this._inputId} spellCheck={false} {...props} />
   ```

This single change correctly associates "To:", "Cc:", and "Bcc:" across all uses.

### Phase 4: Search Bars

**`thread-search-bar.tsx`:**
```tsx
<TokenizingContenteditable
  aria-label={this._placeholder()}
  role="searchbox"
  aria-autocomplete="list"
  ...
/>
```

`TokenizingContenteditable` must pass `aria-label` and `role` through to its contenteditable `div`.

**`find-in-thread.tsx`:**
```tsx
<input
  type="text"
  aria-label={localized('Find in thread')}
  placeholder={localized('Find in thread')}
  ...
/>
```

### Phase 5: `config-schema-item.tsx` Select (One-Line Fix)

```tsx
// Before:
<select onChange={this._onChangeValue} value={this.props.config.get(this.props.keyPath)}>
// After:
<select id={this.props.keyPath} onChange={this._onChangeValue} value={this.props.config.get(this.props.keyPath)}>
```

Propagates to ALL General/Sending/Reading/Composing preferences automatically.

### Phase 6: Preferences Account Details

Replace `<h6>` labels with `<label htmlFor>`:
```tsx
<label htmlFor="account-label">{localized('Account Label')}</label>
<input id="account-label" type="text" value={account.label} ... />

<label htmlFor="account-sender-name">{localized('Sender Name')}</label>
<input id="account-sender-name" type="text" value={account.name} ... />

<label htmlFor="account-color">{localized('Account Color')}</label>
<input id="account-color" type="color" value={account.color} ... />
```

For `AutoaddressControl`:
```tsx
<select
  aria-label={localized('Automatically CC or BCC')}
  ...
/>
<label htmlFor="autoaddress-value" className="sr-only">
  {localized('Auto-address recipients')}
</label>
<input id="autoaddress-value" type="text" ... />
```

### Phase 7: Appearance Scale Slider

```tsx
<label htmlFor="interface-zoom-slider" className="sr-only">
  {localized('Interface Scale')}
</label>
<input
  id="interface-zoom-slider"
  type="range"
  aria-label={localized('Interface Scale')}
  min={0.8} max={1.4} step={0.05}
  ...
/>
```

### Phase 8: Language and Mail Rules Selects

```tsx
// language-section.tsx
<label htmlFor="interface-language">{localized('Interface Language')}</label>
<select id="interface-language" onChange={onChangeValue} value={configValue}>

// preferences-mail-rules.tsx
<label htmlFor="mail-rules-account" className="sr-only">{localized('Account')}</label>
<select id="mail-rules-account" value={this.state.currentAccount.id} onChange={...}>
```

### Phase 9: Signature and Template Name Fields

```tsx
// preferences-signatures.tsx
// Change id="title" to "signature-title" to prevent conflicts if both are mounted
<label htmlFor="signature-title" className="sr-only">{localized('Signature Name')}</label>
<input type="text" id="signature-title" placeholder={localized('Name')} ... />

<label htmlFor="signature-body" className="sr-only">{localized('Signature HTML')}</label>
<textarea id="signature-body" ... />

// DataShape field labels — add htmlFor:
<label htmlFor={item.key}>{item.label}</label>
<input id={item.key} type="text" ... />

// preferences-templates.tsx
<label htmlFor="template-title" className="sr-only">{localized('Template Name')}</label>
<input type="text" id="template-title" placeholder={localized('Name')} ... />
```

### Phase 10: Calendar Event Form

```tsx
// calendar-event-popover.tsx
<input
  className="title"
  type="text"
  aria-label={localized('Event title')}
  placeholder={localized('New Event')}
  ...
/>

<textarea
  aria-label={localized('Notes')}
  placeholder={localized('Add notes or URL...')}
  ...
/>

// location-video-input.tsx
<input
  type="text"
  aria-label={localized('Location or Video Call')}
  placeholder={localized('Add Location or Video Call')}
  ...
/>
```

### Phase 11: Contacts Detail Edit Forms

Use implicit label wrapping (simpler; contacts page shows one contact at a time):
```tsx
// Before:
<label>First Name</label>
<input type="text" value={data.name.givenName} onChange={...} />

// After:
<label>
  {localized('First Name')}
  <input type="text" value={data.name.givenName} onChange={...} />
</label>
```

Apply to: First Name, Last Name, Nickname, Title, Company, Email, Phone, Relation, Link.

Remove empty `<label></label>` spacers — replace with `<span aria-hidden="true"></span>` or adjust layout via CSS.

**`YYMMDDInput.tsx`:**
```tsx
<fieldset>
  <legend>{localized('Birthday')}</legend>
  <div style={{ display: 'flex' }}>
    <input ref={this._year} type="number" aria-label={localized('Year')} placeholder="YYYY" ... />
    <input ref={this._month} type="number" aria-label={localized('Month')} placeholder="MM" ... />
    <input ref={this._day} type="number" aria-label={localized('Day')} placeholder="DD" ... />
  </div>
</fieldset>
```

### Phase 12: Switch Component Overhaul

**File:** `app/src/components/switch.tsx`

Extend `SwitchProps` with `label?: string` and `labelledBy?: string`. Convert from `<div>` click-only to fully accessible toggle:

```typescript
type SwitchProps = {
  checked?: boolean;
  onChange: (...args: any[]) => any;
  className?: string;
  label?: string;
  labelledBy?: string;
};

const Switch: React.SFC<SwitchProps> = props => {
  let classnames = `${props.className || ''} slide-switch`;
  if (props.checked) classnames += ' active';

  return (
    <div
      className={classnames}
      role="switch"
      aria-checked={props.checked}
      tabIndex={0}
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      onClick={props.onChange}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          props.onChange(e);
        }
      }}
    >
      <div className="handle" />
    </div>
  );
};
```

Update call sites to pass `label` prop. Example in `all-day-toggle.tsx`:
```tsx
<Switch checked={checked} label={localized('All day event')} onChange={() => onChange(!checked)} />
```

### Phase 13: Re-enable ESLint Rule

**File:** `/home/user/Mailspring/.eslintrc`

```json
// Remove:
"jsx-a11y/label-has-for": 0,

// Add:
"jsx-a11y/label-has-associated-control": ["error", {
  "labelComponents": [],
  "labelAttributes": [],
  "controlComponents": [],
  "assert": "either",
  "depth": 3
}],
```

`"assert": "either"` accepts both explicit `htmlFor`+`id` and implicit wrapping. Depth 3 handles cases where `<input>` is a few levels deep inside the label.

---

## 6. Guidance on `localized()` for Label Text

All user-visible label strings must use `localized()`:

```tsx
// ✅ Correct
<label htmlFor="foo">{localized('Email Address')}</label>
<input aria-label={localized('Search all mailboxes')} />
localized('Search %@', account.label)  // interpolation

// ❌ Wrong
<label htmlFor="foo">Email Address</label>
<label>{'(' + localized('Optional') + ')'}</label>  // don't concatenate around localized()
```

---

## 7. Priority Order

1. **Onboarding** — Entry point; new users must set up accounts
2. **Composer subject** — Used constantly; every email composition
3. **TokenizingTextField** — Fixes To/Cc/Bcc for all users
4. **`config-schema-item.tsx` select** — One-line fix; auto-fixes all of General/Sending/Reading preferences
5. **Preferences account details** — Frequently visited settings
6. **Signature editor** — Frequently used; many inputs
7. **Search bars** — `aria-label` only; low risk
8. **Calendar event form** — `aria-label` only
9. **Language/Mail Rules selects** — Simple label additions
10. **Template name field** — Simple sr-only label
11. **Contacts edit forms** — High volume of changes; lower frequency of use
12. **Switch component** — Requires design coordination; affects keyboard behavior
13. **ESLint rule re-enable** — Final verification step

---

## Critical Files

- `app/src/components/tokenizing-text-field.tsx` — Core shared component for To/Cc/Bcc; fixing label association here fixes all composer participant fields
- `app/internal_packages/preferences/lib/tabs/config-schema-item.tsx` — Core preferences renderer; adding `id` to `<select>` fixes all boolean toggles and enum dropdowns across all preference tabs
- `app/internal_packages/composer/lib/composer-header.tsx` — Unlabeled Subject input; demonstrates the sr-only label pattern for all other form fields
- `app/internal_packages/contacts/lib/ContactDetailEdit.tsx` — Largest volume of label association gaps; implicit wrap approach resolves all contact fields
- `/home/user/Mailspring/.eslintrc` — Re-enable `jsx-a11y/label-has-associated-control` (replacing disabled `jsx-a11y/label-has-for`); becomes regression guard for future unlabeled inputs
