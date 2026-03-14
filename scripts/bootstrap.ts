import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import readline from 'readline'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

async function bootstrap() {
    console.log('--- Green Flow CRM Bootstrap ---')

    const email = await new Promise<string>(resolve => {
        rl.question('Enter the email address you signed up with: ', resolve)
    })

    // 1. Ensure Tenant exists
    let { data: tenant } = await supabase.from('tenants').select('id').limit(1).single()
    if (!tenant) {
        console.log('Creating default tenant...');
        const { data: newTenant, error: tErr } = await supabase
            .from('tenants')
            .insert({ name: 'Green Flow Demo' })
            .select('id')
            .single()
        if (tErr) {
            console.error('Error creating tenant:', tErr.message)
            process.exit(1)
        }
        tenant = newTenant
    }
    const tenantId = tenant.id
    console.log('Using Tenant ID:', tenantId)

    // 2. Find User ID by email in auth.users (requires service role usually, but we can check profiles if they actually signed up)
    console.log(`Looking for profile with email: ${email}...`)
    let { data: profile } = await supabase.from('profiles').select('id, user_id').eq('email', email).single()

    if (!profile) {
        console.error(`Error: No profile found for email ${email}.`)
        console.log('Make sure you have: ')
        console.log('1. Applied the migrations (including handle_new_user trigger)')
        console.log('2. Signed up on the /auth page locally')
        console.log('3. Confirmed your email if required by your Supabase settings')
        process.exit(1)
    }

    // 3. Assign Tenant and elevate role
    console.log('Assigning tenant to profile...')
    const { error: pUpdateErr } = await supabase
        .from('profiles')
        .update({ tenant_id: tenantId })
        .eq('id', profile.id)

    if (pUpdateErr) console.error('Profile update error:', pUpdateErr.message)

    console.log('Assigning PROVIDER_ADMIN role...')
    const { error: rErr } = await supabase
        .from('user_roles')
        .upsert({ user_id: profile.user_id, role: 'PROVIDER_ADMIN' }, { onConflict: 'user_id,role' })

    if (rErr) console.error('Role assignment error:', rErr.message)
    else console.log('Successfully elevated user to PROVIDER_ADMIN!')

    console.log('Bootstrap complete! Try refreshing the page now.')
    process.exit(0)
}

bootstrap()
