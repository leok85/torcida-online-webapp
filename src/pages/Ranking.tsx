import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { Crest } from '../components/ui/Crest';
import { Segmented } from '../components/ui/Segmented';
import { FLAG } from '../data/common';
import { useCarga } from '../data/useCarga';
import { useMeuXp } from '../xp/MeuXp';
import { buscarMaioresTorcidas, torcidaEmTexto, type EscopoDaTorcida } from '../data/torcidas';
import { buscarRanking, xpEmTexto, type LinhaDoRanking, type PeriodoDoRanking } from '../data/xp';
import ui from '../styles/ui.module.css';
import styles from './Ranking.module.css';

const PODIUM: Record<number, string> = { 1: '#C8901A', 2: '#8E9BAB', 3: '#CE9264' };

const PERIODS: { id: PeriodoDoRanking; label: string }[] = [
  { id: 'temporada', label: 'temporada' },
  { id: 'mes', label: 'mês' },
  { id: 'semana', label: 'semana' },
];

const NO_PERIODO: Record<PeriodoDoRanking, string> = { temporada: 'nesta temporada', mes: 'neste mês', semana: 'nesta semana' };

/** "5.910 XP · faltam 281 para o 11º": quanto falta para passar quem está logo acima. */
function minhaMeta(eu: LinhaDoRanking, linhas: LinhaDoRanking[]) {
  const acima = linhas.filter((l) => l.posicao < eu.posicao).at(-1);
  if (eu.posicao === 1) return `${xpEmTexto(eu.xp)} XP · você lidera a torcida`;
  if (!acima) return `${xpEmTexto(eu.xp)} XP`;
  return `${xpEmTexto(eu.xp)} XP · faltam ${xpEmTexto(acima.xp - eu.xp + 1)} para o ${acima.posicao}º`;
}

export function Ranking() {
  const { perfil } = useAuth();
  const [period, setPeriod] = useState<PeriodoDoRanking>('temporada');
  const [scope, setScope] = useState<EscopoDaTorcida>('pais');
  const { xp } = useMeuXp();
  const clube = perfil?.time_id ?? null;
  // Relido junto com o XP, para a minha linha não ficar para trás.
  const versao = xp === undefined ? null : String(xp?.xp_total);
  const linhas = useCarga(clube && versao ? `${period}:${clube}:${versao}` : null, (chave) =>
    buscarRanking(chave.split(':')[0] as PeriodoDoRanking, Number(chave.split(':')[1])),
  ).dados;
  const eu = linhas?.find((l) => l.eu);
  const torcidas = useCarga(clube ? `torcidas:${clube}` : null, () => buscarMaioresTorcidas());
  const clubs = torcidas.dados?.filter((c) => c.escopo === scope);
  const meuPais = torcidas.dados?.find((c) => c.escopo === 'pais' && c.meu)?.pais_nome ?? 'País';
  const ano = new Date().getFullYear();

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Ranking</h2>
        <span className={ui.pageSub}>
          temporada {ano} · zera em 1 jan
        </span>
      </div>
      <div className={styles.grid}>
        <section className={ui.cardFlush}>
          <div className={styles.headRow}>
            <h3 className={ui.titleLg}>Torcedores do {perfil?.clube?.nome}</h3>
            <Segmented options={PERIODS} value={period} onChange={setPeriod} className={styles.tabsCap} />
          </div>
          <div className={ui.tableHead}>
            <span className={styles.colPos}>#</span>
            <span className={styles.colAvatar} />
            <span className={styles.colName}>torcedor</span>
            <span className={styles.colNum}>xp</span>
            <span className={styles.colNum}>nível</span>
          </div>
          {linhas?.length === 0 && <p className={styles.vazio}>Ninguém da torcida ganhou XP {NO_PERIODO[period]}.</p>}
          {linhas?.map((r) => (
            <div key={r.usuario_id} className={r.eu ? `${styles.row} ${styles.me}` : styles.row}>
              <span className={styles.pos} style={PODIUM[r.posicao] ? { color: PODIUM[r.posicao] } : undefined}>
                {r.posicao}º
              </span>
              <Avatar size={34} iconSize={19} />
              <span className={styles.colName}>{r.eu ? `Você · ${r.apelido}` : r.apelido}</span>
              <span className={styles.xp}>{xpEmTexto(r.xp)}</span>
              <span className={styles.lvl}>nv {r.nivel}</span>
            </div>
          ))}
        </section>

        <div className={styles.stack}>
          <section className={styles.mine}>
            <div className={styles.minePos}>{eu ? `${eu.posicao}º` : '–'}</div>
            <div>
              <div className={styles.mineTitle}>Sua posição na torcida</div>
              <div className={styles.mineMeta}>{eu && linhas ? minhaMeta(eu, linhas) : linhas ? `Sem XP ${NO_PERIODO[period]}` : ''}</div>
            </div>
          </section>
          <section className={ui.cardFlush}>
            <div className={styles.headRowSm}>
              <h3 className={ui.title}>Maiores torcidas</h3>
              <Segmented
                size="xs"
                options={[
                  { id: 'mundo', label: 'Mundo' },
                  { id: 'pais', label: meuPais },
                ]}
                value={scope}
                onChange={setScope}
              />
            </div>
            {torcidas.erro && <p className={styles.vazio}>Não deu para carregar as torcidas agora.</p>}
            {clubs?.map((c) => (
              <div key={c.clube_id} className={c.meu ? `${styles.club} ${styles.me}` : styles.club} aria-current={c.meu ? 'true' : undefined}>
                <span className={styles.clubPos}>{c.posicao}º</span>
                <Crest width={30} height={34} clubeId={c.clube_id} />
                <div className={styles.clubInfo}>
                  <div className={styles.clubName}>{c.nome}</div>
                  <div className={styles.country}>
                    <img src={FLAG(c.bandeira)} alt="" className={styles.flag} />
                    {c.pais_nome}
                  </div>
                </div>
                <div className={styles.fans}>
                  {torcidaEmTexto(c.torcedores)}
                  <div className={styles.delta}>{c.novos_na_semana > 0 ? `+${torcidaEmTexto(c.novos_na_semana)} na semana` : ''}</div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
