import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const SENHA_MINIMA = 8;
export const DIGITOS_CODIGO = 6;
/** Intervalo mínimo do Supabase entre dois e-mails para o mesmo endereço. */
export const REENVIO_SEGUNDOS = 60;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APELIDO_VALIDO = /^[A-Za-z0-9._]{3,20}$/;

export const emailValido = (email: string) => EMAIL_VALIDO.test(email);

export type Forca = { nivel: 0 | 1 | 2 | 3 | 4; rotulo: string; cor: string };

export function forcaDaSenha(senha: string): Forca {
  if (!senha) return { nivel: 0, rotulo: '', cor: 'var(--muted)' };
  if (senha.length < SENHA_MINIMA) return { nivel: 1, rotulo: 'curta', cor: 'var(--red-dark)' };
  let pontos = 1;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos++;
  if (/\d/.test(senha)) pontos++;
  if (/[^A-Za-z0-9]/.test(senha) || senha.length >= 12) pontos++;
  const nivel = Math.min(pontos, 4) as Forca['nivel'];
  if (nivel === 1) return { nivel, rotulo: 'fraca', cor: 'var(--red-dark)' };
  if (nivel === 2) return { nivel, rotulo: 'média', cor: 'var(--gold)' };
  if (nivel === 3) return { nivel, rotulo: 'boa', cor: 'var(--green)' };
  return { nivel, rotulo: 'forte', cor: 'var(--green)' };
}

type StatusApelido = 'vazio' | 'invalido' | 'verificando' | 'livre' | 'em-uso' | 'sem-conexao';

/** Valida o formato na hora e consulta a disponibilidade no Supabase com debounce. */
export function useApelido(apelido: string) {
  const limpo = apelido.trim();
  const formatoOk = APELIDO_VALIDO.test(limpo);
  const [consulta, setConsulta] = useState<{ apelido: string; status: StatusApelido } | null>(null);

  useEffect(() => {
    if (!formatoOk) return;
    let ativo = true;
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('apelido_disponivel', { apelido: limpo });
      if (ativo) setConsulta({ apelido: limpo, status: error ? 'sem-conexao' : data ? 'livre' : 'em-uso' });
    }, 350);
    return () => {
      ativo = false;
      window.clearTimeout(t);
    };
  }, [limpo, formatoOk]);

  const status: StatusApelido = !limpo
    ? 'vazio'
    : !formatoOk
      ? 'invalido'
      : consulta?.apelido === limpo
        ? consulta.status
        : 'verificando';

  const erro =
    status === 'invalido'
      ? 'Use de 3 a 20 letras, números, ponto ou _.'
      : status === 'em-uso'
        ? 'Esse apelido já está em uso.'
        : status === 'sem-conexao'
          ? 'Não deu para checar o apelido agora. Verifique sua conexão.'
          : null;

  return { limpo, status, erro, ok: status === 'livre' };
}
