## Confirmed diagnosis

**A. Roll-forward on failure (real bug).** In `fn_generate_due_cycle_invoices()` the `BEGIN … EXCEPTION WHEN OTHERS` block wraps only the `PERFORM public.fn_ensure_cycle_invoice(...)` call. The period-bounds lookup and `UPDATE contracts SET next_invoice_date = v_pe` run afterwards unconditionally, so a contract whose invoice generation fails still advances its `next_invoice_date` — that billing period is skipped permanently and the nightly cron never retries it.

**B. Included-in-base-fee lines (partly fixed, still loose).** `fn_ensure_cycle_invoice()` filters with `is_included_in_base_fee = false OR unit_price <> 0`. A line flagged as covered by the base fee but carrying a price is therefore billed on top of the flat fee — double-billing, and inconsistent with `fn_generate_invoice_for_project`, which excludes all included lines. Verified against live data: no contract line currently has `is_included_in_base_fee = true` with a non-zero price, and every `Flat fee — …` line is `is_included_in_base_fee = false`, so tightening the filter cannot drop the flat fee. `fn_generate_invoice_for_contract_cycle` carries the same loose filter and should be aligned.

## Migration (single migration, function replacements only)

1. **`fn_generate_due_cycle_invoices()`** — move the period-bounds lookup and the `next_invoice_date` update *inside* the success path of the per-contract block:
   - On success: compute the next period end and update `next_invoice_date`, increment the counter.
   - On exception: `RAISE WARNING` as today, plus insert a row into `activity_log` (`property_id` and `tenant_id` from the contract, `event_type = 'invoice_generation_failed'`, description containing the contract id and `SQLERRM`, `related_entity_type = 'contract'`, `related_entity_id = contract id`) and leave `next_invoice_date` untouched so the next nightly run retries.
   - Wrap the activity_log insert in its own nested exception guard so a logging failure can never abort the whole cron loop.

2. **`fn_ensure_cycle_invoice()`** — change the line filter to `AND COALESCE(cli.is_included_in_base_fee, false) = false`, matching `fn_generate_invoice_for_project`.

3. **`fn_generate_invoice_for_contract_cycle()`** — apply the same strict filter so all three generators behave identically.

All three keep `SECURITY DEFINER` and `SET search_path = public`.

## Notes / risks
- No schema, grant, or RLS changes; no data backfill. Existing invoices are untouched.
- Change 2 is a behaviour no-op on today's data (0 affected rows) but prevents future double-billing.
- A persistently failing contract will now retry every night and log a row per attempt; the `activity_log` entries make that visible rather than silent.
- Front-end already filters zero-total lines for display, so no UI change is needed.
