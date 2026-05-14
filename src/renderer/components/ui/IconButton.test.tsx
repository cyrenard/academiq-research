import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('renders icon and exposes label via aria-label + title', () => {
    render(<IconButton icon={<span data-testid="icn" />} label="Bold" />);
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('title', 'Bold');
    expect(screen.getByTestId('icn')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={<span />} label="Italic" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies active styling when active prop set', () => {
    const { rerender } = render(<IconButton icon={<span />} label="Underline" />);
    const btn = screen.getByRole('button', { name: 'Underline' });
    expect(btn.className).not.toContain('shadow-sm');

    rerender(<IconButton icon={<span />} label="Underline" active />);
    expect(btn.className).toContain('shadow-sm');
  });

  it('uses type="button" by default (prevents form submission)', () => {
    render(<IconButton icon={<span />} label="X" />);
    expect(screen.getByRole('button', { name: 'X' })).toHaveAttribute('type', 'button');
  });

  it('respects disabled prop (no click fires)', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={<span />} label="Y" onClick={onClick} disabled />);
    const btn = screen.getByRole('button', { name: 'Y' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards additional className', () => {
    render(<IconButton icon={<span />} label="Z" className="custom-class" />);
    expect(screen.getByRole('button', { name: 'Z' }).className).toContain('custom-class');
  });
});
