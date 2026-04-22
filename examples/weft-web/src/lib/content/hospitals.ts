export interface HospitalInfo {
  id: string;
  name: string;
  patientCount: number;
  specialty: string;
  avatarKey: string;
}

export const HOSPITALS: HospitalInfo[] = [
  {
    id: 'st-mercy',
    name: 'St. Mercy General',
    patientCount: 12400,
    specialty: 'Endocrinology & Diabetes',
    avatarKey: 'hospital-yellow'
  },
  {
    id: 'eastside',
    name: 'Eastside Medical',
    patientCount: 8200,
    specialty: 'Community Health',
    avatarKey: 'hospital-magenta'
  },
  {
    id: 'pacific',
    name: 'Pacific University',
    patientCount: 22000,
    specialty: 'Medical Research',
    avatarKey: 'hospital-cyan'
  }
];
