import { useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { Progress } from '../components/ui/Progress';
import { Segmented } from '../components/ui/Segmented';
import { Striped } from '../components/ui/Striped';
import ui from '../styles/ui.module.css';
import styles from './Loja.module.css';
import { useMeuXp } from '../xp/MeuXp';
import { xpEmTexto } from '../data/xp';

type Tab = 'produtos' | 'dinheiro';

const PRODUCTS = [
  { name: 'Camisa I 2026', price: '1.200', unlocked: false, gate: '30.000 torcedores' },
  { name: 'Caneca da torcida', price: '380', unlocked: true, gate: 'liberado em 1.000' },
  { name: 'Boné bordado', price: '420', unlocked: true, gate: 'liberado em 10.000' },
  { name: 'Ingresso arquibancada', price: '2.000', unlocked: false, gate: '50.000 torcedores' },
];

const BALANCE = 440;
const MIN_WITHDRAW = 500;

export function Loja() {
  const { xp } = useMeuXp();
  const [tab, setTab] = useState<Tab>('produtos');
  const brl = (BALANCE / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className={styles.page}>
      <div className={ui.pageHead}>
        <h2 className={ui.pageTitle}>Troca de moedas</h2>
        <span className={ui.pageSub}>moedas viram produto do clube ou dinheiro</span>
        <div className={ui.spacer} />
        <div className={styles.balance}>
          <Icon name="monetization_on" size={20} />
          {BALANCE}
        </div>
      </div>

      <div className={styles.grid}>
        <div>
          <Segmented
            size="lg"
            className={styles.tabs}
            options={[
              { id: 'produtos', label: 'Produtos do clube' },
              { id: 'dinheiro', label: 'Dinheiro' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'produtos' ? (
            <div className={styles.products}>
              {PRODUCTS.map((p) => (
                <article key={p.name} className={styles.product}>
                  <Striped height={150} />
                  <div className={styles.productBody}>
                    <div className={styles.productName}>{p.name}</div>
                    <div className={styles.priceRow}>
                      <div className={styles.price}>
                        <Icon name="monetization_on" size={16} color="var(--gold)" />
                        {p.price}
                      </div>
                      <Icon name={p.unlocked ? 'check_circle' : 'lock'} size={19} color={p.unlocked ? 'var(--green)' : 'var(--line-3)'} />
                    </div>
                    <div className={styles.lock}>
                      <Icon name="groups" size={13} />
                      {p.gate}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.money}>
              <section className={styles.box}>
                <h3 className={styles.boxTitle}>Converter em dinheiro</h3>
                <p className={styles.boxText}>100 moedas = R$ 1,00. Saque mínimo de {MIN_WITHDRAW} moedas.</p>
                <div className={styles.convert}>
                  <div className={styles.convertSide}>
                    <div className={styles.convertValue}>
                      <Icon name="monetization_on" size={20} color="var(--gold)" />
                      {BALANCE}
                    </div>
                    <div className={styles.convertLabel}>seu saldo</div>
                  </div>
                  <Icon name="arrow_forward" size={24} color="var(--line-3)" />
                  <div className={styles.convertSide}>
                    <div className={styles.convertMoney}>{brl}</div>
                    <div className={styles.convertLabel}>equivalente</div>
                  </div>
                </div>
                {BALANCE < MIN_WITHDRAW && (
                  <div className={styles.minimum}>
                    <Icon name="info" size={18} color="var(--gold)" />
                    <div>Faltam {MIN_WITHDRAW - BALANCE} moedas para o saque mínimo.</div>
                  </div>
                )}
                <button type="button" className={styles.withdraw} disabled={BALANCE < MIN_WITHDRAW}>
                  Solicitar saque
                </button>
              </section>
              <section className={styles.box}>
                <h3 className={styles.keyTitle}>Chave de recebimento</h3>
                <input className={styles.key} defaultValue="rafael@email.com" aria-label="Chave pix" />
                <div className={styles.keyHint}>chave pix · pagamento em até 5 dias úteis</div>
              </section>
            </div>
          )}
        </div>

        <div className={styles.stack}>
          <section className={styles.pack}>
            <div className={styles.packLabel}>Pacote da semana</div>
            <div className={styles.packIcon}>
              <Icon name="inventory_2" size={56} color="#F7F9FB" />
            </div>
            <div className={styles.packName}>Pacote prata</div>
            <p className={styles.packText}>{xpEmTexto(xp?.xp_semana ?? 0)} XP na semana. Dentro vem XP, moedas ou os dois.</p>
            <button type="button" className={styles.packBtn}>
              Abrir pacote
            </button>
          </section>
          <section className={ui.card}>
            <h3 className={styles.unlockTitle}>Próximo desbloqueio</h3>
            <div className={styles.unlock}>
              <div className={styles.unlockIcon}>
                <Icon name="checkroom" size={23} color="var(--primary)" />
              </div>
              <div>
                <div className={styles.unlockName}>Camisa oficial</div>
                <div className={styles.unlockMeta}>1.360 torcedores para liberar</div>
              </div>
            </div>
            <Progress value="95%" />
            <div className={styles.scale}>
              <span>28.640</span>
              <span>30.000</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
