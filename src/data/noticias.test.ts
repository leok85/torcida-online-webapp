import { describe, expect, it } from 'vitest';
import { noticiaDeTeste } from '../test/noticiasDeTeste';
import { perfilDeTeste, supabaseFalso } from '../test/supabaseFalso';
import { MENSAGEM_SUSPENSO } from './restricoes';
import { buscarNoticia, buscarNoticias, contarCliqueNoOriginal, erroDaNoticia, iniciais, MENSAGEM_DA_NOTICIA, nomeDoAutor } from './noticias';

describe('notícias: texto, erros e clique no original', () => {
  it('sem apelido, o autor é "Torcedor"', () => {
    expect(nomeDoAutor(null)).toBe('Torcedor');
    expect(nomeDoAutor('  ')).toBe('Torcedor');
    expect(nomeDoAutor('Bia.T')).toBe('Bia.T');
    expect(iniciais(nomeDoAutor(null))).toBe('TO');
  });

  it('tira as iniciais do apelido para o avatar', () => {
    expect(iniciais('Rafa_9')).toBe('RA');
    expect(iniciais('léo.mansur')).toBe('LÉ');
    expect(iniciais('__')).toBe('?');
  });

  it('traduz os hints do banco e manda o resto para falha', () => {
    expect(erroDaNoticia({ hint: 'devagar' })).toBe('devagar');
    expect(MENSAGEM_DA_NOTICIA[erroDaNoticia({ hint: 'suspenso' })]).toBe(MENSAGEM_SUSPENSO);
    expect(erroDaNoticia({ hint: 'outra_coisa' })).toBe('falha');
    expect(erroDaNoticia(null)).toBe('falha');
    // Herdado do Object não é hint conhecido (com `in`, 'toString' passava e a mensagem saía undefined).
    expect(erroDaNoticia({ hint: 'toString' })).toBe('falha');
    expect(erroDaNoticia({ hint: '__proto__' })).toBe('falha');
  });

  it('contar o clique no original não espera nem estoura quando a chamada falha', async () => {
    supabaseFalso.cliente.rpc.mockRejectedValueOnce(new Error('sem conexão'));
    expect(() => contarCliqueNoOriginal('noticia-1')).not.toThrow();
    expect(supabaseFalso.cliente.rpc).toHaveBeenCalledWith('abrir_original', { p_id: 'noticia-1' });
    // A rejeição é engolida: nada de erro não tratado depois do clique.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('id que não é uuid vira "não encontrada" sem chamar o banco', async () => {
    expect(await buscarNoticia('abc')).toBeNull();
    expect(supabaseFalso.cliente.rpc).not.toHaveBeenCalledWith('noticia', expect.anything());
  });

  // Bug do contrato antigo: a busca em lote publica várias no mesmo instante e o cursor só por data perdia as da divisa.
  it('pagina de 1 em 1 sem perder notícias publicadas no mesmo instante', async () => {
    const mesmoInstante = '2026-10-14T12:00:00Z';
    const ids = ['00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000b'];
    for (const id of ids) supabaseFalso.noticias().noticias.push(noticiaDeTeste({ id, publicada_em: mesmoInstante }));
    supabaseFalso.noticias().noticias.push(noticiaDeTeste({ id: '00000000-0000-4000-a000-000000000001', publicada_em: '2026-10-13T12:00:00Z' }));
    supabaseFalso.logar(perfilDeTeste());

    const vistas: string[] = [];
    let depois: Awaited<ReturnType<typeof buscarNoticias>>[number] | null = null;
    for (let i = 0; i < 6; i += 1) {
      const pagina: Awaited<ReturnType<typeof buscarNoticias>> = await buscarNoticias(depois, 1);
      if (!pagina.length) break;
      vistas.push(pagina[0].id);
      depois = pagina[0];
    }
    // Ordem publicada_em desc, id desc: as três do mesmo instante, depois a mais antiga.
    expect(vistas).toEqual([
      '00000000-0000-4000-a000-00000000000c',
      '00000000-0000-4000-a000-00000000000b',
      '00000000-0000-4000-a000-00000000000a',
      '00000000-0000-4000-a000-000000000001',
    ]);
    expect(supabaseFalso.cliente.rpc).toHaveBeenCalledWith('noticias_do_clube', { p_limite: 1, p_antes: mesmoInstante, p_antes_id: '00000000-0000-4000-a000-00000000000c' });
  });
});
