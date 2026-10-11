import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/ui/Icon';
import type { Assinatura } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import ui from '../../styles/ui.module.css';
import styles from './Assinatura.module.css';

/** Quantas vezes relê sou_assinante() esperando o webhook do Stripe, e de quanto em quanto tempo. */
export const ESPERA = { tentativas: 15, intervaloMs: 2000 };

type Estado = 'confirmando' | 'membro' | 'demorando';

/**
 * W16 · volta do pagamento. Quem libera a assinatura é o webhook do Stripe, não esta tela: ela só espera
 * a liberação aparecer no banco e então mostra "Você é membro".
 */
export function Retorno() {
  const { assinante, atualizarAssinante } = useAuth();
  const [estado, setEstado] = useState<Estado>(assinante ? 'membro' : 'confirmando');

  useEffect(() => {
    if (estado !== 'confirmando') return;
    let ativo = true;
    let tentativa = 0;
    const checar = async () => {
      if (!ativo) return;
      if (await atualizarAssinante()) return ativo && setEstado('membro');
      tentativa += 1;
      if (tentativa >= ESPERA.tentativas) return ativo && setEstado('demorando');
      relogio = setTimeout(checar, ESPERA.intervaloMs);
    };
    let relogio = setTimeout(checar, 0);
    return () => {
      ativo = false;
      clearTimeout(relogio);
    };
  }, [estado, atualizarAssinante]);

  return (
    <div className={styles.pagina}>
      {estado === 'confirmando' && (
        <section className={styles.aviso} aria-busy="true">
          <span className={styles.girando}>
            <Icon name="progress_activity" size={28} color="var(--primary)" />
          </span>
          <div>
            <h3 className={ui.title}>Confirmando seu pagamento</h3>
            <p>Leva só alguns segundos. Não feche esta página.</p>
          </div>
        </section>
      )}
      {estado === 'demorando' && (
        <section className={styles.aviso}>
          <Icon name="schedule" size={28} color="var(--gold-dark)" />
          <div>
            <h3 className={ui.title}>O pagamento ainda está sendo confirmado</h3>
            <p>Assim que o banco confirmar, a assinatura aparece em Minha assinatura e tudo é liberado. Você recebe o recibo por e-mail.</p>
            <Link to="/conta/assinatura" className={styles.link}>
              Ver minha assinatura
            </Link>
          </div>
        </section>
      )}
      {estado === 'membro' && <VoceEMembro />}
    </div>
  );
}

function VoceEMembro() {
  const { perfil, sessao } = useAuth();
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);

  useEffect(() => {
    supabase
      .from('assinaturas')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setAssinatura(data));
  }, []);

  return (
    <section className={styles.membro}>
      <div className={styles.membroTopo}>
        <span className={styles.membroSelo}>
          <Icon name="check" size={30} />
        </span>
        <div>
          <div className={styles.eyebrowVerde}>PAGAMENTO CONFIRMADO</div>
          <h2 className={styles.membroTitulo}>Você é membro</h2>
          <p>Recibo enviado para {sessao?.user.email}. A liberação vale para o mesmo login no app e no web app.</p>
        </div>
      </div>
      <dl className={styles.membroDados}>
        <div>
          <dt>PLANO</dt>
          <dd>{assinatura ? `Plano ${assinatura.plano}` : '…'}</dd>
        </div>
        <div>
          <dt>VALE ATÉ</dt>
          <dd>{assinatura?.expira_em ? new Date(assinatura.expira_em).toLocaleDateString('pt-BR') : '…'}</dd>
        </div>
        <div>
          <dt>CONTA</dt>
          <dd>
            {perfil?.apelido} · {perfil?.clube?.nome}
          </dd>
        </div>
      </dl>
      <div className={styles.membroDicas}>
        <div>
          <Icon name="lock_open" size={20} color="var(--green)" />
          <span>
            <strong>Cadeados abertos</strong>
            Missões, chat, palpites, ranking e fotos já estão liberados aqui.
          </span>
        </div>
        <div>
          <Icon name="smartphone" size={20} color="var(--primary)" />
          <span>
            <strong>No app também</strong>
            Mesmo login. Se o app já estava aberto, puxe a tela para atualizar.
          </span>
        </div>
      </div>
      <div className={styles.membroAcoes}>
        <Link to="/" className={styles.botaoPrimario}>
          Ir para o início
        </Link>
        <Link to="/conta/assinatura" className={styles.botaoNeutro}>
          Ver minha assinatura
        </Link>
      </div>
    </section>
  );
}
