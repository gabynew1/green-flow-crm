-- Backfill contract_line_item_id on service_order_items created from a contract
-- but saved without the link (e.g. via the Create Visit dialog).
WITH candidates AS (
  SELECT
    soi.id AS soi_id,
    cli.id AS cli_id,
    ROW_NUMBER() OVER (
      PARTITION BY soi.id
      ORDER BY
        CASE WHEN cli.custom_name IS NOT NULL AND cli.custom_name = soi.name THEN 0 ELSE 1 END,
        cli.created_at
    ) AS rn
  FROM public.service_order_items soi
  JOIN public.service_orders so ON so.id = soi.service_order_id
  JOIN public.contract_line_items cli
    ON cli.contract_id = so.contract_id
   AND cli.service_catalog_id = soi.service_catalog_id
   AND cli.tenant_id = soi.tenant_id
  WHERE soi.contract_line_item_id IS NULL
    AND so.contract_id IS NOT NULL
    AND soi.service_catalog_id IS NOT NULL
    AND COALESCE(cli.custom_name, '') NOT LIKE 'Flat fee%'
)
UPDATE public.service_order_items soi
SET contract_line_item_id = c.cli_id,
    source = 'CONTRACT',
    updated_at = now()
FROM candidates c
WHERE c.rn = 1
  AND soi.id = c.soi_id;