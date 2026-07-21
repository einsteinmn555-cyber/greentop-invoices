// Green Top Invoice Portal - Client Configuration
// Public configuration - safe to commit and expose to browsers
// Contains only public client-side credentials, never any secrets

window.GREENTOP_CONFIG = {
  // Supabase public credentials (safe to expose)
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key',
  
  // Official website
  OFFICIAL_WEBSITE: 'https://www.greentaxikw.com',
  
  // Edge Function URL for secure invoice download
  INVOICE_FUNCTION_URL: 'https://your-project.supabase.co/functions/v1/get-invoice-url',
};
