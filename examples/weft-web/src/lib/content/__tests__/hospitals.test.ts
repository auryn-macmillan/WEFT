import { describe, it, expect } from 'vitest';
import { HOSPITALS } from '../hospitals';

describe('Hospitals Content', () => {
  it('should have exact patient counts verbatim from demos', () => {
    const stMercy = HOSPITALS.find(h => h.name === 'St. Mercy General');
    const eastside = HOSPITALS.find(h => h.name === 'Eastside Medical');
    const pacific = HOSPITALS.find(h => h.name === 'Pacific University');

    expect(stMercy?.patientCount).toBe(12400);
    expect(eastside?.patientCount).toBe(8200);
    expect(pacific?.patientCount).toBe(22000);
  });

  it('should have 3 hospitals', () => {
    expect(HOSPITALS).toHaveLength(3);
  });
});
