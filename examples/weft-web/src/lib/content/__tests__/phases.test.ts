import { describe, it, expect } from 'vitest';
import { PHASES } from '../phases';

describe('Phases Content', () => {
  it('should have 8 phases', () => {
    expect(PHASES).toHaveLength(8);
  });

  it('should have non-empty strings for all 3 depth levels in every phase', () => {
    PHASES.forEach(phase => {
      expect(phase.body.novice.length).toBeGreaterThan(0);
      expect(phase.body['learn-more'].length).toBeGreaterThan(0);
      expect(phase.body['show-math'].length).toBeGreaterThan(0);
    });
  });

  it('should have at least 4 phases with LaTeX equations', () => {
    const phasesWithEquations = PHASES.filter(p => p.equations && p.equations.length > 0);
    expect(phasesWithEquations.length).toBeGreaterThanOrEqual(4);
  });

  it('should match snapshot', () => {
    expect(PHASES).toMatchSnapshot();
  });
});
