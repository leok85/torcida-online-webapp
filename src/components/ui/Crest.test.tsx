import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Crest } from './Crest';

describe('Crest', () => {
  it('com o id do clube, mostra o escudo do bucket de escudos', () => {
    const { container } = render(<Crest width={44} height={50} clubeId={160} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'http://supabase.test/storage/v1/object/public/escudos/clubes/160.png');
  });

  it('se o escudo não carregar, volta para o escudo listrado', () => {
    const { container } = render(<Crest width={44} height={50} clubeId={160} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('div[aria-hidden]')).toBeInTheDocument();
  });

  it('trocar de clube tenta o escudo do novo clube', () => {
    const { container, rerender } = render(<Crest width={44} height={50} clubeId={160} />);
    fireEvent.error(container.querySelector('img')!);
    rerender(<Crest width={44} height={50} clubeId={162} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'http://supabase.test/storage/v1/object/public/escudos/clubes/162.png');
  });

  it('sem clube, usa o escudo listrado', () => {
    const { container } = render(<Crest width={44} height={50} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
