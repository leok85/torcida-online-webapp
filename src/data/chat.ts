// Chat da torcida de um jogo (tabela mensagens_chat). Mensagens novas chegam pelo Supabase Realtime; se o canal
// cair, o hook busca as novas a cada poucos segundos. A RLS só entrega o chat da própria torcida e só para membros.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Mensagem = { id: number; autor_id: string; autor_apelido: string; autor_foto: string | null; texto: string; criado_em: string };

const COLUNAS = 'id, autor_id, autor_apelido, autor_foto, texto, criado_em';
/** Quantas mensagens a tela carrega ao abrir (as mais recentes). */
export const HISTORICO = 100;
export const TAMANHO_MAXIMO = 280;
/** Sem tempo real, de quanto em quanto tempo busca as novas. */
export const BUSCAR_NOVAS_MS = 5_000;

export type ErroDoChat = 'devagar' | 'chat_fechado' | 'so_membros' | 'outro_clube' | 'falha';

export const MENSAGEM_DO_ERRO: Record<ErroDoChat, string> = {
  devagar: 'Calma, uma mensagem de cada vez.',
  chat_fechado: 'O chat deste jogo já fechou.',
  so_membros: 'O chat da torcida é para membros.',
  outro_clube: 'O chat é da torcida dos times em campo.',
  falha: 'Não deu para enviar. Tente de novo.',
};

/** Junta sem repetir (a mesma mensagem pode vir do envio, do tempo real e da busca), em ordem de chegada. */
function juntar(atuais: Mensagem[], novas: Mensagem[]) {
  const ids = new Set(atuais.map((m) => m.id));
  const extras = novas.filter((m) => !ids.has(m.id));
  return extras.length ? [...atuais, ...extras].sort((a, b) => a.id - b.id) : atuais;
}

/** `ativo` false (quem não é membro ou não torce para os times em campo) não carrega nem escuta nada. */
export function useChat(partidaId: number, clubeId: number | null, usuarioId: string | null, ativo: boolean) {
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const [online, setOnline] = useState<number | null>(null);
  const [tempoReal, setTempoReal] = useState(false);
  const ultimo = useRef(0);

  const adicionar = useCallback((novas: Mensagem[]) => {
    if (!novas.length) return;
    ultimo.current = Math.max(ultimo.current, ...novas.map((m) => m.id));
    setMensagens((atuais) => juntar(atuais ?? [], novas));
  }, []);

  // Histórico e canal de tempo real (com presença, para o "N online").
  useEffect(() => {
    if (!ativo || !clubeId || !usuarioId) return;
    let vivo = true;
    ultimo.current = 0;
    setMensagens(null);
    setErroAoCarregar(false);
    supabase
      .from('mensagens_chat')
      .select(COLUNAS)
      .eq('partida_id', partidaId)
      .order('id', { ascending: false })
      .limit(HISTORICO)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) return setErroAoCarregar(true);
        setMensagens([]);
        adicionar(((data ?? []) as Mensagem[]).reverse());
      });

    const canal = supabase.channel(`chat:${partidaId}:${clubeId}`, { config: { presence: { key: usuarioId } } });
    canal
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_chat', filter: `partida_id=eq.${partidaId}` }, (p: { new: Mensagem }) =>
        adicionar([p.new]),
      )
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(canal.presenceState()).length))
      .subscribe((status: string) => {
        if (!vivo) return;
        if (status === 'SUBSCRIBED') {
          setTempoReal(true);
          void canal.track({ desde: Date.now() });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setTempoReal(false);
        }
      });
    return () => {
      vivo = false;
      setTempoReal(false);
      void supabase.removeChannel(canal);
    };
  }, [ativo, partidaId, clubeId, usuarioId, adicionar]);

  // Sem tempo real, busca as novas de tempos em tempos.
  useEffect(() => {
    if (!ativo || tempoReal || mensagens === null) return;
    const timer = window.setInterval(async () => {
      const { data } = await supabase.from('mensagens_chat').select(COLUNAS).eq('partida_id', partidaId).gt('id', ultimo.current).order('id', { ascending: true });
      if (data) adicionar(data as Mensagem[]);
    }, BUSCAR_NOVAS_MS);
    return () => window.clearInterval(timer);
  }, [ativo, tempoReal, mensagens === null, partidaId, adicionar]);

  const enviar = useCallback(
    async (texto: string): Promise<{ ok: true } | { ok: false; erro: ErroDoChat }> => {
      const { data, error } = await supabase.from('mensagens_chat').insert({ partida_id: partidaId, texto }).select(COLUNAS).single();
      if (error) {
        const hint = (error as { hint?: string }).hint;
        return { ok: false, erro: hint && hint in MENSAGEM_DO_ERRO ? (hint as ErroDoChat) : 'falha' };
      }
      adicionar([data as Mensagem]);
      return { ok: true };
    },
    [partidaId, adicionar],
  );

  return { mensagens, erroAoCarregar, online, enviar };
}
