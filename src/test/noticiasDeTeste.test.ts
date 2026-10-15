// O falso precisa errar como o banco: o trigger barrar_restrito roda no insert, depois das checagens da função, e o
// PostgREST recusa id que não é uuid antes de chegar nela. Os testes de tela dependem dessas respostas.
import { describe, expect, it } from 'vitest';
import { comentarNoticiaDeTeste, curtirNoticiaDeTeste, estadoDasNoticias, noticiaDeTeste, rpcDeNoticias, type Restrito } from './noticiasDeTeste';
import { estadoDoXp } from './xpDeTeste';

const eu = { id: 'usuario-1', apelido: 'Rafa_9', time_id: 162, onboarding_concluido_em: '2026-10-01T12:00:00Z' };
const suspenso: Restrito = () => ({ code: 'P0001', hint: 'suspenso', message: 'Conta suspensa' });
const silenciado: Restrito = (publicar) => (publicar ? { code: 'P0001', hint: 'silenciado', message: 'Silenciado' } : null);

describe('falso das notícias: a ordem dos erros é a do banco', () => {
  it('curtir notícia de outro clube responde noticia_inexistente mesmo para suspenso', () => {
    const estado = estadoDasNoticias();
    const outra = noticiaDeTeste({ clubes: [167] });
    estado.noticias.push(outra);
    expect(curtirNoticiaDeTeste(estado, eu, outra.id, suspenso)).toMatchObject({ hint: 'noticia_inexistente' });
  });

  it('suspenso não dá curtida, mas tira a que já tinha (o trigger é só no insert)', () => {
    const estado = estadoDasNoticias();
    const n = noticiaDeTeste();
    estado.noticias.push(n);
    expect(curtirNoticiaDeTeste(estado, eu, n.id, suspenso)).toMatchObject({ hint: 'suspenso' });
    estado.curtidas.push({ noticia_id: n.id, usuario_id: eu.id });
    n.curtidas = 1;
    expect(curtirNoticiaDeTeste(estado, eu, n.id, suspenso)).toEqual([{ curti: false, curtidas: 0 }]);
  });

  it('comentar: sem_perfil, notícia e devagar vêm antes do silêncio', () => {
    const estado = estadoDasNoticias();
    const n = noticiaDeTeste();
    const outra = noticiaDeTeste({ clubes: [167] });
    estado.noticias.push(n, outra);
    expect(comentarNoticiaDeTeste(estado, { ...eu, onboarding_concluido_em: null }, { p_id: n.id, p_texto: 'oi' }, silenciado)).toMatchObject({ hint: 'sem_perfil' });
    expect(comentarNoticiaDeTeste(estado, eu, { p_id: outra.id, p_texto: 'oi' }, silenciado)).toMatchObject({ hint: 'noticia_inexistente' });
    estado.comentarios.push({ id: 1, noticia_id: n.id, autor_id: eu.id, texto: 'antes', curtidas: 0, oculto: false, criado_em: new Date().toISOString() });
    expect(comentarNoticiaDeTeste(estado, eu, { p_id: n.id, p_texto: 'oi' }, silenciado)).toMatchObject({ hint: 'devagar' });
    estado.comentarios.length = 0;
    expect(comentarNoticiaDeTeste(estado, eu, { p_id: n.id, p_texto: 'oi' }, silenciado)).toMatchObject({ hint: 'silenciado' });
    expect(estado.comentarios).toEqual([]);
  });

  it('id que não é uuid é recusado como o PostgREST (22P02)', () => {
    const r = rpcDeNoticias('noticia', { p_id: 'abc' }, { estado: estadoDasNoticias(), xp: estadoDoXp(), perfis: [], eu, restrito: () => null });
    expect(r).toEqual({ erro: expect.objectContaining({ code: '22P02' }) });
  });
});
