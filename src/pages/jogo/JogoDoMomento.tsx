import { Navigate } from 'react-router-dom';
import { janelaDaFoto } from '../../data/janelaDasFotos';
import { jogoDoPalpite } from '../../data/palpite';
import { separarJogos } from '../../data/partidas';
import { useJogosDoClube } from '../../partidas/JogosDoClube';

/** /ao-vivo (links antigos e avisos): abre o jogo do clube em campo ou o último resultado; sem nenhum, a lista de jogos. */
export function JogoDoMomento() {
  const { jogos, erro } = useJogosDoClube();
  if (erro) return <Navigate to="/jogos" replace />;
  if (!jogos) return null;
  const { destaque } = separarJogos(jogos);
  return <Navigate to={destaque ? `/jogo/${destaque.id}` : '/jogos'} replace />;
}

/** /pos-jogo (links antigos): as notas do último jogo encerrado do clube; sem nenhum, a lista de jogos. */
export function NotasDoMomento() {
  const { jogos, erro } = useJogosDoClube();
  if (erro) return <Navigate to="/jogos" replace />;
  if (!jogos) return null;
  const [ultimo] = separarJogos(jogos).resultados;
  return <Navigate to={ultimo ? `/jogo/${ultimo.id}/notas` : '/jogos'} replace />;
}

/** /escalacao (menu antigo e avisos): a escalação e o palpite do próximo jogo do clube; sem nenhum, a lista de jogos. */
export function EscalacaoDoMomento() {
  const { jogos, erro } = useJogosDoClube();
  if (erro) return <Navigate to="/jogos" replace />;
  if (!jogos) return null;
  const proximo = jogoDoPalpite(jogos);
  return <Navigate to={proximo ? `/jogo/${proximo.id}/escalacao` : '/jogos'} replace />;
}

/** /fotos (menu antigo e avisos): o jogo com o envio de fotos aberto; senão o último encerrado; sem nenhum, a lista. */
export function FotosDoMomento() {
  const { jogos, erro } = useJogosDoClube();
  if (erro) return <Navigate to="/jogos" replace />;
  if (!jogos) return null;
  const aberto = jogos.find((p) => janelaDaFoto(p));
  const [ultimo] = separarJogos(jogos).resultados;
  const jogo = aberto ?? ultimo;
  return <Navigate to={jogo ? `/jogo/${jogo.id}/fotos` : '/jogos'} replace />;
}
