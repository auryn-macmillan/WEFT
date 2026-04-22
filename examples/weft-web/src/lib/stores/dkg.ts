import { writable } from 'svelte/store';
import type { DkgTranscript } from '../crypto/engine';

export const dkgStore = writable<DkgTranscript | null>(null);
