import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Alert } from '../../components/form/Alert';
import { Button } from '../../components/form/Button';
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

/** Lado da área de ajuste e diâmetro do círculo, em px. */
const AREA = 300;
const DIAMETRO = 260;
const PASSO_DO_ZOOM = 0.25;
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

  function rolar(e: WheelEvent<HTMLDivElement>) {
    mudarZoom(zoom - e.deltaY * 0.002);
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

  const imagemNaArea = tamanho ? estiloDaImagem(tamanho, pos, zoom, DIAMETRO, DIAMETRO) : null;
  const borda = (AREA - DIAMETRO) / 2;

  return (
    <Modal
      titulo="Ajustar foto"
      subtitulo="Arraste para posicionar e use o zoom para enquadrar."
      onFechar={salvando ? () => undefined : onCancelar}
      largura={460}
      rodape={
        <>
          <Button variant="neutral" fullWidth={false} onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
          <Button fullWidth={false} onClick={salvar} loading={salvando} disabled={!tamanho}>
            Salvar foto
          </Button>
        </>
      }
    >
      <div className={styles.recorte}>
        <div
          className={arrastando ? `${styles.area} ${styles.arrastando}` : styles.area}
          style={{ width: AREA, height: AREA }}
          onPointerDown={apertar}
          onPointerMove={arrastar}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onWheel={rolar}
          onKeyDown={teclado}
          tabIndex={0}
          role="group"
          aria-label="Área de ajuste da foto. Use as setas para mover."
        >
          <img
            ref={imgRef}
            src={imagem}
            alt="Foto escolhida"
            className={styles.imagem}
            onLoad={carregou}
            draggable={false}
            style={imagemNaArea ? { ...imagemNaArea, left: imagemNaArea.left + borda, top: imagemNaArea.top + borda } : { opacity: 0 }}
          />
          <div className={styles.mascara} style={{ width: DIAMETRO, height: DIAMETRO, left: borda, top: borda }}>
            {arrastando && <div className={styles.grade} aria-hidden="true" />}
          </div>
        </div>

        <div className={styles.zoom}>
          <button type="button" className={styles.lupa} aria-label="Diminuir zoom" onClick={() => mudarZoom(zoom - PASSO_DO_ZOOM)} disabled={zoom <= ZOOM_MIN}>
            <Icon name="zoom_out" size={20} />
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
            <Icon name="zoom_in" size={20} />
          </button>
        </div>

        <div className={styles.previas}>
          {tamanho &&
            [56, 36].map((lado) => (
              <div key={lado} className={styles.previa}>
                <div className={styles.previaCirculo} style={{ width: lado, height: lado }}>
                  <img src={imagem} alt="" className={styles.imagem} style={estiloDaImagem(tamanho, pos, zoom, DIAMETRO, lado)} draggable={false} />
                </div>
                <span>{lado === 56 ? 'Perfil' : 'Chat'}</span>
              </div>
            ))}
          <button type="button" className={styles.trocar} onClick={onTrocarImagem} disabled={salvando}>
            <Icon name="image" size={16} />
            Trocar imagem
          </button>
        </div>

        {erro && <Alert>{erro}</Alert>}
      </div>
    </Modal>
  );
}
