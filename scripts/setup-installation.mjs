import { createClient } from '@supabase/supabase-js';
const mode = process.argv[2];
if (!['initialize', 'configure-auth'].includes(mode)) {
  console.error('Usage: node --env-file=.env.local scripts/setup-installation.mjs initialize|configure-auth');
  process.exit(1);
}
const required = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY','FIREBASE_ADMIN_PROJECT_ID'];
if (mode === 'initialize') required.push('VERS_INITIAL_MASTER_EMAIL','VERS_INITIAL_CAMPAIGN_NAME');
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) { console.error(`Missing configuration: ${missing.join(', ')}`); process.exit(1); }
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await client.rpc(mode === 'initialize' ? 'initialize_installation' : 'configure_firebase_auth', {
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  ...(mode === 'initialize' ? { master_email:process.env.VERS_INITIAL_MASTER_EMAIL, campaign_name:process.env.VERS_INITIAL_CAMPAIGN_NAME } : {}),
});
if (error) { console.error(error.message); process.exit(1); }
console.log(mode === 'initialize' ? 'Installation initialized. Sign in with the invited Google account.' : 'Trusted Firebase project configured.');
