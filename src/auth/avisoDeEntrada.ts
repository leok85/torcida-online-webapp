// Recado para a tela de entrar depois de uma saída forçada (ex.: exclusão da conta agendada).
// Fica no sessionStorage porque a saída troca de rota pelos guards, e o state da navegação se perde.
const CHAVE = 'to:aviso-de-entrada';

export const guardarAvisoDeEntrada = (aviso: string) => sessionStorage.setItem(CHAVE, aviso);

export const lerAvisoDeEntrada = () => sessionStorage.getItem(CHAVE);
/** Depois de mostrado, o recado sai: ele aparece uma vez só. */
export const limparAvisoDeEntrada = () => sessionStorage.removeItem(CHAVE);
