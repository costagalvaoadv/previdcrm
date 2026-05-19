const SUPABASE_URL = 'https://lpwyolzzawsvbswgvnsg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7Zaxsnt3JpxAgmjBrMyyXA_U6RIRQf3';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
