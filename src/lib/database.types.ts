// Gerado a partir do projeto Supabase (generate_typescript_types). Regere após mudar o schema.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      perfis: {
        Row: {
          apelido: string | null;
          atualizado_em: string;
          cidade: string | null;
          criado_em: string;
          id: string;
          nascimento: string | null;
          nome: string;
          onboarding_concluido_em: string | null;
          pais: string | null;
          quer_avisos: boolean;
          quer_novidades: boolean;
          termos_aceitos_em: string | null;
          time_id: string | null;
        };
        Insert: {
          apelido?: string | null;
          atualizado_em?: string;
          cidade?: string | null;
          criado_em?: string;
          id: string;
          nascimento?: string | null;
          nome?: string;
          onboarding_concluido_em?: string | null;
          pais?: string | null;
          quer_avisos?: boolean;
          quer_novidades?: boolean;
          termos_aceitos_em?: string | null;
          time_id?: string | null;
        };
        Update: {
          apelido?: string | null;
          atualizado_em?: string;
          cidade?: string | null;
          criado_em?: string;
          id?: string;
          nascimento?: string | null;
          nome?: string;
          onboarding_concluido_em?: string | null;
          pais?: string | null;
          quer_avisos?: boolean;
          quer_novidades?: boolean;
          termos_aceitos_em?: string | null;
          time_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apelido_disponivel: { Args: { apelido: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Perfil = Database['public']['Tables']['perfis']['Row'];
export type PerfilUpdate = Database['public']['Tables']['perfis']['Update'];
