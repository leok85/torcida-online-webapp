import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert } from '../components/form/Alert';
import { Button } from '../components/form/Button';
import { Icon } from '../components/ui/Icon';
import { dataCurta } from '../data/conta';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { contaCorporativa } from './contaCorporativa';
import styles from './Rotas.module.css';

export type DestinoState = { de?: string } | null;

/** Abertura do app (Claude Design): logo subindo sobre o fundo escuro e uma barrinha verde enquanto a sessão carrega. */
function TelaCarregando() {
  return (
    <div className={styles.abertura} aria-busy="true">
      <div className={styles.marca}>
        <img src="/icon-color.png" alt="" className={styles.logo} />
        <span className={styles.nome}>
          Torcida
          <br />
          Online
        </span>
      </div>
      <div className={styles.barra} role="progressbar" aria-label="Carregando a Torcida Online">
        <span />
      </div>
    </div>
  );
}

function TelaErroPerfil() {
  const { recarregarPerfil, sair } = useAuth();
  return (
    <div className={styles.tela}>
      <div className={styles.erro}>
        <Icon name="cloud_off" size={30} color="var(--muted)" />
        <h1 className={styles.titulo}>Não deu para carregar seu perfil</h1>
        <p className={styles.texto}>Verifique sua conexão. Se continuar, saia e entre de novo.</p>
        <div className={styles.acoes}>
          <Button onClick={recarregarPerfil}>Tentar de novo</Button>
          <Button variant="neutral" onClick={sair}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Conta com e-mail do domínio corporativo: serve só para o back-office, sem perfil de torcedor. */
function TelaContaCorporativa({ email }: { email: string }) {
  const { sair } = useAuth();
  return (
    <div className={styles.tela}>
      <div className={styles.erro}>
        <Icon name="badge" size={30} color="var(--muted)" />
        <h1 className={styles.titulo}>Essa é uma conta corporativa</h1>
        <p className={styles.texto}>
          {email} é só para o back-office. Para torcer, saia e entre com sua conta pessoal.
        </p>
        <div className={styles.acoes}>
          <Button onClick={sair}>Sair e usar outra conta</Button>
        </div>
      </div>
    </div>
  );
}

/** Quem pediu a exclusão e entrou de novo dentro do prazo: escolhe entre manter a conta e sair. */
function TelaContaEmExclusao({ data }: { data: string }) {
  const { recarregarPerfil, sair } = useAuth();
  const [mantendo, setMantendo] = useState(false);
  const [erro, setErro] = useState(false);

  async function manter() {
    setMantendo(true);
    setErro(false);
    const { error } = await supabase.rpc('manter_minha_conta');
    if (error) {
      setMantendo(false);
      setErro(true);
      return;
    }
    recarregarPerfil();
  }

  return (
    <div className={styles.tela}>
      <div className={styles.erro}>
        <Icon name="person_off" size={30} color="var(--red-dark)" />
        <h1 className={styles.titulo}>Sua conta está marcada para exclusão</h1>
        <p className={styles.texto}>
          Ela será apagada de vez em {dataCurta(data)}. Quer continuar na torcida? Mantenha a conta e siga de onde parou.
        </p>
        {erro && <Alert>Não foi possível manter a conta agora. Tente de novo.</Alert>}
        <div className={styles.acoes}>
          <Button onClick={manter} loading={mantendo}>
            Manter minha conta
          </Button>
          <Button variant="neutral" onClick={sair} disabled={mantendo}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Entrar e criar conta: quem já está logado volta para onde queria ir. */
export function ApenasVisitante() {
  const { carregando, sessao } = useAuth();
  const { state } = useLocation();
  if (carregando) return <TelaCarregando />;
  if (sessao) return <Navigate to={(state as DestinoState)?.de ?? '/'} replace />;
  return <Outlet />;
}

/** Exige sessão. Com `torcedor`, exige também o onboarding concluído (país, clube e cidade). */
export function ApenasLogado({ torcedor = false }: { torcedor?: boolean }) {
  const { carregando, sessao, perfil, erroPerfil } = useAuth();
  const { pathname, search } = useLocation();
  if (carregando) return <TelaCarregando />;
  if (!sessao) return <Navigate to="/entrar" replace state={{ de: pathname + search } satisfies DestinoState} />;
  if (contaCorporativa(sessao.user.email)) return <TelaContaCorporativa email={sessao.user.email ?? ''} />;
  if (erroPerfil || !perfil) return <TelaErroPerfil />;
  if (perfil.exclusao_agendada_para) return <TelaContaEmExclusao data={perfil.exclusao_agendada_para} />;
  if (torcedor && !perfil.onboarding_concluido_em) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
