import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../components/form/Button';
import { Icon } from '../components/ui/Icon';
import { useAuth } from './AuthContext';
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
  if (erroPerfil || !perfil) return <TelaErroPerfil />;
  if (torcedor && !perfil.onboarding_concluido_em) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
