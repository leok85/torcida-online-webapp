// A conta Google com e-mail do domínio é só do back-office; para torcer, a pessoa usa a conta pessoal.
// O banco aplica a mesma regra em public.conta_corporativa() (sem perfil de torcedor para esse domínio).
export const DOMINIO_CORPORATIVO = 'torcidaonline.com.br';

export const contaCorporativa = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${DOMINIO_CORPORATIVO}`);
