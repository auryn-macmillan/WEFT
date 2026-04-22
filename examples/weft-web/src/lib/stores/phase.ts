import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { PhaseId } from '../content/phases';
import { PHASES } from '../content/phases';

export interface PhaseState {
	currentPhase: PhaseId;
	visited: Set<PhaseId>;
	completedAt: Record<PhaseId, number>;
}

const STORAGE_KEY = 'weft-phase-state';
const INITIAL_STATE: PhaseState = {
	currentPhase: PHASES[0].id,
	visited: new Set([PHASES[0].id]),
	completedAt: {} as Record<PhaseId, number>
};

function loadState(): PhaseState {
	if (!browser) return INITIAL_STATE;
	
	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return {
				currentPhase: parsed.currentPhase || INITIAL_STATE.currentPhase,
				visited: new Set(parsed.visited || [INITIAL_STATE.currentPhase]),
				completedAt: parsed.completedAt || {}
			};
		}
	} catch (e) {
		console.warn('Failed to load phase state from sessionStorage', e);
	}
	return INITIAL_STATE;
}

function createPhaseStore() {
	const state = loadState();
	const { subscribe, set, update } = writable<PhaseState>(state);

	subscribe((value) => {
		if (browser) {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
				currentPhase: value.currentPhase,
				visited: Array.from(value.visited),
				completedAt: value.completedAt
			}));
		}
	});

	return {
		subscribe,
		set,
		update,
		advancePhase: (id: PhaseId) => {
			update(s => {
				const visited = new Set(s.visited);
				visited.add(id);
				
				const completedAt = { ...s.completedAt };
				if (s.currentPhase !== id && !completedAt[s.currentPhase]) {
					completedAt[s.currentPhase] = Date.now();
				}

				return {
					...s,
					currentPhase: id,
					visited,
					completedAt
				};
			});
		},
		markVisited: (id: PhaseId) => {
			update(s => {
				const visited = new Set(s.visited);
				visited.add(id);
				return { ...s, visited };
			});
		},
		resetPhase: () => {
			set({
				currentPhase: PHASES[0].id,
				visited: new Set([PHASES[0].id]),
				completedAt: {} as Record<PhaseId, number>
			});
		}
	};
}

export const phaseStore = createPhaseStore();
