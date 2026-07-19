
CREATE UNIQUE INDEX IF NOT EXISTS service_orders_contract_date_team_unique
ON public.service_orders (contract_id, scheduled_date, team_id)
WHERE contract_id IS NOT NULL
  AND scheduled_date IS NOT NULL
  AND team_id IS NOT NULL
  AND status <> 'CANCELED';
