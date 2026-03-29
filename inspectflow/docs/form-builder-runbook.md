# Form Builder Runbook (BL-121 / OPS-FORMBUILDER-v1)

## Overview

The no-code inspection form builder lets Admins design custom inspection forms,
publish them for use by Operators, and review submitted responses — all without
writing code or modifying the DB schema.

**Contract ID:** `OPS-FORMBUILDER-v1`
**API prefix:** `/api/form-builder`
**Frontend:** Admin → Form Builder (sidebar nav)

---

## Admin Workflow

### 1. Create a form

1. Navigate to **Admin → Form Builder**.
2. Click **+ New Form**.
3. In the Builder canvas, enter a form **Name** (required) and optional Description.
4. Click field type buttons in the left palette to add fields.
5. Click any field row to open the **Property Panel** (right side):
   - Set the **Label** and optionally toggle **Required**.
   - For `number` fields: set Min / Max / Step.
   - For `select` / `radio` / `multi_select` fields: add option values.
   - For `section_header` / `instruction_block`: add Content text.
6. Drag field rows to reorder them (grip handle on left).
7. Click **Save Draft** to persist.

### 2. Publish a form

A form must be in `draft` status and contain **at least one input field** (non-layout field).
Layout-only forms (`section_header` / `instruction_block` only) cannot be published.

1. Save the draft first (step 1 above).
2. Click **Publish** in the canvas toolbar.
3. The form status changes to `published` and is available for submission.

> **Note:** Published forms are immutable — editing is blocked. If changes are needed,
> archive the old form and create a new draft.

### 3. Preview a form

1. From the Form Templates list, click **Preview** next to any form.
2. The preview renders the live field layout in read-only mode.
3. Click **← Back** to return to the template list.

### 4. Archive a form

1. From the Form Templates list, click **Archive** next to any form.
2. Confirm the dialog.
3. The form status changes to `archived`. Archived forms cannot receive new submissions
   and cannot be re-published (create a new draft instead).

---

## Operator Workflow (Submission)

Operators (and all authenticated roles) can submit published forms via the API.
A direct submission UI can be embedded anywhere by passing a `form_template_id` and
calling `POST /api/form-builder/forms/:id/submissions`.

From the current UI, Admins can also view submissions for any form:
1. From the Form Templates list, click **Submissions** next to any form.
2. Browse the paginated list; click **View** to see full response detail.

---

## API Reference

| Verb | Path | Role | Purpose |
|------|------|------|---------|
| GET | `/api/form-builder/contracts` | Admin | Field type catalog |
| GET | `/api/form-builder/forms` | Admin | List templates (`?status=draft\|published\|archived`) |
| POST | `/api/form-builder/forms` | Admin | Create draft |
| GET | `/api/form-builder/forms/:id` | Admin | Get single template |
| PUT | `/api/form-builder/forms/:id` | Admin | Update draft (blocked if published/archived) |
| POST | `/api/form-builder/forms/:id/publish` | Admin | Publish draft |
| POST | `/api/form-builder/forms/:id/archive` | Admin | Archive form |
| GET | `/api/form-builder/forms/:id/preview` | Admin | Preview descriptor |
| GET | `/api/form-builder/forms/:id/submissions` | Admin | List submissions (paginated) |
| POST | `/api/form-builder/forms/:id/submissions` | Any authenticated | Submit filled form |
| GET | `/api/form-builder/submissions/:id` | Admin | Get single submission |
| GET | `/api/form-builder/forms/:id/audit` | Admin | Audit log for a form |

### Submission payload

```json
POST /api/form-builder/forms/:id/submissions
{
  "data": {
    "field_id_1": "value",
    "field_id_2": 12.34,
    "field_id_3": ["optionA", "optionB"]
  },
  "jobId": "JOB-001"   // optional
}
```

`data` is a flat object keyed by `field.id` (the stable ID assigned in the builder).
Required field validation is enforced server-side; missing required fields return `422 invalid_submission_data`.

---

## Field Types

| Type | Description | Config keys |
|------|-------------|-------------|
| `text` | Single-line text | `placeholder` |
| `number` | Numeric input | `placeholder`, `min`, `max`, `step` |
| `textarea` | Multi-line text | `placeholder` |
| `select` | Dropdown | `options[]` |
| `multi_select` | Checkboxes (multiple) | `options[]` |
| `radio` | Radio buttons | `options[]` |
| `checkbox` | Single checkbox | — |
| `date` | Date picker | — |
| `datetime` | Date + time picker | — |
| `signature` | Typed signature | — |
| `file_upload` | File input | `accept` (e.g. `image/*,.pdf`) |
| `section_header` | Layout divider | `content` (subtitle) |
| `instruction_block` | Read-only text block | `content` |

`section_header` and `instruction_block` are layout types:
- Not counted as input fields (no Required toggle, not included in submission `data`)
- Do not block form publish on their own

---

## Lifecycle State Machine

```
draft ──publish──▶ published
  │                    │
  └──archive──▶ archived ◀──archive──┘
```

- Only `draft` → `published` is allowed via publish endpoint.
- Any non-archived form can be archived.
- Archived forms are permanent (create a new draft to replace).
- `PUT` (update) is only allowed on `draft` forms.

---

## Audit Trail

Every lifecycle event is written to `inspection_form_audit_log`:

| Action | Triggered by |
|--------|-------------|
| `created` | `POST /forms` |
| `updated` | `PUT /forms/:id` |
| `published` | `POST /forms/:id/publish` |
| `archived` | `POST /forms/:id/archive` |
| `submission_created` | `POST /forms/:id/submissions` |

Retrieve via `GET /api/form-builder/forms/:id/audit?limit=50`.

---

## Troubleshooting

### `form_not_editable` (409) on update or publish
The form is already `published` or `archived`. Only `draft` forms can be edited or published.
Archive the existing form and create a new draft if you need changes.

### `form_has_no_fields` (422) on publish
The schema contains only layout fields (`section_header` / `instruction_block`) or is empty.
Add at least one input field (text, number, checkbox, etc.) before publishing.

### `invalid_form_schema` (400) on create/update
One or more fields in the `schema` array is invalid. Common causes:
- Missing or duplicate `id` values
- Empty `label`
- Unknown `type` (check the `/contracts` endpoint for valid types)

### `duplicate_form_name` (409)
A form with the same name already exists for this site. Choose a unique name, or archive
the existing form first.

### `form_not_published` (422) on submission
The target form is not in `published` status. Operators cannot submit to `draft` or `archived` forms.

### `invalid_submission_data` (422) on submission
One or more required fields were missing or empty in the `data` payload.
Check the form schema's `required: true` fields and ensure all have non-empty values.

---

## DB Tables

| Table | Purpose |
|-------|---------|
| `inspection_form_templates` | Form definitions (schema JSONB, lifecycle status) |
| `inspection_form_submissions` | One row per submitted form response |
| `inspection_form_audit_log` | Immutable audit events for each form template |
