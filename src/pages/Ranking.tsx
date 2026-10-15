import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { Crest } from '../components/ui/Crest';
import { Segmented } from '../components/ui/Segmented';
import { FLAG } from '../data/common';
import { useCarga } from '../data/useCarga';
import { useMeuXp } from '../xp/MeuXp';
import { buscarRanking, xpEmTexto, type LinhaDoRanking, type PeriodoDoRanking } from '../data/xp';
import ui from '../styles/ui.module.css';
import styles from './Ranking.module.css';

type Scope = 'mundo' | 'pais';

const PODIUM: Record<number, string> = { 1: '#C8901A', 2: '#8E9BAB', 3: '#CE9264' };

const COUNTRY_CODES: Record<string, string> = { Brasil: 'br', Argentina: 'ar', Espanha: 'es', Inglaterra: 'gb-eng', Itália: 'it', Chile: 'cl', Portugal: 'pt' };

type Club = { pos: string; name: string; country: string; fans: string; delta: string; mine?: boolean };

const WORLD: Club[] = [
  { pos: '1º', name: 'Clube Aurora', country: 'Argentina', fans: '48,2 M', delta: '+120 mil' },
  { pos: '2º', name: 'Clube Meridiano', country: 'Espanha', fans: '41,7 M', delta: '+96 mil' },
  { pos: '3º', name: 'Clube Boreal', country: 'Inglaterra', fans: '39,4 M', delta: '+88 mil' },
  { pos: '4º', name: 'Clube Litoral', country: 'Brasil', fans: '34,1 M', delta: '+141 mil' },
  { pos: '5º', name: 'Clube Vertente', country: 'Itália', fans: '30,8 M', delta: '+52 mil' },
  { pos: '6º', name: 'Clube B', country: 'Brasil', fans: '28,6 M', delta: '+204 mil', mine: true },
];

const BRAZIL: Club[] = [
  { pos: '1º', name: 'Clube Litoral', country: 'Brasil', fans: '34,1 M', delta: '+141 mil' },
  { pos: '2º', name: 'Clube B', country: 'Brasil', fans: '28,6 M', delta: '+204 mil', mine: true },
  { pos: '3º', name: 'Clube Sertão', country: 'Brasil', fans: '21,3 M', delta: '+77 mil' },
  { pos: '4º', name: 'Clube Serra', country: 'Brasil', fans: '18,7 M', delta: '+45 mil' },
  { pos: '5º', name: 'Clube Cerrado', country: 'Brasil', fans: '15,2 M', delta: '+38 mil' },
  { pos: '6º', name: 'Clube Baía', country: 'Brasil', fans: '12,9 M', delta: '+29 mil' },
];

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
  const [scope, setScope] = useState<Scope>('pais');
  const clubs = scope === 'mundo' ? WORLD : BRAZIL;
  const { xp } = useMeuXp();
  const clube = perfil?.time_id ?? null;
  // Relido junto com o XP, para a minha linha não ficar para trás.
  const versao = xp === undefined ? null : String(xp?.xp_total);
  const linhas = useCarga(clube && versao ? `${period}:${clube}:${versao}` : null, (chave) =>
    buscarRanking(chave.split(':')[0] as PeriodoDoRanking, Number(chave.split(':')[1])),
  ).dados;
  const eu = linhas?.find((l) => l.eu);
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
                  { id: 'pais', label: 'Brasil' },
                ]}
                value={scope}
                onChange={setScope}
              />
            </div>
            {clubs.map((c) => (
              <div key={c.pos} className={c.mine ? `${styles.club} ${styles.me}` : styles.club}>
                <span className={styles.clubPos}>{c.pos}</span>
                <Crest width={30} height={34} />
                <div className={styles.clubInfo}>
                  <div className={styles.clubName}>{c.name}</div>
                  <div className={styles.country}>
                    <img src={FLAG(COUNTRY_CODES[c.country] ?? 'br')} alt="" className={styles.flag} />
                    {c.country}
                  </div>
                </div>
                <div className={styles.fans}>
                  {c.fans}
                  <div className={styles.delta}>{c.delta}</div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
