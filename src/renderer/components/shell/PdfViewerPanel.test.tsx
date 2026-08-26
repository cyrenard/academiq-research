import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfViewerPanel } from './PdfViewerPanel';

describe('PdfViewerPanel', () => {
  afterEach(() => {
    delete (window as any).pPrev;
    delete (window as any).togglePdfFullscreen;
  });

  it('keeps the legacy PDF DOM contract while rendering React state', () => {
    const { container } = render(
      <PdfViewerPanel title="Paper.pdf" pageText="2 / 8" zoomText="125%" toolMode="draw" open fullscreen />
    );
    const panel = container.querySelector('#pdfpanel');
    expect(panel).toHaveClass('open', 'fullscreen');
    expect(panel).toHaveAttribute('data-tool-mode', 'draw');
    expect(container.querySelector('#pdftitle')).toHaveTextContent('Paper.pdf');
    expect(container.querySelector('#pdfpg')).toHaveTextContent('2 / 8');
    expect(container.querySelector('#pdfzoom')).toHaveTextContent('125%');
    expect(container.querySelector('#drawbtn')).toHaveClass('on');
  });

  it('routes controls to the established PDF runtime', () => {
    const previous = vi.fn();
    const fullscreen = vi.fn();
    (window as any).pPrev = previous;
    (window as any).togglePdfFullscreen = fullscreen;
    render(<PdfViewerPanel title="--" pageText="--" zoomText="--" toolMode="" open={false} fullscreen={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Önceki sayfa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tam ekran aç/kapat' }));
    expect(previous).toHaveBeenCalledOnce();
    expect(fullscreen).toHaveBeenCalledOnce();
  });
});
