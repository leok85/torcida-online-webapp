import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import { Striped } from '../components/ui/Striped';
import { useCarga } from '../data/useCarga';
import { buscarMissoes, buscarRanking, xpEmTexto } from '../data/xp';
import { useMeuXp } from '../xp/MeuXp';
import ui from '../styles/ui.module.css';
import { CardPartida } from './CardPartida';
import styles from './Inicio.module.css';

const VERDE = '#3FA414';
const AZUL = '#00419B';

const NEWS = [
  { title: 'Meia titular volta de suspensão e deve começar jogando', when: 'há 2 h' },
  { title: 'Clube encaminha renovação do lateral-direito até 2029', when: 'há 6 h' },
  { title: 'Sub-20 vence e garante vaga na semifinal estadual', when: 'há 1 d' },
];

export function Inicio() {
  const { perfil } = useAuth();
  const { xp } = useMeuXp();
  const clube = perfil?.time_id ?? null;
  // Missões e ranking são relidos junto com o XP (cada crédito pode mudar os dois).
  const versao = xp === undefined ? null : String(xp?.xp_total);
  const missoes = useCarga(versao, buscarMissoes).dados;
  // Top 3 da torcida e a minha linha, se eu estiver fora.
  const ranking = useCarga(clube && versao ? `${clube}:${versao}` : null, (c) => buscarRanking('temporada', Number(c.split(':')[0]), 3)).dados;
  const falta = xp ? xp.xp_do_nivel - xp.xp_no_nivel : 0;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <CardPartida clubeNome={perfil?.clube?.nome ?? 'seu clube'} />

        <div className={styles.stack}>
          <section className={ui.card}>
            <div className={styles.level}>
              <div className={styles.ring}>
                <div className={styles.ringInner}>
                  <div className={styles.ringValue}>{xp?.nivel ?? '–'}</div>
                  <div className={styles.ringLabel}>NÍVEL</div>
                </div>
              </div>
              <div className={styles.levelInfo}>
                <div className={styles.levelXp}>{xp ? `${xpEmTexto(xp.xp_no_nivel)} / ${xpEmTexto(xp.xp_do_nivel)} XP` : '– XP'}</div>
                <Progress value={xp ? `${(xp.xp_no_nivel / xp.xp_do_nivel) * 100}%` : '0%'} />
                <div className={styles.levelNext}>{xp ? `${xpEmTexto(falta)} XP para o nível ${xp.nivel + 1}` : ''}</div>
              </div>
            </div>
          </section>
          <section className={ui.card}>
            <div className={styles.cardHead}>
              <h3 className={ui.title}>Missões da semana</h3>
              <Link to="/missoes">ver todas</Link>
            </div>
            <div className={styles.missions}>
              {missoes?.length === 0 && <p className={styles.vazio}>Nenhuma missão nesta semana.</p>}
              {missoes?.slice(0, 3).map((m) => {
                const feita = !!m.concluida_em;
                const cor = feita ? VERDE : AZUL;
                return (
                  <div key={m.id} className={styles.mission}>
                    <Icon name={feita ? 'task_alt' : m.icone} size={19} color={cor} />
                    <div className={styles.missionBody}>
                      {m.titulo}
                      <Progress value={`${(m.progresso / m.meta) * 100}%`} height={5} fill={cor} square className={styles.missionBar} />
                    </div>
                    <span className={styles.frac}>
                      {m.progresso}/{m.meta}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div className={styles.bottom}>
        <section className={ui.card}>
          <h3 className={styles.cardTitle}>Notícias do clube</h3>
          {NEWS.map((n) => (
            <div key={n.title} className={styles.news}>
              <Striped width={66} height={52} stripe={6} radius={8} />
              <div>
                <div className={styles.newsTitle}>{n.title}</div>
                <div className={styles.when}>{n.when}</div>
              </div>
            </div>
          ))}
        </section>
        <section className={ui.card}>
          <h3 className={styles.cardTitle}>Ranking da torcida</h3>
          {ranking?.length === 0 && <p className={styles.vazio}>Ninguém da torcida pontuou ainda nesta temporada.</p>}
          {ranking?.map((r) => (
            <div key={r.usuario_id} className={r.eu ? `${styles.rankRow} ${styles.me}` : styles.rankRow}>
              <span className={styles.rankPos}>{r.posicao}º</span>
              <Avatar size={28} iconSize={17} />
              <span className={styles.rankName}>{r.eu ? `Você · ${r.apelido}` : r.apelido}</span>
              <span className={styles.rankXp}>{xpEmTexto(r.xp)}</span>
            </div>
          ))}
        </section>
        <section className={ui.card}>
          <h3 className={styles.cardTitle}>Próximos compromissos</h3>
          <div className={styles.agenda}>
            <div className={styles.event}>
              <Icon name="sports_soccer" size={20} color="var(--primary)" />
              <div>
                <div className={styles.eventTitle}>Clube B x Clube Serra</div>
                <div className={styles.eventSub}>Copa · quartas, qua 21:30</div>
              </div>
            </div>
            <div className={styles.eventBlue}>
              <Icon name="groups" size={20} color="var(--primary)" />
              <div>
                <div className={styles.eventTitle}>Bar do Zé · assistir junto</div>
                <div className={styles.eventSub}>você confirmou · 12 torcedores</div>
              </div>
            </div>
            <div className={styles.eventGold}>
              <Icon name="inventory_2" size={20} color="var(--gold)" />
              <div>
                <div className={styles.eventTitle}>Pacote prata para abrir</div>
                <div className={styles.eventSub}>fecha domingo 23:59</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
