# Shorten audit log sentences

Long entries like:

```text
Gabriel Sidor changed plan from Territory Trial to Territory Trial and changed status from Trial Active to Trial Active and granted 30 extra days for Tenant "Serene Garden" — reason: trial_extended.
```

become:

```text
Gabriel Sidor granted 30 extra days to "Serene Garden".
```

Short system entries ("System performed email log purge for Email Send Log.") stay exactly as they are.

## Rules to apply in `describe()` (src/pages/admin/AuditCompliance.tsx)

1. Skip no-op transitions: only mention plan/status change when the from and to values actually differ. Same-value pairs are dropped entirely.
2. When only one side exists, phrase it compactly: "set plan to Territory Trial", "set status to Trial Active".
3. Prefer the strongest single fact: if extra days were granted, that becomes the main verb and the same-value plan/status noise is gone.
4. Drop the reason when it just repeats the sentence (e.g. reason "trial_extended" alongside "granted 30 extra days") or repeats the action label. Keep genuinely new reasons such as "Admin Extension" or free-text notes.
5. Use "to <target>" for tenant-directed actions instead of "for Tenant "X"" — target name only, keeping the "Tenant" type visible in the Details drawer.
6. Cap at two clauses joined by "and"; anything beyond stays available under the existing Details toggle.

All removed detail (raw tier/status transitions, metadata JSON, reason, IDs) remains visible in the per-row Details panel — no data is lost.

## Coverage for future / unknown log types

The rules above only cover the fields we know (tier, status, days, reason). To make it hold for any log written later:

1. Generic fallback stays the default: any action with no recognised fields renders as "<who> <humanised action> <target>." — this is what already produces the good "System performed email log purge for Email Send Log." line, so new action types degrade gracefully instead of showing raw enum text.
2. Action label humanising is data-driven: snake/upper case is converted to words automatically, so a brand-new action like `TENANT_DATA_EXPORTED` reads as "exported tenant data" style text without a code change.
3. Metadata is handled generically: known keys (days, reason, amount, count, email, plan) get short phrasings; unknown keys are not forced into the sentence — they show up in the Details panel only. This prevents future metadata from re-creating the long-sentence problem.
4. Hard length guard: the sentence is capped at two clauses; if more facts exist, it ends with a short "+N more details" hint pointing at the Details toggle.
5. No silent loss: every field, known or not, is always rendered in the Details drawer, so the summary line can stay short forever.

Known limit: a new action whose meaning depends on custom metadata (for example a refund amount) will read correctly but generically ("… performed refund issued …") until a one-line phrasing entry is added for it. That is a small, additive change per new action type, not a rewrite.
