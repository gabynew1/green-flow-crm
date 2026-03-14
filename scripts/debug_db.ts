import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Ensure we load the .env from the project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env file')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugData() {
    console.log('--- Database Debug ---')
    console.log('Connecting to:', supabaseUrl)

    const { data: pros, error: pErr } = await supabase.from('profiles').select('id, full_name, tenant_id')
    if (pErr) console.error('Profiles Error:', pErr.message)
    else console.log('PROFILES:', JSON.stringify(pros))

    const { data: tens, error: tErr } = await supabase.from('tenants').select('id, name')
    if (tErr) console.error('Tenants Error:', tErr.message)
    else console.log('TENANTS:', JSON.stringify(tens))

    const { data: catalog, error: cErr } = await supabase.from('service_catalog').select('code, name').limit(5)
    if (cErr) console.error('Catalog Error:', cErr.message)
    else console.log('CATALOG_SAMPLE:', JSON.stringify(catalog))
}

debugData()
