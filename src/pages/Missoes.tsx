import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import { inicioDaSemana } from '../data/semana';
import { useCarga } from '../data/useCarga';
import { buscarMissoes, buscarPresenca, tempoRestante, xpEmTexto, type Missao } from '../data/xp';
import { useMeuXp } from '../xp/MeuXp';
import ui from '../styles/ui.module.css';
import styles from './Missoes.module.css';

/** Meta do XP da semana no card escuro (pacote ouro do design). */
const META_DA_SEMANA = 2000;
const DIA_MS = 86_400_000;
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const diaEmBrasilia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

const FRASE_DO_TIPO: Record<Missao['tipo'], string> = { semanal: '', por_jogo: ' · num jogo', continua: ' · sem prazo' };

/** Os 7 dias da semana: feito (check), hoje (contorno azul), domingo (pacote) ou ainda por vir. */
function diasDaSemana(feitos: string[], agora = new Date()) {
  const segunda = inicioDaSemana(agora);
  const hoje = diaEmBrasilia(agora);
  return DIAS.map((dia, i) => {
    const data = diaEmBrasilia(new Date(segunda.getTime() + i * DIA_MS + 12 * 3_600_000));
    if (feitos.includes(data)) return { dia, bg: '#3FA414', border: '0', color: '#FFFFFF', icon: 'check', feito: true };
    if (data === hoje) return { dia, bg: '#EEF4FD', border: '1.5px solid #00419B', color: '#00419B', icon: 'today', feito: false };
    if (i === 6) return { dia, bg: '#FFF4D6', border: '1.5px dashed #E7C05A', color: '#C8901A', icon: 'inventory_2', feito: false };
    return { dia, bg: '#EBF0F6', border: '0', color: '#CBD5E1', icon: 'circle', feito: false };
  });
}

export function Missoes() {
  const navigate = useNavigate();
  const { xp } = useMeuXp();
  // Relidas junto com o XP: cada crédito (inclusive o login do dia) muda o progresso.
  const versao = xp === undefined ? null : String(xp?.xp_total);
  const missoes = useCarga(versao, buscarMissoes).dados;
  const presenca = useCarga(versao, buscarPresenca).dados;
  const semana = xp?.xp_semana ?? 0;
  const fim = new Date(inicioDaSemana().getTime() + 7 * DIA_MS);

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Missões da semana</h2>
        <span className={ui.pageSub}>reinicia segunda 00:00 · {tempoRestante(fim)}</span>
      </div>
      <div className={styles.grid}>
        <div className={styles.list}>
          {missoes?.length === 0 && (
            <div className={styles.vazio}>
              <Icon name="flag" size={26} color="var(--muted)" />
              <strong>Nenhuma missão nesta semana</strong>
              <span>A equipe publica as missões aqui. Enquanto isso, palpites, chat, notas e fotos já rendem XP.</span>
            </div>
          )}
          {missoes?.map((m) => {
            const feita = !!m.concluida_em;
            return (
              <div key={m.id} className={feita ? `${styles.mission} ${styles.done}` : styles.mission}>
                <div className={styles.badge}>
                  <Icon name={feita ? 'check' : m.icone} size={22} />
                </div>
                <div className={styles.body}>
                  {m.titulo}
                  <span className={styles.regra}>
                    {m.regra}
                    {FRASE_DO_TIPO[m.tipo]}
                  </span>
                  <Progress
                    value={`${(m.progresso / m.meta) * 100}%`}
                    height={7}
                    track="#fff"
                    square
                    fill={feita ? 'var(--green)' : 'var(--primary)'}
                    className={styles.bar}
                  />
                </div>
                <div className={styles.right}>
                  {feita ? 'feita' : `${m.progresso}/${m.meta}`}
                  <div className={styles.xp}>+{xpEmTexto(m.xp)} XP</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.stack}>
          <section className={ui.cardDark}>
            <div className={styles.weekHead}>
              <div className={styles.weekLabel}>XP da semana</div>
              <div className={styles.weekValue}>
                {xpEmTexto(semana)} / {xpEmTexto(META_DA_SEMANA)}
              </div>
            </div>
            <Progress value={`${Math.min(semana / META_DA_SEMANA, 1) * 100}%`} height={14} track="rgba(255,255,255,.14)" fill="var(--xp-gradient-green)" />
            <div className={styles.pack}>
              <div className={styles.packIcon}>
                <Icon name="inventory_2" size={23} color="#F7F9FB" />
              </div>
              <div className={styles.packText}>
                {semana >= META_DA_SEMANA ? (
                  'Pacote ouro garantido nesta semana.'
                ) : (
                  <>
                    <strong>{xpEmTexto(META_DA_SEMANA - semana)} XP</strong> para o pacote ouro.
                  </>
                )}
              </div>
            </div>
            <button type="button" className={styles.open} onClick={() => navigate('/loja')}>
              Abrir pacote
            </button>
          </section>
          <section className={ui.card} aria-label="Sequência de login">
            <div className={styles.streakHead}>
              <h3 className={ui.title}>Sequência de login</h3>
              <div className={styles.streak}>
                <Icon name="local_fire_department" size={17} />
                {presenca ? `${presenca.sequencia} ${presenca.sequencia === 1 ? 'dia' : 'dias'}` : '–'}
              </div>
            </div>
            <div className={styles.days}>
              {diasDaSemana(presenca?.dias ?? []).map((d) => (
                <div key={d.dia} className={styles.day} aria-label={d.feito ? `${d.dia}: entrou` : d.dia}>
                  <div className={styles.dayBox} style={{ background: d.bg, border: d.border }}>
                    <Icon name={d.icon} size={19} color={d.color} />
                  </div>
                  {d.dia}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
