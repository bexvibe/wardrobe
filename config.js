// ============================================================
//  The Archive — connection settings
//
//  Fill these two values in after creating your Supabase project.
//  Step-by-step instructions are in SETUP.md.
//
//  The anon key is SAFE to commit and safe to ship in the page.
//  It grants nothing on its own: every table requires a signed-in
//  session (that is what the password screen establishes), so an
//  anonymous request reads back an empty result set.
//
//  The service_role key is the opposite — it bypasses all security.
//  Never put that one in this file.
// ============================================================
window.WARDROBE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',

  // The single account the password screen signs in as. You create this
  // account once in the Supabase dashboard (SETUP.md step 4); the app only
  // ever asks you for the password.
  authEmail: 'wardrobe@the-archive.app',
};
