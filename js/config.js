// ═══════════ Appli Finance — configuration publique ═══════════
// Ces valeurs ne sont PAS secrètes : la clé « anon » de Supabase est faite pour être
// publique, la sécurité repose sur les règles RLS (chacun ne voit que ses propres lignes).
// À remplir en suivant GUIDE-SYNCHRO.md. Laisser vide = synchro désactivée.
window.FIN_CONFIG = {
  supabaseUrl: "https://xwasndyojqfdocbkkmqn.supabase.co",        // ex. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YXNuZHlvanFmZG9jYmtrbXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NDE2NjMsImV4cCI6MjEwODQxNzY2M30.B3p4IHxKjuEFBMZHa8IMQxBoqwTxmyLba7VzxcoRiZY",    // clé « anon public » (Project Settings → API)
  githubRepo: "BistouflailleMan/Bist-Fin_App-Proj"          // ex. "pseudo/nom-du-depot" — page des versions pour l'exe portable
};
