import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    try {
        console.log('--- DB UPDATE START ---');
        console.log('Supabase URL:', supabaseUrl);

        console.log('1. Checking for existing tenants...');
        const { data: tenants, error: tErr } = await supabase.from('tenants').select('id').limit(1);
        if (tErr) throw new Error('Tenant fetch error: ' + JSON.stringify(tErr));

        let tenantId: string | null = null;
        if (!tenants || tenants.length === 0) {
            console.log('2. No tenants found. Attempting to create default tenant...');
            const { data: newTenant, error: cErr } = await supabase
                .from('tenants')
                .insert({ name: 'Green Flow Default' })
                .select('id')
                .single();

            if (cErr) {
                console.warn('Tenant creation failed (likely RLS):', JSON.stringify(cErr));
                console.log('Proceeding with null tenant...');
            } else {
                tenantId = newTenant.id;
                console.log('Tenant created successfully:', tenantId);
            }
        } else {
            tenantId = tenants[0].id;
            console.log('Found existing tenant:', tenantId);
        }

        const CATALOG_DATA = [
            { id: "DSN-001", name: "2D/3D Garden Design", description: "Realistic renderings and spatial planning to visualize the garden before execution.", category: "Design & Consultancy" },
            { id: "DSN-002", name: "Plant & Material Consulting", description: "Expert advice on selecting flora and materials adapted to local soil and climate.", category: "Design & Consultancy" },
            { id: "LAN-001", name: "Sod Installation (Rolls)", description: "Immediate high-quality turf installation for an instant green lawn.", category: "Landscaping & Installation" },
            // ... (truncating for brevity in script, adding all in final pass)
        ];

        // Full data from user request
        const fullData = [
            { code: "DSN-001", name: "2D/3D Garden Design", description: "Realistic renderings and spatial planning to visualize the garden before execution." },
            { code: "DSN-002", name: "Plant & Material Consulting", description: "Expert advice on selecting flora and materials adapted to local soil and climate." },
            { code: "DSN-003", name: "Spatial Optimization", description: "Planning for functional zones, flow, and aesthetic balance in green spaces." },
            { code: "DSN-999", name: "Other Design Service", description: "Custom design or consulting service tailored to specific client needs." },
            { code: "LAN-001", name: "Sod Installation (Rolls)", description: "Immediate high-quality turf installation for an instant green lawn." },
            { code: "LAN-002", name: "Lawn Seeding", description: "Cost-effective solution for establishing a healthy, organic lawn from scratch." },
            { code: "LAN-003", name: "Tree & Shrub Planting", description: "Professional planting of ornamental trees, hedges, and flower beds." },
            { code: "LAN-004", name: "Decorative Mulching", description: "Application of bark, gravel, or stone for moisture retention and weed prevention." },
            { code: "LAN-005", name: "Garden Furniture & Elements", description: "Installation of decorative planters, benches, and outdoor structures." },
            { code: "LAN-999", name: "Other Installation Service", description: "Custom planting or landscaping work not listed in the standard catalog." },
            { code: "HRD-001", name: "Smart Garden Lighting", description: "Installation of low-voltage LED systems, ambient spotlights, and path lighting." },
            { code: "HRD-002", name: "Walkways & Decorative Edging", description: "Installation of natural stone paths, pavers, and garden borders." },
            { code: "HRD-003", name: "Retaining Walls", description: "Construction of stone or timber walls for erosion control and tiered levels." },
            { code: "HRD-004", name: "Waterstones & Fountains", description: "Installation of recirculating water features, bubbling stones, and decorative ponds." },
            { code: "HRD-999", name: "Other Hardscape/Lighting", description: "Custom stone, light, or water feature construction as per technical requirements." },
            { code: "IRR-001", name: "Automatic Irrigation Systems", description: "Design, assembly, and calibration of smart sprinkler and drip systems." },
            { code: "IRR-002", name: "French Drain Installation", description: "Subsurface drainage solutions to manage yard runoff and prevent foundation dampness." },
            { code: "IRR-003", name: "Irrigation System Winterization", description: "Seasonal air-purging of pipes to prevent freeze damage." },
            { code: "IRR-004", name: "System Repairs & Tuning", description: "Cleaning nozzles, replacing filters, and adjusting spray patterns." },
            { code: "IRR-999", name: "Other Water Management", description: "Custom irrigation or drainage solutions for complex terrain." },
            { code: "MNT-001", name: "Precision Mowing & Edging", description: "Regular lawn cutting and vertical edging for a manicured look." },
            { code: "MNT-002", name: "Lawn Scarification & Aeration", description: "Removing thatch and perforating soil to improve root oxygenation." },
            { code: "MNT-003", name: "Hedge & Topiary Trimming", description: "Aesthetic shaping of shrubs and artistic pruning of decorative plants." },
            { code: "MNT-004", name: "Phytosanitary Treatments", "description": "Application of treatments against diseases and pests to protect plant health." },
            { code: "MNT-005", "name": "Fertilization Program", "description": "Root and foliar nutrient application for density and vibrant color." },
            { code: "MNT-999", "name": "Other Maintenance Task", "description": "Specific recurring care task tailored to a unique property feature." },
            { code: "SPC-001", "name": "General Leaf & Debris Removal", "description": "Seasonal cleanup of organic waste to maintain property tidiness." },
            { code: "SPC-002", "name": "Pressure Washing (Paviers)", "description": "High-pressure water cleaning of walkways and stone surfaces." },
            { code: "SPC-003", "name": "Winter Protection", "description": "Wrapping and insulating sensitive plants against frost and snow." },
            { code: "SPC-004", "name": "Land Clearing & Deforestation", "description": "Removal of wild vegetation and brush from neglected plots." },
            { code: "SPC-999", "name": "Other Cleanup/Special Service", "description": "One-time specialized task or restoration service not listed elsewhere." }
        ];

        const itemsToInsert = fullData.map(d => ({
            ...d,
            tenant_id: tenantId,
            is_active: true
        }));

        console.log(`3. Inserting ${itemsToInsert.length} services...`);
        const { error: insErr } = await supabase.from('service_catalog').insert(itemsToInsert);
        if (insErr) {
            console.error('Service insert failed:', JSON.stringify(insErr));
        } else {
            console.log('--- DB UPDATE COMPLETE ---');
        }

    } catch (err) {
        console.error('FATAL ERROR:', err);
        process.exit(1);
    }
}

run();
