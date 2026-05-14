import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <Modal title="X" open={false} onClose={() => {}}>body</Modal>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders with correct dialog role + title when open', () => {
    render(
      <Modal title="Test başlık" open onClose={() => {}}>
        <p>Modal içeriği</p>
      </Modal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Test başlık' })).toBeInTheDocument();
    expect(screen.getByText('Modal içeriği')).toBeInTheDocument();
  });

  it('calls onClose when Kapat button clicked', async () => {
    const onClose = vi.fn();
    render(<Modal title="X" open onClose={onClose}>body</Modal>);
    await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking the backdrop', () => {
    const onClose = vi.fn();
    render(<Modal title="X" open onClose={onClose}>body</Modal>);
    const backdrop = screen.getByRole('dialog');
    // mousedown directly on the backdrop element
    fireEvent.mouseDown(backdrop, { target: backdrop, currentTarget: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when clicking inside the dialog body', async () => {
    const onClose = vi.fn();
    render(<Modal title="X" open onClose={onClose}><p>inner content</p></Modal>);
    await userEvent.click(screen.getByText('inner content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies wide layout class when wide prop set', () => {
    const { rerender, container } = render(
      <Modal title="X" open onClose={() => {}}>x</Modal>
    );
    const dialog = container.querySelector('[role="dialog"] > div');
    expect(dialog?.className).toContain('w-[min(560px');

    rerender(<Modal title="X" open onClose={() => {}} wide>x</Modal>);
    expect(dialog?.className).toContain('w-[min(1040px');
  });
});
