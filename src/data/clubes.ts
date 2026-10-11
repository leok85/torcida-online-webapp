// Lista provisória, igual à do app mobile; os clubes reais virão da API.

export type Pais = { codigo: string; nome: string; bandeira: string };

export const PAISES: Pais[] = [
  { codigo: 'BR', nome: 'Brasil', bandeira: 'br' },
  { codigo: 'AR', nome: 'Argentina', bandeira: 'ar' },
  { codigo: 'ES', nome: 'Espanha', bandeira: 'es' },
  { codigo: 'EN', nome: 'Inglaterra', bandeira: 'gb-eng' },
];

export type Clube = { id: string; nome: string; pais: string };

export const CLUBES: Clube[] = [
  { id: 'clube-a', nome: 'Clube A', pais: 'BR' },
  { id: 'clube-b', nome: 'Clube B', pais: 'BR' },
  { id: 'clube-c', nome: 'Clube C', pais: 'BR' },
  { id: 'clube-d', nome: 'Clube D', pais: 'BR' },
  { id: 'clube-e', nome: 'Clube E', pais: 'BR' },
  { id: 'clube-f', nome: 'Clube F', pais: 'BR' },
  { id: 'ar-1', nome: 'Clube Rio', pais: 'AR' },
  { id: 'ar-2', nome: 'Clube Plata', pais: 'AR' },
  { id: 'es-1', nome: 'Clube Sol', pais: 'ES' },
  { id: 'es-2', nome: 'Clube Norte', pais: 'ES' },
  { id: 'en-1', nome: 'Clube União', pais: 'EN' },
  { id: 'en-2', nome: 'Clube Ilha', pais: 'EN' },
];

export const paisPorCodigo = (codigo?: string | null) => PAISES.find((p) => p.codigo === codigo);
export const clubePorId = (id?: string | null) => CLUBES.find((c) => c.id === id);
