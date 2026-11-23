---
paths:
  - "src/components/shop/**"
  - "**/*stripe*"
  - "**/*purchase*"
---

# Payments (Stripe)

- Stripe webhooks are the source of truth: a purchased pack is credited only after Stripe confirms the payment. Verify the signature on every call, and make processing idempotent (the same event received twice credits once).
- Before checkout, the server checks age, verified e-mail, and the calendar-month spending cap (purchases plus subscription).
- The waiver of the right of withdrawal is a mandatory checkbox; its text version and the click time are stored on the `purchases` row.
- Single-pack sales sit behind a database feature flag: turning it off removes them from the shop with no redeploy and no gap in the layout.
- Cancelling the subscription takes at most 3 clicks from `/account`; perks last until the end of the paid period.
- Refunds go through the back-office, revoke the perks and write to `audit_log`.
