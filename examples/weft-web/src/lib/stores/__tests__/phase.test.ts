import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { phaseStore } from '../phase';
import { PHASES } from '../../content/phases';

describe('phaseStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    phaseStore.resetPhase();
  });

  it('initializes with the first phase', () => {
    const state = get(phaseStore);
    expect(state.currentPhase).toBe(PHASES[0].id);
    expect(state.visited.has(PHASES[0].id)).toBe(true);
  });

  it('advances to a new phase', () => {
    const nextId = PHASES[1].id;
    phaseStore.advancePhase(nextId);
    
    const state = get(phaseStore);
    expect(state.currentPhase).toBe(nextId);
    expect(state.visited.has(PHASES[0].id)).toBe(true);
    expect(state.visited.has(nextId)).toBe(true);
  });

  it('marks a phase as visited without advancing', () => {
    const nextId = PHASES[1].id;
    phaseStore.markVisited(nextId);
    
    const state = get(phaseStore);
    expect(state.currentPhase).toBe(PHASES[0].id);
    expect(state.visited.has(nextId)).toBe(true);
  });

  it('persists state to sessionStorage', () => {
    const nextId = PHASES[1].id;
    phaseStore.advancePhase(nextId);
    
    const stored = sessionStorage.getItem('weft-phase-state');
    expect(stored).toBeTruthy();
    
    const parsed = JSON.parse(stored!);
    expect(parsed.currentPhase).toBe(nextId);
    expect(parsed.visited).toContain(PHASES[0].id);
    expect(parsed.visited).toContain(nextId);
  });

  it('resets to initial state', () => {
    phaseStore.advancePhase(PHASES[1].id);
    phaseStore.resetPhase();
    
    const state = get(phaseStore);
    expect(state.currentPhase).toBe(PHASES[0].id);
    expect(state.visited.size).toBe(1);
    expect(state.visited.has(PHASES[0].id)).toBe(true);
  });
});
