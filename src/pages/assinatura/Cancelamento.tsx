import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { chamarFuncao } from '../../assinatura/funcoes';
import { BENEFICIOS } from '../../assinatura/planos';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
import { Icon } from '../../components/ui/Icon';
import type { Assinatura } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import ui from '../../styles/ui.module.css';
import styles from './Assinatura.module.css';

/** W19 · cancelamento. Cancela no fim do período: tudo continua liberado até a data já paga. */
export function Cancelamento() {
  const { atualizarAssinante } = useAuth();
  const navigate = useNavigate();
  const [assinatura, setAssinatura] = useState<Assinatura | null | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    supabase
      .from('assinaturas')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setAssinatura(data));
  }, []);

  if (assinatura === undefined) return <div className={styles.pagina}><div className={styles.carregando} aria-busy="true" /></div>;
  // Só a assinatura ativa do web app se cancela aqui; as das lojas, na App Store ou no Google Play.
  if (!assinatura || assinatura.origem !== 'web' || assinatura.status !== 'ativa') {
    return (
      <div className={styles.pagina}>
        <section className={styles.aviso}>
          <Icon name="info" size={28} color="var(--muted)" />
          <div>
            <h3 className={ui.title}>Não há assinatura para cancelar aqui</h3>
            <Link to="/conta/assinatura" className={styles.link}>
              Voltar para Minha assinatura
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const ate = new Date(assinatura.expira_em!).toLocaleDateString('pt-BR');

  const cancelar = async () => {
    setEnviando(true);
    setErro(false);
    const r = await chamarFuncao('gerenciar-assinatura', { acao: 'cancelar' });
    setEnviando(false);
    if (!r.ok) return setErro(true);
    await atualizarAssinante();
    navigate('/conta/assinatura');
  };

  return (
    <div className={styles.pagina}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>O que você perde</h2>
      </div>
      <section className={styles.cartaoPlano}>
        <p className={styles.validade}>
          Nada é apagado hoje. Até {ate} sua conta segue com tudo liberado e nada mais é cobrado. Depois disso ela volta para a
          camada aberta, com jogos e notícias.
        </p>
        <ul className={styles.perdas}>
          {BENEFICIOS.map((b) => (
            <li key={b.titulo}>
              <Icon name={b.icone} size={19} color="var(--muted)" />
              {b.titulo}
            </li>
          ))}
        </ul>
        {erro && <Alert>Não deu para cancelar agora. Tente de novo em instantes.</Alert>}
        <div className={styles.cancelarAcoes}>
          <Link to="/conta/assinatura" className={styles.botaoPrimario}>
            Manter assinatura
          </Link>
          <Button fullWidth={false} variant="neutral" loading={enviando} onClick={cancelar}>
            Cancelar assinatura
          </Button>
        </div>
      </section>
    </div>
  );
}
