// Silêncio e suspensão aplicados pela equipe no back-office (tabela restricoes). O banco barra as ações por trigger
// (hint 'suspenso' ou 'silenciado'); aqui o app avisa antes e traduz o erro. Suspenso também não entra nem renova a
// sessão (o Supabase Auth responde user_banned).
import { useCallback, useEffect, useState } from 'react';
import { MENSAGEM_SUSPENSO } from '../auth/suspensao';
import { supabase } from '../lib/supabase';

export { MENSAGEM_SUSPENSO };
export const MENSAGEM_SILENCIADO = 'Você está silenciado e não pode publicar agora.';

export type Restricoes = { silencioAte: Date | null; suspensaoAte: Date | null };

export const SEM_RESTRICOES: Restricoes = { silencioAte: null, suspensaoAte: null };

/** Restrições em vigor do torcedor logado; sem nenhuma (ou se a leitura falhar), nada travado: o banco ainda barra. */
export async function buscarRestricoes(): Promise<Restricoes> {
  const { data, error } = await supabase.rpc('minhas_restricoes');
  if (error) return SEM_RESTRICOES;
  const ate = (tipo: string) => {
    const linha = (data ?? []).find((r) => r.tipo === tipo);
    return linha ? new Date(linha.ate) : null;
  };
  return { silencioAte: ate('silencio'), suspensaoAte: ate('suspensao') };
}

/**
 * undefined enquanto carrega. Relê sozinho quando a restrição vence (o chat destrava sem recarregar a página) e com
 * `recarregar` (ex.: o banco recusou o envio porque o silêncio foi aplicado com a tela aberta).
 */
export function useMinhasRestricoes(ativo = true) {
  const [restricoes, setRestricoes] = useState<Restricoes | undefined>(undefined);
  const [leitura, setLeitura] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let timer: number | undefined;
    buscarRestricoes().then((r) => {
      if (!vivo) return;
      setRestricoes(r);
      const fins = [r.silencioAte, r.suspensaoAte].filter((d): d is Date => !!d).map((d) => d.getTime() - Date.now());
      // setTimeout aceita até ~24,8 dias; restrição mais longa é relida na próxima abertura da tela.
      const espera = Math.min(...fins);
      if (fins.length && espera < 2 ** 31 - 1) timer = window.setTimeout(() => setLeitura((n) => n + 1), Math.max(espera, 0) + 1000);
    });
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, [ativo, leitura]);
  return { restricoes, recarregar: useCallback(() => setLeitura((n) => n + 1), []) };
}

const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "Você está silenciado até 15/10 20:00" (horário de Brasília). */
export const textoDoSilencio = (ate: Date) => `Você está silenciado até ${DATA_E_HORA.format(ate).replace(',', '')}`;

/**
 * Por que publicar (chat e fotos) está travado: suspensão vale para tudo, silêncio só para publicar.
 * null quando está liberado.
 */
export function motivoParaNaoPublicar(r: Restricoes | undefined) {
  if (!r) return null;
  if (r.suspensaoAte) return MENSAGEM_SUSPENSO;
  if (r.silencioAte) return textoDoSilencio(r.silencioAte);
  return null;
}
