// lib/supabase-client.js
// Supabase client singleton.
// The publishable anon key is safe for client-side use — access is governed by RLS policies.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = 'https://gmmixhwvpochyoxqiqck.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HMPiPJZ5WVBjPPh6pm9i3w_11AEKpss';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
