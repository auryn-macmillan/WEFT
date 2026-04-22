import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import SandboxControls from '$lib/components/SandboxControls.svelte';

describe('SandboxControls', () => {
  it('shows Safe indicator for valid parameters', () => {
    const { getByText } = render(SandboxControls, {
      props: { clientCount: 3, scaleFactor: 4096, committeeSize: 5, threshold: 3, vectorSize: 256, isRunning: false }
    });
    expect(getByText(/Safe \(max \d+ clients\)/)).toBeTruthy();
  });

  it('disables run button and shows overflow warning for invalid parameters', () => {
    const { getByText, getByTestId } = render(SandboxControls, {
      props: { clientCount: 4, scaleFactor: 16384, committeeSize: 5, threshold: 3, vectorSize: 256, isRunning: false }
    });
    expect(getByText(/Overflow risk!/)).toBeTruthy();
    
    const runBtn = getByTestId('run-round') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
  });

  it('applies stress test preset correctly', async () => {
    const { getByText, getByTestId } = render(SandboxControls, {
      props: { clientCount: 3, scaleFactor: 4096, committeeSize: 5, threshold: 3, vectorSize: 256, isRunning: false }
    });
    
    await fireEvent.click(getByText('Stress test (10 clients)'));
    
    const clientCountInput = getByTestId('client-count') as HTMLInputElement;
    expect(clientCountInput.value).toBe('10');
    
    const scaleFactorInput = getByTestId('scale-factor') as HTMLSelectElement;
    expect(scaleFactorInput.value).toBe('4096');
    
    const vectorSizeInput = getByTestId('vector-size') as HTMLSelectElement;
    expect(vectorSizeInput.value).toBe('512');
  });

  it('applies high precision preset correctly', async () => {
    const { getByText, getByTestId } = render(SandboxControls, {
      props: { clientCount: 3, scaleFactor: 4096, committeeSize: 5, threshold: 3, vectorSize: 256, isRunning: false }
    });
    
    await fireEvent.click(getByText('High precision (S=16384)'));
    
    const scaleFactorInput = getByTestId('scale-factor') as HTMLSelectElement;
    expect(scaleFactorInput.value).toBe('16384');

    const thresholdInput = getByTestId('threshold') as HTMLSelectElement;
    expect(thresholdInput.value).toBe('4,7');
  });
});
