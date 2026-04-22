import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PhaseProgress from '../PhaseProgress.svelte';
import { PHASES } from '../../content/phases';

describe('PhaseProgress', () => {
  it('renders correctly with given phases', () => {
    const phases = PHASES.map(p => p.id);
    const visited = new Set([phases[0], phases[1]]);
    
    render(PhaseProgress, {
      props: {
        phases,
        current: phases[1],
        visited
      }
    });
    
    const dots = screen.getAllByRole('button');
    expect(dots).toHaveLength(8);
    
    expect(dots[0]).not.toHaveAttribute('aria-disabled', 'true');
    expect(dots[1]).not.toHaveAttribute('aria-disabled', 'true');
    expect(dots[2]).toHaveAttribute('aria-disabled', 'true');
  });

  it('calls onJump when a visited phase is clicked', async () => {
    const user = userEvent.setup();
    const phases = PHASES.map(p => p.id);
    const visited = new Set([phases[0], phases[1]]);
    const onJump = vi.fn();
    
    render(PhaseProgress, {
      props: {
        phases,
        current: phases[1],
        visited,
        onJump
      }
    });
    
    const dots = screen.getAllByRole('button');
    
    await user.click(dots[0]);
    expect(onJump).toHaveBeenCalledWith(phases[0]);
    
    await user.click(dots[2]);
    expect(onJump).toHaveBeenCalledTimes(1); 
  });

  it('calls onJump on keyboard Enter if visited', async () => {
    const phases = PHASES.map(p => p.id);
    const visited = new Set([phases[0], phases[1]]);
    const onJump = vi.fn();
    
    render(PhaseProgress, {
      props: {
        phases,
        current: phases[1],
        visited,
        onJump
      }
    });
    
    const dots = screen.getAllByRole('button');
    
    await fireEvent.keyDown(dots[0], { key: 'Enter' });
    expect(onJump).toHaveBeenCalledWith(phases[0]);
  });
});
