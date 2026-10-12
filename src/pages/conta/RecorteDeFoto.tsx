import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Alert } from '../../components/form/Alert';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { LADO_DA_FOTO } from '../../data/conta';
import {
  estiloDaImagem,
  limitarPosicao,
  limitarZoom,
  posicaoComZoom,
  regiaoDoRecorte,
  ZOOM_MAX,
  ZOOM_MIN,
  type Posicao,
  type Tamanho,
} from '../../data/recorte';
import styles from './RecorteDeFoto.module.css';

/** Diâmetro do círculo do recorte, em px (W21). */
const DIAMETRO = 300;
const PASSO_DO_ZOOM = 0.2;
const PASSO_DO_TECLADO = 10;

type RecorteProps = {
  /** URL (object URL) da imagem escolhida. */
  imagem: string;
  onTrocarImagem: () => void;
  onCancelar: () => void;
  /** Recebe a foto quadrada de 512 px já recortada. */
  onSalvar: (foto: Blob) => Promise<void>;
};

/** Desenha o recorte num quadrado de 512 px. WebP quando o navegador gera, senão JPEG. */
function gerarFoto(img: HTMLImageElement, tamanho: Tamanho, pos: Posicao, zoom: number) {
  const tela = document.createElement('canvas');
  tela.width = LADO_DA_FOTO;
  tela.height = LADO_DA_FOTO;
  const ctx = tela.getContext('2d');
  if (!ctx) return Promise.reject(new Error('sem_canvas'));
  const r = regiaoDoRecorte(tamanho, pos, zoom, DIAMETRO);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.x, r.y, r.lado, r.lado, 0, 0, LADO_DA_FOTO, LADO_DA_FOTO);
  return new Promise<Blob>((resolver, rejeitar) =>
    tela.toBlob(
      (webp) => {
        if (webp?.type === 'image/webp') return resolver(webp);
        tela.toBlob((jpeg) => (jpeg ? resolver(jpeg) : rejeitar(new Error('sem_imagem'))), 'image/jpeg', 0.9);
      },
      'image/webp',
      0.9,
    ),
  );
}

/** Imagem posicionada pelo centro, como no W21: o deslocamento é somado ao centro da área. */
function ImagemPosicionada({ src, tamanho, pos, zoom, lado, alt }: { src: string; tamanho: Tamanho; pos: Posicao; zoom: number; lado: number; alt: string }) {
  const e = estiloDaImagem(tamanho, pos, zoom, DIAMETRO, lado);
  const desloc = { x: e.left + e.width / 2 - lado / 2, y: e.top + e.height / 2 - lado / 2 };
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={styles.imagem}
      style={{ width: e.width, height: e.height, transform: `translate(calc(-50% + ${desloc.x}px), calc(-50% + ${desloc.y}px))` }}
    />
  );
}

/**
 * Ajustar foto: arrastar move, o zoom vai de 1x a 3x, e a imagem sempre cobre o círculo.
 * Use key={imagem}: uma imagem nova recomeça no centro e no zoom 1x.
 */
