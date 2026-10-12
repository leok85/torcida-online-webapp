// "Usar minha localização" do onboarding: posição do navegador → cidade, pela geocodificação reversa
// gratuita da BigDataCloud (feita para uso direto no navegador, sem chave). Só roda quando a pessoa clica.

import type { ValorCidade } from '../components/form/CampoCidade';
import { buscarCidades, rotuloCidade, semAcento } from './cidades';

const GEOCODIFICACAO = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

function posicaoAtual() {
  return new Promise<GeolocationPosition>((resolver, rejeitar) => {
    if (!navigator.geolocation) return rejeitar(new Error('sem_geolocalizacao'));
    navigator.geolocation.getCurrentPosition(resolver, rejeitar, { timeout: 10_000, maximumAge: 600_000 });
  });
}

/** Nome da cidade e sigla do estado/província (ex.: "Florianópolis" e "SC"), quando houver. */
export async function cidadeAtual(): Promise<{ nome: string; regiao: string | null }> {
  const { coords } = await posicaoAtual();
  const url = `${GEOCODIFICACAO}?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=pt`;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error('falha_na_geocodificacao');
  const dados: { city?: string; locality?: string; principalSubdivisionCode?: string } = await resposta.json();
  const cidade = dados.city || dados.locality;
  if (!cidade) throw new Error('cidade_desconhecida');
  // principalSubdivisionCode vem como "BR-SC"; a sigla só ajuda quando é curta.
  const uf = dados.principalSubdivisionCode?.split('-')[1];
  return { nome: cidade, regiao: uf && uf.length <= 3 ? uf : null };
}

/**
 * Cidade do torcedor pela localização. Com catálogo (Brasil), acha o município com o mesmo nome e estado;
 * sem, devolve o texto livre. Falha se não descobrir a cidade ou se ela não estiver no catálogo.
 */
export async function cidadeDaLocalizacao(pais: string, comCatalogo: boolean): Promise<ValorCidade> {
  const local = await cidadeAtual();
  if (!comCatalogo) return { texto: rotuloCidade(local), cidade: null };
  // Limite maior: nomes comuns ("São José", "Bom Jesus") se repetem em vários estados.
  const achadas = await buscarCidades(local.nome, pais, 20);
  const certa = achadas.find((c) => semAcento(c.nome) === semAcento(local.nome) && (!local.regiao || c.regiao === local.regiao));
  if (!certa) throw new Error('fora_do_catalogo');
  return { texto: rotuloCidade(certa), cidade: certa };
}
