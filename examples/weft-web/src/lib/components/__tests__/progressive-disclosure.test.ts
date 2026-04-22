import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$app/stores', () => ({
	page: { subscribe: vi.fn() }
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

import { render, fireEvent, screen } from '@testing-library/svelte';
import ProgressiveDisclosure from '../ProgressiveDisclosure.svelte';
import { tick } from 'svelte';
import './setup';

describe('ProgressiveDisclosure', () => {
	beforeEach(() => {
		const store: Record<string, string> = {};
		global.Storage.prototype.getItem = vi.fn((key: string) => store[key] || null);
		global.Storage.prototype.setItem = vi.fn((key: string, value: string) => {
			store[key] = value;
		});

		Object.defineProperty(window, 'location', {
			value: {
				hash: '',
				pathname: '/',
				search: '',
			},
			writable: true
		});
        
        Object.defineProperty(window, 'history', {
            value: {
                replaceState: vi.fn(),
            },
            writable: true
        });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders with default level (novice)', () => {
		const { container } = render(ProgressiveDisclosure);
		const activeTab = container.querySelector('.pill-segment.active');
		expect(activeTab?.textContent?.trim()).toBe('Novice');
	});

	it('changes level when clicking tabs', async () => {
		const { container } = render(ProgressiveDisclosure);
		const tabs = container.querySelectorAll('.pill-segment');
		
		await fireEvent.click(tabs[1]);
		
		const activeTab = container.querySelector('.pill-segment.active');
		expect(activeTab?.textContent?.trim()).toBe('Learn More');
	});

	it('cycles levels with keyboard navigation', async () => {
		const { container } = render(ProgressiveDisclosure, { level: 'novice' });
		const tablist = container.querySelector('.pill-toggle');
		
		expect(tablist).not.toBeNull();
		if (!tablist) return;

		await fireEvent.keyDown(tablist, { key: 'ArrowRight' });
		expect(container.querySelector('.pill-segment.active')?.textContent?.trim()).toBe('Learn More');

		await fireEvent.keyDown(tablist, { key: 'ArrowRight' });
		expect(container.querySelector('.pill-segment.active')?.textContent?.trim()).toBe('Show Math');

		await fireEvent.keyDown(tablist, { key: 'ArrowRight' });
		expect(container.querySelector('.pill-segment.active')?.textContent?.trim()).toBe('Novice');

		await fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
		expect(container.querySelector('.pill-segment.active')?.textContent?.trim()).toBe('Show Math');
	});

	it('respects sticky prop and reads from localStorage', () => {
		global.Storage.prototype.getItem = vi.fn(() => 'show-math');
		
		const { container } = render(ProgressiveDisclosure, { sticky: true });
		const activeTab = container.querySelector('.pill-segment.active');
		expect(activeTab?.textContent?.trim()).toBe('Show Math');
	});

	it('saves to localStorage when level changes if sticky', async () => {
		const { container } = render(ProgressiveDisclosure, { sticky: true });
		const tabs = container.querySelectorAll('.pill-segment');
		
		await fireEvent.click(tabs[1]);
		
		expect(global.Storage.prototype.setItem).toHaveBeenCalledWith('weft-depth-level', 'learn-more');
	});

	it('syncs to URL hash', async () => {
		window.location.hash = '#depth=show-math';
		const { container } = render(ProgressiveDisclosure);
		
		const activeTab = container.querySelector('.pill-segment.active');
		expect(activeTab?.textContent?.trim()).toBe('Show Math');
	});
});
