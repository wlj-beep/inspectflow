# External Portal Runbook (BL-122)

Interface contract: `COMM-PORTAL-v1`

## Purpose
Provide invitation-based external access for:
- Suppliers: incoming inspection visibility + CAPA response submission.
- Customers: CoC/PPAP/PSW document views and downloads.

## API Surface

### Admin (internal session required)
- `POST /api/portal/invitations`
- `GET /api/portal/invitations`
- `POST /api/portal/invitations/:id/revoke`
- `POST /api/portal/invitations/:id/document-access`

### External portal auth
- `POST /api/portal/auth/redeem` (returns bearer session token)
- `GET /api/portal/me`
- `POST /api/portal/auth/logout`

### Supplier portal
- `GET /api/portal/supplier/incoming-inspections`
- `GET /api/portal/supplier/capa`
- `POST /api/portal/supplier/capa/:id/respond`

### Customer portal
- `GET /api/portal/customer/documents`
- `GET /api/portal/customer/documents/:type/:id/download`

## Security and Access Model
- Invitation tokens are stored hashed (`portal_invitations.invite_token_hash`).
- External bearer session tokens are stored hashed (`portal_sessions.session_token_hash`).
- Supplier access is constrained by `supplier_id` on invitation.
- Customer access is constrained by either:
  - explicit whitelist in `portal_document_access`, or
  - fallback `customer_name` match on CoC/PPAP rows.

## Data Tables
- `portal_invitations`
- `portal_sessions`
- `portal_capa_responses`
- `portal_document_access`

## Validation
- Focused suite: `backend/test/portal-workflow.test.js`
