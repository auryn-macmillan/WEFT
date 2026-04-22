import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ParametersModal from '../ParametersModal.svelte';
import type { CryptoEngine } from '../../crypto/engine';
import { tick } from 'svelte';

const mockEngine = {
  getParams: () => ({
    presetId: 'SECURE_THRESHOLD_8192',
    plaintextModulus: 131072n,
    polyDegree: 8192,
    threshold: 3,
    committeeSize: 5
  }),
  runDkg: async () => ({} as any),
  encryptVector: async () => ({} as any),
  aggregateCiphertexts: async () => ({} as any),
  partialDecrypt: async () => ({} as any),
  combineDecryptionShares: async () => new Int32Array()
} as unknown as CryptoEngine;

describe('ParametersModal.svelte', () => {
  it('does not render when open is false', () => {
    render(ParametersModal, { open: false, engine: mockEngine, nMax: 10 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders correctly when open is true', () => {
    render(ParametersModal, { open: true, engine: mockEngine, nMax: 10 });
    
    expect(screen.getByRole('heading', { name: /BFV Parameters & Overflow Invariant/i })).toBeInTheDocument();
    
    expect(screen.getByText('SECURE_THRESHOLD_8192')).toBeInTheDocument();
    expect(screen.getByText('131072')).toBeInTheDocument();
    expect(screen.getByText('8192')).toBeInTheDocument();
    expect(screen.getByText('4096')).toBeInTheDocument();
    expect(screen.getByText('3-of-5')).toBeInTheDocument();
    expect(screen.getByText('128-bit')).toBeInTheDocument();
  });

  it('calculates and displays safe overflow invariant for nMax=10', () => {
    render(ParametersModal, { open: true, engine: mockEngine, nMax: 10 });
    
    expect(screen.getByText(/10 × 4096 × 1 = 40960/i)).toBeInTheDocument();
    expect(screen.getByText('65536')).toBeInTheDocument();
    
    expect(screen.getByText('✓ Safe')).toBeInTheDocument();
  });

  it('calculates and displays violated overflow invariant for nMax=20', () => {
    render(ParametersModal, { open: true, engine: mockEngine, nMax: 20 });
    
    expect(screen.getByText(/20 × 4096 × 1 = 81920/i)).toBeInTheDocument();
    expect(screen.getByText('65536')).toBeInTheDocument();
    
    expect(screen.getByText('✗ Violated')).toBeInTheDocument();
  });

  it('toggles math details correctly', async () => {
    render(ParametersModal, { open: true, engine: mockEngine, nMax: 10 });
    
    expect(screen.queryByText(/BFV Encryption Formula/i)).not.toBeInTheDocument();
    
    const toggleButton = screen.getByRole('button', { name: /Show Math/i });
    await fireEvent.click(toggleButton);
    await tick();
    
    expect(screen.getByText(/BFV Encryption Formula/i)).toBeInTheDocument();
    expect(screen.getByText(/c = \(a·s \+ e \+ Δ·m, -a\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide Math/i })).toBeInTheDocument();
  });

  it('closes when close button is clicked', async () => {
    const { component } = render(ParametersModal, { open: true, engine: mockEngine, nMax: 10 });
    
    const closeButton = screen.getByRole('button', { name: /Close modal/i });
    await fireEvent.click(closeButton);
    
    expect(closeButton).toBeInTheDocument();
  });
});
