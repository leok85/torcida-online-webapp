import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { resumoDoClube, textoPosicao, textoTorcedores, type ResumoDoClube } from '../../data/clubes';
import { urlDaFoto } from '../../data/conta';
import { Avatar } from '../ui/Avatar';
import { Crest } from '../ui/Crest';
import { Carregando, Skeleton } from '../ui/Skeleton';
import { Icon } from '../ui/Icon';
import { FLAG } from '../../data/common';
import { xpEmTexto } from '../../data/xp';
import { useMeuXp } from '../../xp/MeuXp';
import styles from './Header.module.css';

type HeaderProps = {
  notifOpen: boolean;
  accountOpen: boolean;
  onToggleNotif: () => void;
  onToggleAccount: () => void;
};

/** Atualiza o resumo do clube a cada 10 min (torcedores e classificação mudam devagar). */
export const ATUALIZAR_RESUMO_MS = 600_000;

/** undefined enquanto carrega; null se falhou ou se o clube não tem resumo. */
function useResumoDoClube(clubeId: number | undefined) {
  const [resumo, setResumo] = useState<{ clubeId: number; dados: ResumoDoClube | null } | null>(null);
  useEffect(() => {
    if (!clubeId) return;
    let ativo = true;
    const carregar = () =>
      resumoDoClube(clubeId).then(
        (dados) => ativo && setResumo({ clubeId, dados }),
        // Sem o resumo, o topo só não mostra os números; tenta de novo na próxima rodada.
        () => ativo && setResumo((anterior) => (anterior?.clubeId === clubeId ? anterior : { clubeId, dados: null })),
      );
    carregar();
    const timer = window.setInterval(carregar, ATUALIZAR_RESUMO_MS);
    return () => {
      ativo = false;
      window.clearInterval(timer);
    };
  }, [clubeId]);
  return resumo && resumo.clubeId === clubeId ? resumo.dados : undefined;
}

export function Header({ notifOpen, accountOpen, onToggleNotif, onToggleAccount }: HeaderProps) {
  const { perfil } = useAuth();
  const clube = perfil?.clube;
  const pais = perfil?.pais_dados;
  const resumo = useResumoDoClube(clube?.id);
  const { xp, posicao } = useMeuXp();
  const meta = resumo
    ? [textoTorcedores(resumo.torcedores), textoPosicao(resumo)].filter(Boolean).join(' · ') : '';
  return (
    <header className={styles.header}>
      <Crest width={34} height={38} tone="lightHome" clubeId={clube?.id} />
      <div className={styles.club}>
        <div className={styles.clubName}>{clube?.nome}</div>
        <div className={styles.clubMeta}>
          {pais && <img src={FLAG(pais.bandeira)} alt="" className={styles.flag} />}
          {resumo === undefined && clube ? (
            <Carregando as="div" className={styles.metaCarregando} rotulo="Carregando torcedores e posição">
              <Skeleton w={78} h={9} r="pilula" />
              <Skeleton w={110} h={9} r="pilula" />
            </Carregando>
          ) : (
            <span>{meta}</span>
          )}
        </div>
      </div>
      <label className={styles.search}>
        <Icon name="search" size={19} />
        <input className={styles.searchInput} type="search" placeholder="Buscar jogo, torcedor ou notícia" />
      </label>
      <div className={styles.coins}>
        <Icon name="monetization_on" size={18} />
        440
      </div>
      <div className={styles.level}>
        <Icon name="bolt" size={17} color="var(--green-light)" />
        NÍVEL {xp?.nivel ?? '–'}
      </div>
      <button
        type="button"
        aria-label="Notificações"
        aria-expanded={notifOpen}
        className={notifOpen ? `${styles.bell} ${styles.open}` : styles.bell}
        onClick={onToggleNotif}
      >
        <Icon name="notifications" size={21} />
        <span className={styles.unread} />
      </button>
      <button
        type="button"
        aria-expanded={accountOpen}
        className={accountOpen ? `${styles.account} ${styles.open}` : styles.account}
        onClick={onToggleAccount}
      >
        <Avatar size={32} iconSize={19} level={xp?.nivel} foto={urlDaFoto(perfil?.foto)} />
        <span className={styles.who}>
          <span className={styles.nick}>{perfil?.apelido}</span>
          {xp && (
            <span className={styles.rank}>
              {posicao ? `${posicao}º · ` : ''}
              {xpEmTexto(xp.xp_temporada)} XP
            </span>
          )}
        </span>
        <Icon name={accountOpen ? 'expand_less' : 'expand_more'} size={19} color="var(--muted)" />
      </button>
    </header>
  );
}
