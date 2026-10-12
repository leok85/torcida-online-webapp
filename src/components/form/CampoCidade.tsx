import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { buscarCidades, rotuloCidade, type Cidade } from "../../data/cidades";
import { TextField } from "./TextField";
import styles from "./CampoCidade.module.css";

export type ValorCidade = { texto: string; cidade: Cidade | null };

type BuscaProps = {
  valor: ValorCidade;
  onChange: (valor: ValorCidade) => void;
  /** Com catálogo (Brasil), a pessoa escolhe uma cidade da lista; sem, o texto livre vale. */
  comCatalogo: boolean;
  pais: string;
};

/**
 * Autocompletar de cidade (combobox): busca no catálogo com debounce, setas, Enter e Esc.
 * Devolve as props do input e a lista de sugestões, para cada tela desenhar a caixa do seu jeito.
 */
export function useBuscaDeCidade({ valor, onChange, comCatalogo, pais }: BuscaProps) {
  const listaId = useId();
  const [sugestoes, setSugestoes] = useState<{
    termo: string;
    cidades: Cidade[];
  } | null>(null);
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(0);
  const termo = valor.texto.trim();
  const buscar = comCatalogo && !valor.cidade && termo.length >= 2;

  useEffect(() => {
    if (!buscar) return;
    let ativo = true;
    const t = window.setTimeout(() => {
      buscarCidades(termo, pais).then(
        (cidades) => ativo && setSugestoes({ termo, cidades }),
        () => ativo && setSugestoes({ termo, cidades: [] }),
      );
    }, 250);
    return () => {
      ativo = false;
      window.clearTimeout(t);
    };
  }, [buscar, termo, pais]);

  const atuais =
    buscar && sugestoes?.termo === termo ? sugestoes.cidades : null;
  const mostrar = aberta && !!atuais?.length;

  function escolher(cidade: Cidade) {
    onChange({ texto: rotuloCidade(cidade), cidade });
    setAberta(false);
  }

  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (!mostrar) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setAtiva((i) => (i + passo + atuais.length) % atuais.length);
    } else if (e.key === "Enter") {
      // Enter escolhe a sugestão em vez de enviar o formulário.
      e.preventDefault();
      escolher(atuais[ativa]);
    } else if (e.key === "Escape") {
      setAberta(false);
    }
  }

  const input = {
    value: valor.texto,
    onChange: (e: { target: { value: string } }) => {
      onChange({ texto: e.target.value, cidade: null });
      setAberta(true);
      setAtiva(0);
    },
    onKeyDown: teclado,
    onBlur: () => setAberta(false),
    onFocus: () => setAberta(true),
    autoComplete: "off",
    maxLength: 80,
    role: comCatalogo ? "combobox" : undefined,
    "aria-autocomplete": comCatalogo ? ("list" as const) : undefined,
    "aria-expanded": comCatalogo ? mostrar : undefined,
    "aria-controls": comCatalogo ? listaId : undefined,
    "aria-activedescendant": mostrar ? `${listaId}-${ativa}` : undefined,
  };

  const lista: ReactNode = mostrar && (
    <div className={styles.ancora}>
      <ul id={listaId} role="listbox" aria-label="Cidades" className={styles.lista}>
        {atuais.map((c, i) => (
          <li
            key={c.id}
            id={`${listaId}-${i}`}
            role="option"
            aria-selected={i === ativa}
            className={i === ativa ? `${styles.opcao} ${styles.ativa}` : styles.opcao}
            // mousedown para escolher antes do blur do campo fechar a lista.
            onMouseDown={(e) => {
              e.preventDefault();
              escolher(c);
            }}
            onMouseEnter={() => setAtiva(i)}
          >
            <span>{c.nome}</span>
            {c.regiao && <span className={styles.uf}>{c.regiao}</span>}
          </li>
        ))}
      </ul>
    </div>
  );

  return { input, lista, semResultado: atuais?.length === 0 };
}

type CampoCidadeProps = BuscaProps & {
  label: string;
  error?: string | null;
  disabled?: boolean;
};

/** Campo de cidade com autocompletar (combobox) nos países que têm cidades no catálogo. */
export function CampoCidade({ label, valor, onChange, comCatalogo, pais, error, disabled }: CampoCidadeProps) {
  const { input, lista, semResultado } = useBuscaDeCidade({ valor, onChange, comCatalogo, pais });
  const hint = comCatalogo && semResultado
    ? "Nenhuma cidade encontrada com esse nome."
    : "Mostra de onde vem a torcida do clube. Não aparece no seu perfil.";

  return (
    <TextField
      label={label}
      icon="search"
      placeholder={comCatalogo ? "Digite e escolha na lista" : "Ex.: Buenos Aires"}
      disabled={disabled}
      error={error}
      hint={hint}
      {...input}
      below={lista}
    />
  );
}
