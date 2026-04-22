import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PhaseShell from '../PhaseShell.svelte';
import { PHASES } from '../../content/phases';

describe('PhaseShell', () => {
  it('renders the correct phase title and number', () => {
    const phaseId = PHASES[1].id; 
    
    render(PhaseShell, {
      props: {
        phaseId
      }
    });
    
    expect(screen.getByText('Phase 2 of 8')).toBeInTheDocument();
    expect(screen.getByText(PHASES[1].title)).toBeInTheDocument();
  });

  it('renders the progressive disclosure content based on phase body', () => {
    const phaseId = PHASES[0].id;
    
    render(PhaseShell, {
      props: {
        phaseId
      }
    });
    
    const noviceText = PHASES[0].body.novice;
    expect(screen.getByText(noviceText)).toBeInTheDocument();
  });

  it('calls onNext and onPrev when buttons are clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onPrev = vi.fn();
    
    render(PhaseShell, {
      props: {
        phaseId: PHASES[1].id,
        onNext,
        onPrev
      }
    });
    
    const nextBtn = screen.getByRole('button', { name: /next/i });
    const prevBtn = screen.getByRole('button', { name: /previous/i });
    
    await user.click(nextBtn);
    expect(onNext).toHaveBeenCalledTimes(1);
    
    await user.click(prevBtn);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('calls callbacks on keyboard events', async () => {
    const onNext = vi.fn();
    const onPause = vi.fn();
    
    render(PhaseShell, {
      props: {
        phaseId: PHASES[1].id,
        onNext,
        onPause
      }
    });
    
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onNext).toHaveBeenCalledTimes(1);
    
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});
