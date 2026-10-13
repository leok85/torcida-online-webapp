import { Navigate } from 'react-router-dom';
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