export function RecorteDeFoto({ imagem, onTrocarImagem, onCancelar, onSalvar }: RecorteProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [tamanho, setTamanho] = useState<Tamanho | null>(null);
  const [pos, setPos] = useState<Posicao>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef<{ px: number; py: number; pos: Posicao } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregou() {
    const img = imgRef.current;
    if (img?.naturalWidth) setTamanho({ w: img.naturalWidth, h: img.naturalHeight });
  }

  function mudarZoom(novo: number) {
    if (!tamanho) return;
    const z = limitarZoom(novo);
    setPos((p) => posicaoComZoom(p, tamanho, zoom, z, DIAMETRO));
    setZoom(z);
  }

  function mover(nova: Posicao) {
    if (tamanho) setPos(limitarPosicao(nova, tamanho, zoom, DIAMETRO));
  }

  function apertar(e: PointerEvent<HTMLDivElement>) {
    if (!tamanho) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    inicio.current = { px: e.clientX, py: e.clientY, pos };
    setArrastando(true);
  }

  function arrastar(e: PointerEvent<HTMLDivElement>) {
    const i = inicio.current;
    if (i) mover({ x: i.pos.x + e.clientX - i.px, y: i.pos.y + e.clientY - i.py });
  }

  function soltar() {
    inicio.current = null;
    setArrastando(false);
  }

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const passos: Record<string, Posicao> = {
      ArrowLeft: { x: -PASSO_DO_TECLADO, y: 0 },
      ArrowRight: { x: PASSO_DO_TECLADO, y: 0 },
      ArrowUp: { x: 0, y: -PASSO_DO_TECLADO },
      ArrowDown: { x: 0, y: PASSO_DO_TECLADO },
    };
    const passo = passos[e.key];
    if (!passo) return;
    e.preventDefault();
    mover({ x: pos.x + passo.x, y: pos.y + passo.y });
  }

  async function salvar() {
    if (!tamanho || !imgRef.current) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(await gerarFoto(imgRef.current, tamanho, pos, zoom));
    } catch {
      setErro('Não foi possível salvar a foto agora. Tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <Modal rotulo="Ajustar foto" onFechar={salvando ? () => undefined : onCancelar}>
      <div className={styles.topo}>
        <button type="button" className={styles.fechar} aria-label="Fechar" onClick={onCancelar} disabled={salvando}>
          <Icon name="close" size={20} />
        </button>
        <h2 className={styles.titulo}>Ajustar foto</h2>
        <button type="button" className={styles.salvar} onClick={salvar} disabled={!tamanho || salvando} aria-busy={salvando || undefined}>
          Salvar
        </button>
      </div>

      <div
        className={arrastando ? `${styles.area} ${styles.arrastando}` : styles.area}
        onPointerDown={apertar}
        onPointerMove={arrastar}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onWheel={(e: WheelEvent<HTMLDivElement>) => mudarZoom(zoom - e.deltaY * 0.002)}
        onKeyDown={teclado}
        tabIndex={0}
        role="group"
        aria-label="Área de ajuste da foto. Use as setas para mover."
      >
        {/* A imagem que mede e é desenhada no canvas; até carregar, fica invisível. */}
        <img ref={imgRef} src={imagem} alt="" onLoad={carregou} className={styles.medida} />
        {tamanho && <ImagemPosicionada src={imagem} tamanho={tamanho} pos={pos} zoom={zoom} lado={DIAMETRO} alt="Foto escolhida" />}
        <div className={styles.circulo} style={{ width: DIAMETRO, height: DIAMETRO, margin: -DIAMETRO / 2 }} />
        <div className={styles.grade} style={{ width: DIAMETRO, height: DIAMETRO, margin: -DIAMETRO / 2, opacity: arrastando ? 1 : 0 }} aria-hidden="true">
          <span style={{ left: '33.33%' }} />
          <span style={{ left: '66.66%' }} />
          <span className={styles.horizontal} style={{ top: '33.33%' }} />
          <span className={styles.horizontal} style={{ top: '66.66%' }} />
        </div>
        <div className={styles.dica} aria-hidden="true">
          <span>
            <Icon name="open_with" size={16} />
            Arraste para posicionar
          </span>
        </div>
      </div>

      <div className={styles.controles}>
        <div className={styles.zoom}>
          <button type="button" className={styles.lupa} aria-label="Diminuir zoom" onClick={() => mudarZoom(zoom - PASSO_DO_ZOOM)} disabled={zoom <= ZOOM_MIN}>
            <Icon name="zoom_out" size={19} />
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => mudarZoom(Number(e.target.value))}
            aria-label="Zoom"
            aria-valuetext={`${zoom.toFixed(1).replace('.', ',')}x`}
            className={styles.slider}
          />
          <button type="button" className={styles.lupa} aria-label="Aumentar zoom" onClick={() => mudarZoom(zoom + PASSO_DO_ZOOM)} disabled={zoom >= ZOOM_MAX}>
            <Icon name="zoom_in" size={19} />
          </button>
        </div>

        <div className={styles.previas}>
          {[56, 36].map((lado) => (
            <div key={lado} className={styles.previa} style={{ width: lado, height: lado }}>
              {tamanho && <ImagemPosicionada src={imagem} tamanho={tamanho} pos={pos} zoom={zoom} lado={lado} alt="" />}
            </div>
          ))}
          <div className={styles.previasTexto}>Assim sua foto aparece no perfil, no ranking e no chat.</div>
          <button type="button" className={styles.trocar} onClick={onTrocarImagem} disabled={salvando}>
            Trocar imagem
          </button>
        </div>

        {erro && <Alert>{erro}</Alert>}
      </div>
    </Modal>
  );
}
