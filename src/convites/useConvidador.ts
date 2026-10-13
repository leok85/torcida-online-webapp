import { useCallback, useEffect, useState } from 'react';
import { aplicarConvite, lerConvitePendente, limparConvitePendente, meuConvidador } from './convites';

type Estado = { carregando: boolean; convidador: string | null };

/**
 * Quem convidou o torcedor recém-cadastrado. Ao montar, aplica o link /r/ guardado neste navegador (cadastro pelo
 * Google ou e-mail confirmado em outra aba); sem ele, só lê o convidador gravado no cadastro.
 */
export function useConvidador() {
  const [estado, setEstado] = useState<Estado>({ carregando: true, convidador: null });

  useEffect(() => {
    let vivo = true;
    (async () => {
      const pendente = lerConvitePendente();
      let convidador: string | null = null;
      if (pendente) {
        const r = await aplicarConvite(pendente);
        // Código inválido ou o próprio apelido: descarta; falha de rede: tenta de novo na próxima tela.
        if (r.ok || r.erro !== 'falha') limparConvitePendente();
        if (r.ok) convidador = r.apelido;
      }
      convidador ??= await meuConvidador();
      if (vivo) setEstado({ carregando: false, convidador });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const aplicar = useCallback(async (codigo: string) => {
    const r = await aplicarConvite(codigo);
    if (r.ok) setEstado({ carregando: false, convidador: r.apelido });
    return r;
  }, []);

  return { ...estado, aplicar };
}
