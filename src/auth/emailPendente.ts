// Guarda o e-mail aguardando confirmação para a tela de código sobreviver a um recarregamento.
const CHAVE = 'to:email-pendente';

export const lerEmailPendente = () => sessionStorage.getItem(CHAVE);
export const guardarEmailPendente = (email: string) => sessionStorage.setItem(CHAVE, email);
export const limparEmailPendente = () => sessionStorage.removeItem(CHAVE);
