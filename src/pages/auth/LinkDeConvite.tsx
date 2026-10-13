import { Navigate, useParams } from 'react-router-dom';
import { guardarConvitePendente } from '../../convites/convites';

/**
 * /r/APELIDO: guarda o convite neste navegador e segue para o cadastro, que mostra quem chamou. Quem já tem sessão
 * vai para o app; se ainda não escolheu o clube, o onboarding aplica o convite.
 */
export function LinkDeConvite() {
  const { codigo = '' } = useParams();
  if (/^[A-Za-z0-9._]{3,20}$/.test(codigo)) guardarConvitePendente(codigo);
  return <Navigate to="/criar-conta" replace />;
}
