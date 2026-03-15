-- Delete referencing rows that point to old services
DELETE FROM contract_line_items
WHERE service_catalog_id IN (
  SELECT id FROM service_catalog WHERE code NOT IN (
    'Design & Consulting', 'Garden Landscaping & Green Spaces', 'Regular Maintenance', 'Irrigation System Maintenance', 'Special & Seasonal Services'
  )
);

UPDATE offer_line_items SET service_catalog_id = NULL
WHERE service_catalog_id IN (
  SELECT id FROM service_catalog WHERE code NOT IN (
    'Design & Consulting', 'Garden Landscaping & Green Spaces', 'Regular Maintenance', 'Irrigation System Maintenance', 'Special & Seasonal Services'
  )
);

UPDATE service_order_items SET service_catalog_id = NULL
WHERE service_catalog_id IN (
  SELECT id FROM service_catalog WHERE code NOT IN (
    'Design & Consulting', 'Garden Landscaping & Green Spaces', 'Regular Maintenance', 'Irrigation System Maintenance', 'Special & Seasonal Services'
  )
);

-- Now delete old services
DELETE FROM service_catalog 
WHERE code NOT IN (
  'Design & Consulting', 'Garden Landscaping & Green Spaces', 'Regular Maintenance', 'Irrigation System Maintenance', 'Special & Seasonal Services'
);