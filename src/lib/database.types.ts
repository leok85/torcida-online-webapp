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
      cidades: {
        Row: { codigo: string; fonte: string; id: number; nome: string; nome_busca: string; pais: string; regiao: string | null };
        Insert: { codigo: string; fonte: string; id?: never; nome: string; nome_busca: string; pais: string; regiao?: string | null };
        Update: { codigo?: string; fonte?: string; id?: never; nome?: string; nome_busca?: string; pais?: string; regiao?: string | null };
        Relationships: [
          { foreignKeyName: 'cidades_pais_fkey'; columns: ['pais']; isOneToOne: false; referencedRelation: 'paises'; referencedColumns: ['codigo'] },
        ];
      };
      classificacao: {
        Row: {
          atualizado_em: string;
          clube_id: number;
          clube_nome: string | null;
          derrotas: number;
          empates: number;
          forma: string | null;
          gols_contra: number;
          gols_pro: number;
          grupo: string;
          jogos: number;
          liga_id: number;
          pontos: number;
          posicao: number;
          vitorias: number;
          zona: string | null;
          zona_tipo: string | null;
        };
        Insert: {
          atualizado_em?: string;
          clube_id: number;
          clube_nome?: string | null;
          derrotas: number;
          empates: number;
          forma?: string | null;
          gols_contra: number;
          gols_pro: number;
          grupo?: string;
          jogos: number;
          liga_id: number;
          pontos: number;
          posicao: number;
          vitorias: number;
          zona?: string | null;
          zona_tipo?: string | null;
        };
        Update: {
          atualizado_em?: string;
          clube_id?: number;
          clube_nome?: string | null;
          derrotas?: number;
          empates?: number;
          forma?: string | null;
          gols_contra?: number;
          gols_pro?: number;
          grupo?: string;
          jogos?: number;
          liga_id?: number;
          pontos?: number;
          posicao?: number;
          vitorias?: number;
          zona?: string | null;
          zona_tipo?: string | null;
        };
        Relationships: [];
      };
      feedbacks: {
        Row: {
          anexo: string | null;
          area: string;
          atualizado_em: string;
          criado_em: string;
          dados_navegador: Json | null;
          email: string | null;
          estado: string;
          id: string;
          pode_responder: boolean;
          resposta: string | null;
          texto: string;
          tipo: string;
          usuario_id: string;
          xp: number;
        };
        Insert: {
          anexo?: string | null;
          area: string;
          dados_navegador?: Json | null;
          pode_responder?: boolean;
          texto: string;
          tipo: string;
        };
        Update: {
          estado?: string;
          resposta?: string | null;
        };
        Relationships: [];
      };
      competicoes: {
        Row: {
          atualizado_em: string;
          fases: Json;
          fim: string | null;
          formato: string;
          inicio: string | null;
          liga_id: number;
          nome: string;
          temporada: string | null;
          temporada_id: number | null;
        };
        Insert: {
          atualizado_em?: string;
          fases?: Json;
          fim?: string | null;
          formato: string;
          inicio?: string | null;
          liga_id: number;
          nome: string;
          temporada?: string | null;
          temporada_id?: number | null;
        };
        Update: {
          atualizado_em?: string;
          fases?: Json;
          fim?: string | null;
          formato?: string;
          inicio?: string | null;
          liga_id?: number;
          nome?: string;
          temporada?: string | null;
          temporada_id?: number | null;
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
        Row: { artigo: string; divisao: number; id: number; nome: string; pais: string; temporada: string | null };
        Insert: { artigo?: string; divisao?: number; id: number; nome: string; pais: string; temporada?: string | null };
        Update: { artigo?: string; divisao?: number; id?: number; nome?: string; pais?: string; temporada?: string | null };
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
      mensagens_chat: {
        Row: {
          autor_apelido: string;
          autor_foto: string | null;
          autor_id: string;
          clube_id: number;
          criado_em: string;
          id: number;
          partida_id: number;
          texto: string;
        };
        Insert: { partida_id: number; texto: string };
        Update: Record<string, never>;
        Relationships: [
          { foreignKeyName: 'mensagens_chat_partida_id_fkey'; columns: ['partida_id']; isOneToOne: false; referencedRelation: 'partidas'; referencedColumns: ['id'] },
        ];
      };
      partidas: {
        Row: {
          atualizado_em: string;
          encerrada_em: string | null;
          gols: Json;
          fase: string | null;
          fase_nome: string | null;
          grupo: string | null;
          jogo_de_ida: number | null;
          penaltis_mandante: number | null;
          penaltis_visitante: number | null;
          temporada_id: number | null;
          gols_mandante: number | null;
          gols_visitante: number | null;
          id: number;
          inicio: string;
          liga_id: number | null;
          liga_nome: string;
          mandante_id: number;
          mandante_nome: string;
          minuto: number | null;
          periodo: string | null;
          rodada: number | null;
          status: string;
          visitante_id: number;
          visitante_nome: string;
        };
        Insert: {
          atualizado_em?: string;
          encerrada_em?: string | null;
          gols?: Json;
          fase?: string | null;
          fase_nome?: string | null;
          grupo?: string | null;
          jogo_de_ida?: number | null;
          penaltis_mandante?: number | null;
          penaltis_visitante?: number | null;
          temporada_id?: number | null;
          gols_mandante?: number | null;
          gols_visitante?: number | null;
          id: number;
          inicio: string;
          liga_id?: number | null;
          liga_nome: string;
          mandante_id: number;
          mandante_nome: string;
          minuto?: number | null;
          periodo?: string | null;
          rodada?: number | null;
          status: string;
          visitante_id: number;
          visitante_nome: string;
        };
        Update: {
          atualizado_em?: string;
          encerrada_em?: string | null;
          gols?: Json;
          fase?: string | null;
          fase_nome?: string | null;
          grupo?: string | null;
          jogo_de_ida?: number | null;
          penaltis_mandante?: number | null;
          penaltis_visitante?: number | null;
          temporada_id?: number | null;
          gols_mandante?: number | null;
          gols_visitante?: number | null;
          id?: number;
          inicio?: string;
          liga_id?: number | null;
          liga_nome?: string;
          mandante_id?: number;
          mandante_nome?: string;
          minuto?: number | null;
          periodo?: string | null;
          rodada?: number | null;
          status?: string;
          visitante_id?: number;
          visitante_nome?: string;
        };
        Relationships: [];
      };
      perfis: {
        Row: {
          apelido: string | null;
          apelido_alterado_em: string | null;
          apelido_anterior: string | null;
          atualizado_em: string;
          cidade: string | null;
          cidade_id: number | null;
          convidado_por: string | null;
          convite_contou_em: string | null;
          criado_em: string;
          exclusao_agendada_para: string | null;
          foto: string | null;
          id: string;
          nascimento: string | null;
          nome: string;
          onboarding_concluido_em: string | null;
          pais: string | null;
          quer_avisos: boolean;
          quer_novidades: boolean;
          senha_alterada_em: string | null;
          termos_aceitos_em: string | null;
          time_anterior_id: number | null;
          time_id: number | null;
          time_trocado_em: string | null;
        };
        Insert: {
          apelido?: string | null;
          apelido_alterado_em?: string | null;
          apelido_anterior?: string | null;
          atualizado_em?: string;
          cidade?: string | null;
          cidade_id?: number | null;
          convidado_por?: string | null;
          convite_contou_em?: string | null;
          criado_em?: string;
          exclusao_agendada_para?: string | null;
          foto?: string | null;
          id: string;
          nascimento?: string | null;
          nome?: string;
          onboarding_concluido_em?: string | null;
          pais?: string | null;
          quer_avisos?: boolean;
          quer_novidades?: boolean;
          senha_alterada_em?: string | null;
          termos_aceitos_em?: string | null;
          time_anterior_id?: number | null;
          time_id?: number | null;
          time_trocado_em?: string | null;
        };
        Update: {
          apelido?: string | null;
          apelido_alterado_em?: string | null;
          apelido_anterior?: string | null;
          atualizado_em?: string;
          cidade?: string | null;
          cidade_id?: number | null;
          convidado_por?: string | null;
          convite_contou_em?: string | null;
          criado_em?: string;
          exclusao_agendada_para?: string | null;
          foto?: string | null;
          id?: string;
          nascimento?: string | null;
          nome?: string;
          onboarding_concluido_em?: string | null;
          pais?: string | null;
          quer_avisos?: boolean;
          quer_novidades?: boolean;
          senha_alterada_em?: string | null;
          termos_aceitos_em?: string | null;
          time_anterior_id?: number | null;
          time_id?: number | null;
          time_trocado_em?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'perfis_cidade_id_fkey'; columns: ['cidade_id']; isOneToOne: false; referencedRelation: 'cidades'; referencedColumns: ['id'] },
          { foreignKeyName: 'perfis_convidado_por_fkey'; columns: ['convidado_por']; isOneToOne: false; referencedRelation: 'perfis'; referencedColumns: ['id'] },
          { foreignKeyName: 'perfis_pais_fkey'; columns: ['pais']; isOneToOne: false; referencedRelation: 'paises'; referencedColumns: ['codigo'] },
          { foreignKeyName: 'perfis_time_anterior_id_fkey'; columns: ['time_anterior_id']; isOneToOne: false; referencedRelation: 'clubes'; referencedColumns: ['id'] },
          { foreignKeyName: 'perfis_time_id_fkey'; columns: ['time_id']; isOneToOne: false; referencedRelation: 'clubes'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apelido_disponivel: { Args: { apelido: string }; Returns: boolean };
      aplicar_convite: { Args: { codigo: string }; Returns: string };
      convite_de: { Args: { codigo: string }; Returns: { apelido: string; clube: string | null }[] };
      chat_aberto: { Args: { p_partida: number }; Returns: boolean };
      enviar_notas: { Args: { p_partida: number; p_notas: { jogador: number; nota: number }[] }; Returns: number };
      notas_abertas: { Args: { p_partida: number }; Returns: boolean };
      situacao_do_palpite: { Args: { p_partida: number; p_clube: number }; Returns: string };
      enviar_palpite: {
        Args: {
          p_partida: number;
          p_formacao: string;
          p_escalacao: { [vaga: string]: number };
          p_gols_mandante: number;
          p_gols_visitante: number;
          p_autores?: { mandante: boolean; jogador: number }[];
        };
        Returns: undefined;
      };
      escalacao_mais_votada: {
        Args: { p_partida: number };
        Returns: { votantes: number; formacao: string | null; jogadores: { vaga: string; id: number; nome: string; numero: number | null; votos: number }[] }[];
      };
      meu_palpite: {
        Args: { p_partida: number };
        Returns: {
          formacao: string;
          escalacao: { [vaga: string]: number };
          gols_mandante: number;
          gols_visitante: number;
          autores: { mandante: boolean; jogador: number }[];
          atualizado_em: string;
        }[];
      };
      notas_da_torcida: {
        Args: { p_partida: number };
        Returns: { jogador_id: number; media: number; votos: number; minha: number | null; votantes: number }[];
      };
      convites_restantes: { Args: Record<string, never>; Returns: number };
      meu_convidador: { Args: Record<string, never>; Returns: string | null };
      meus_convidados: {
        Args: Record<string, never>;
        Returns: { chave: string; nome: string; estado: 'ativo' | 'sem_time' | 'pendente'; reenviado: boolean; desde: string }[];
      };
      clubes_com_torcedores: { Args: Record<string, never>; Returns: number[] };
      encerrar_aparelho: { Args: { sessao: string }; Returns: boolean };
      manter_minha_conta: { Args: Record<string, never>; Returns: undefined };
      meus_aparelhos: {
        Args: Record<string, never>;
        Returns: { id: string; user_agent: string | null; criado_em: string; usado_em: string; atual: boolean }[];
      };
      resumo_do_clube: {
        Args: { clube: number };
        Returns: { artigo: string | null; liga: string | null; posicao: number | null; torcedores: number }[];
      };
      buscar_cidades: {
        Args: { limite?: number; pais?: string; termo: string };
        Returns: { id: number; nome: string; regiao: string }[];
      };
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
export type PartidaRow = Database['public']['Tables']['partidas']['Row'];
/** Item da coluna partidas.gols (jsonb), como a sincronização com a BSD grava. */
export type Gol = { jogador: string; minuto: string; mandante: boolean; contra: boolean; penalti: boolean };
export type Partida = Omit<PartidaRow, 'gols'> & { gols: Gol[] };
export type ClassificacaoRow = Database['public']['Tables']['classificacao']['Row'];
export type CompeticaoRow = Database['public']['Tables']['competicoes']['Row'];
export type Assinatura = Database['public']['Tables']['assinaturas']['Row'];
export type FeedbackRow = Database['public']['Tables']['feedbacks']['Row'];
