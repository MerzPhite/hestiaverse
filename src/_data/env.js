require("dotenv").config();

/** Injected at build time. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (local) or CI. */
module.exports = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
};
