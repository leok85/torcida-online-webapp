import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/form/Button';
import { Icon } from '../../components/ui/Icon';
import type { Assinatura } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import ui from '../../styles/ui.module.css';
import styles from './Assinatura.module.css';

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronto'; assinatura: Assinatura | null };

const STATUS: Record<string, { rotulo: string; icone: string; tom: string }> = {
  ativa: { rotulo: 'ATIVA', icone: 'check_circle', tom: styles.statusOk },
  atrasada: { rotulo: 'PAGAMENTO PENDENTE', icone: 'error', tom: styles.statusAlerta },
  cancelada: { rotulo: 'CANCELADA', icone: 'cancel', tom: styles.statusAlerta },
  pendente: { rotulo: 'AGUARDANDO PAGAMENTO', icone: 'schedule', tom: styles.statusAlerta },
  expirada: { rotulo: 'EXPIRADA', icone: 'history', tom: styles.statusFim },
};

const LOJA: Record<string, string> = { apple: 'App Store', google: 'Google Play' };

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

function validade(a: Assinatura) {
  if (a.status === 'pendente') return 'aguardando a confirmação do pagamento';
  if (a.status === 'expirada') return `terminou em ${data(a.expira_em)}`;
  if (a.status === 'cancelada') return `não renova · liberado até ${data(a.expira_em)}`;
  return `renova em ${data(a.expira_em)}`;
}

/** W18 · Minha assinatura: a mais recente do torcedor, venha do web app ou das lojas. */
export function MinhaAssinatura() {
  const { perfil, sessao } = useAuth();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    supabase
      .from('assinaturas')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: assinatura, error }) => {
        if (ativo) setEstado(error ? { tipo: 'erro' } : { tipo: 'pronto', assinatura });
      });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Minha assinatura</h2>
        <span className={ui.pageSub}>
          {perfil?.apelido} · {sessao?.user.email}
        </span>
      </div>
      {estado.tipo === 'carregando' && <div className={styles.carregando} aria-busy="true" />}
      {estado.tipo === 'erro' && (
        <section className={styles.aviso}>
          <Icon name="cloud_off" size={28} color="var(--muted)" />
          <div>
            <h3 className={ui.title}>Não deu para carregar sua assinatura</h3>
            <p>Verifique sua conexão e tente de novo.</p>
            <Button fullWidth={false} variant="neutral" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </Button>
          </div>
        </section>
      )}
      {estado.tipo === 'pronto' && (estado.assinatura ? <Detalhes assinatura={estado.assinatura} /> : <SemAssinatura />)}
    </div>
  );
}

function SemAssinatura() {
  return (
    <section className={styles.aviso}>
      <Icon name="workspace_premium" size={28} color="var(--primary)" />
      <div>
        <h3 className={ui.title}>Você ainda não é membro</h3>
        <p>Com a assinatura você libera palpites, chat ao vivo, missões, ranking, fotos e os prêmios da torcida.</p>
        <Link to="/assinar" className={styles.link}>
          Ver planos
        </Link>
      </div>
    </section>
  );
}

function Detalhes({ assinatura: a }: { assinatura: Assinatura }) {
  const status = STATUS[a.status] ?? STATUS.expirada;
  const loja = LOJA[a.origem];
  return (
    <div className={styles.detalhes}>
      <section className={styles.cartaoPlano}>
        <div className={`${styles.status} ${status.tom}`}>
          <Icon name={status.icone} size={17} />
          {status.rotulo}
        </div>
        <h3 className={styles.nomePlano}>Plano {a.plano}</h3>
        <p className={styles.validade}>{validade(a)}</p>
        {a.status === 'expirada' && (
          <Link to="/assinar" className={styles.link}>
            Assinar de novo
          </Link>
        )}
      </section>
      {loja && (
        <p className={styles.nota}>
          <Icon name="info" size={17} />
          Você assinou pela {loja}. Troca de plano e cancelamento ficam nos ajustes da {loja}.
        </p>
      )}
    </div>
  );
}
