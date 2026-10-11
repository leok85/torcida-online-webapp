// Gerado a partir do projeto Supabase (generate_typescript_types). Regere após mudar o schema.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      assinaturas: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          expira_em: string | null;
          id: string;
          id_externo: string;
          origem: string;
          plano: string;
          status: string;
          usuario_id: string;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          expira_em?: string | null;
          id?: string;
          id_externo: string;
          origem: string;
          plano: string;
          status: string;
          usuario_id: string;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          expira_em?: string | null;
          id?: string;
          id_externo?: string;
          origem?: string;
          plano?: string;
          status?: string;
          usuario_id?: string;
        };
        Relationships: [];
      };
      clubes: {
        Row: {
          atualizado_em: string;
          id: number;
          liga_id: number | null;
          nome: string;
          nome_curto: string | null;
          pais: string;
        };
        Insert: {
          atualizado_em?: string;
          id: number;
          liga_id?: number | null;
          nome: string;
          nome_curto?: string | null;
          pais: string;
        };
        Update: {
          atualizado_em?: string;
          id?: number;
          liga_id?: number | null;
          nome?: string;
          nome_curto?: string | null;
          pais?: string;
        };
        Relationships: [
          { foreignKeyName: 'clubes_liga_id_fkey'; columns: ['liga_id']; isOneToOne: false; referencedRelation: 'ligas'; referencedColumns: ['id'] },
          { foreignKeyName: 'clubes_pais_fkey'; columns: ['pais']; isOneToOne: false; referencedRelation: 'paises'; referencedColumns: ['codigo'] },
        ];
      };
      ligas: {
        Row: { divisao: number; id: number; nome: string; pais: string; temporada: string | null };
        Insert: { divisao?: number; id: number; nome: string; pais: string; temporada?: string | null };
        Update: { divisao?: number; id?: number; nome?: string; pais?: string; temporada?: string | null };
        Relationships: [
          { foreignKeyName: 'ligas_pais_fkey'; columns: ['pais']; isOneToOne: false; referencedRelation: 'paises'; referencedColumns: ['codigo'] },
        ];
      };
      paises: {
        Row: { bandeira: string; codigo: string; nome: string; ordem: number };
        Insert: { bandeira: string; codigo: string; nome: string; ordem?: number };
        Update: { bandeira?: string; codigo?: string; nome?: string; ordem?: number };
        Relationships: [];
      };
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
          time_id: number | null;
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
          time_id?: number | null;
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
          time_id?: number | null;
        };
        Relationships: [
          { foreignKeyName: 'perfis_pais_fkey'; columns: ['pais']; isOneToOne: false; referencedRelation: 'paises'; referencedColumns: ['codigo'] },
          { foreignKeyName: 'perfis_time_id_fkey'; columns: ['time_id']; isOneToOne: false; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apelido_disponivel: { Args: { apelido: string }; Returns: boolean };
      sou_assinante: { Args: never; Returns: boolean };
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
export type Pais = Database['public']['Tables']['paises']['Row'];
export type Liga = Database['public']['Tables']['ligas']['Row'];
export type ClubeRow = Database['public']['Tables']['clubes']['Row'];
export type Assinatura = Database['public']['Tables']['assinaturas']['Row'];
