// ═══════════ Appli Finance — configuration publique ═══════════
// Ces valeurs ne sont PAS secrètes : la clé « anon » de Supabase est faite pour être
// publique, la sécurité repose sur les règles RLS (chacun ne voit que ses propres lignes).
// À remplir en suivant GUIDE-SYNCHRO.md. Laisser vide = synchro désactivée.
window.FIN_CONFIG = {
  supabaseUrl: "",        // ex. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",    // clé « anon public » (Project Settings → API)
  githubRepo: ""          // ex. "pseudo/appli-finance" — page des versions pour l'exe portable
};
