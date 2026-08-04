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
