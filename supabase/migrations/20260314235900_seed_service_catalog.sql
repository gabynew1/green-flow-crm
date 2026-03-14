
-- Seed specialized landscaping and design services into the service catalog
-- These will be available globally (tenant_id IS NULL) so all tenants can use them.

INSERT INTO public.service_catalog (code, name, description, is_active)
VALUES
  ('DSN-001', '2D/3D Garden Design', 'Realistic renderings and spatial planning to visualize the garden before execution.', true),
  ('DSN-002', 'Plant & Material Consulting', 'Expert advice on selecting flora and materials adapted to local soil and climate.', true),
  ('DSN-003', 'Spatial Optimization', 'Planning for functional zones, flow, and aesthetic balance in green spaces.', true),
  ('DSN-999', 'Other Design Service', 'Custom design or consulting service tailored to specific client needs.', true),
  ('LAN-001', 'Sod Installation (Rolls)', 'Immediate high-quality turf installation for an instant green lawn.', true),
  ('LAN-002', 'Lawn Seeding', 'Cost-effective solution for establishing a healthy, organic lawn from scratch.', true),
  ('LAN-003', 'Tree & Shrub Planting', 'Professional planting of ornamental trees, hedges, and flower beds.', true),
  ('LAN-004', 'Decorative Mulching', 'Application of bark, gravel, or stone for moisture retention and weed prevention.', true),
  ('LAN-005', 'Garden Furniture & Elements', 'Installation of decorative planters, benches, and outdoor structures.', true),
  ('LAN-999', 'Other Installation Service', 'Custom planting or landscaping work not listed in the standard catalog.', true),
  ('HRD-001', 'Smart Garden Lighting', 'Installation of low-voltage LED systems, ambient spotlights, and path lighting.', true),
  ('HRD-002', 'Walkways & Decorative Edging', 'Installation of natural stone paths, pavers, and garden borders.', true),
  ('HRD-003', 'Retaining Walls', 'Construction of stone or timber walls for erosion control and tiered levels.', true),
  ('HRD-004', 'Waterstones & Fountains', 'Installation of recirculating water features, bubbling stones, and decorative ponds.', true),
  ('HRD-999', 'Other Hardscape/Lighting', 'Custom stone, light, or water feature construction as per technical requirements.', true),
  ('IRR-001', 'Automatic Irrigation Systems', 'Design, assembly, and calibration of smart sprinkler and drip systems.', true),
  ('IRR-002', 'French Drain Installation', 'Subsurface drainage solutions to manage yard runoff and prevent foundation dampness.', true),
  ('IRR-003', 'Irrigation System Winterization', 'Seasonal air-purging of pipes to prevent freeze damage.', true),
  ('IRR-004', 'System Repairs & Tuning', 'Cleaning nozzles, replacing filters, and adjusting spray patterns.', true),
  ('IRR-999', 'Other Water Management', 'Custom irrigation or drainage solutions for complex terrain.', true),
  ('MNT-001', 'Precision Mowing & Edging', 'Regular lawn cutting and vertical edging for a manicured look.', true),
  ('MNT-002', 'Lawn Scarification & Aeration', 'Removing thatch and perforating soil to improve root oxygenation.', true),
  ('MNT-003', 'Hedge & Topiary Trimming', 'Aesthetic shaping of shrubs and artistic pruning of decorative plants.', true),
  ('MNT-004', 'Phytosanitary Treatments', 'Application of treatments against diseases and pests to protect plant health.', true),
  ('MNT-005', 'Fertilization Program', 'Root and foliar nutrient application for density and vibrant color.', true),
  ('MNT-999', 'Other Maintenance Task', 'Specific recurring care task tailored to a unique property feature.', true),
  ('SPC-001', 'General Leaf & Debris Removal', 'Seasonal cleanup of organic waste to maintain property tidiness.', true),
  ('SPC-002', 'Pressure Washing (Paviers)', 'High-pressure water cleaning of walkways and stone surfaces.', true),
  ('SPC-003', 'Winter Protection', 'Wrapping and insulating sensitive plants against frost and snow.', true),
  ('SPC-004', 'Land Clearing & Deforestation', 'Removal of wild vegetation and brush from neglected plots.', true),
  ('SPC-999', 'Other Cleanup/Special Service', 'One-time specialized task or restoration service not listed elsewhere.', true)
ON CONFLICT (code, tenant_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;
