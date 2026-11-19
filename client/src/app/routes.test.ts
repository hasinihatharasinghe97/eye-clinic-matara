import { describe, expect, it } from 'vitest';
import { buildCrumbs, pageTitle, parseRoute, routePatientId } from './routes';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'dashboard' }],
    ['#/', { name: 'dashboard' }],
    ['#/unknown', { name: 'dashboard' }],
    ['#/patients/new', { name: 'new-patient' }],
    ['#/patients/12', { name: 'patient', id: '12', tab: undefined }],
    ['#/patients/12/images', { name: 'patient', id: '12', tab: 'images' }],
    ['#/patients/12/edit', { name: 'edit-patient', id: '12' }],
    ['#/patients/12/visits/new', { name: 'new-visit', patientId: '12' }],
    ['#/patients/12/visits/7/edit', { name: 'edit-visit', patientId: '12', visitId: '7' }],
    [
      '#/patients/12/diseases/cataract/new',
      { name: 'new-disease', patientId: '12', formType: 'cataract' },
    ],
    [
      '#/patients/12/diseases/custom%3Aglaucoma/5/edit',
      { name: 'edit-disease', patientId: '12', formType: 'custom:glaucoma', assessmentId: '5' },
    ],
    ['#/backup', { name: 'backup' }],
    ['#/stats', { name: 'stats' }],
    ['#/daily', { name: 'daily' }],
    ['#/forms', { name: 'forms' }],
    ['#/users', { name: 'users' }],
  ])('%s', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });
});

describe('routePatientId', () => {
  it('finds the patient for patient-related routes only', () => {
    expect(routePatientId(parseRoute('#/patients/9/visits/3/edit'))).toBe('9');
    expect(routePatientId(parseRoute('#/patients/9'))).toBe('9');
    expect(routePatientId(parseRoute('#/stats'))).toBeNull();
  });
});

describe('buildCrumbs', () => {
  it('builds a trail with the patient name and a Back target', () => {
    const nav = buildCrumbs(parseRoute('#/patients/9/visits/new'), 'Kamala Silva');
    expect(nav.crumbs.map((c) => c.label)).toEqual([
      'Patients',
      'Kamala Silva',
      'Visits',
      'New screening form',
    ]);
    expect(nav.backTo).toBe('/patients/9/visits');
  });

  it('uses a placeholder until the patient name has loaded', () => {
    const nav = buildCrumbs(parseRoute('#/patients/9/edit'), null);
    expect(nav.crumbs[1].label).toBe('Patient');
  });

  it('has no Back target on the home page', () => {
    expect(buildCrumbs(parseRoute('#/'), null).backTo).toBeUndefined();
  });
});

describe('pageTitle', () => {
  it('names the tab after the patient and section', () => {
    const nav = buildCrumbs(parseRoute('#/patients/9/images'), 'Kamala Silva');
    expect(pageTitle(nav, 'Kamala Silva', true)).toBe(
      'Kamala Silva · Images - Nethraloka Eye Clinic'
    );
  });

  it('shows only the clinic name when signed out', () => {
    expect(pageTitle(buildCrumbs(parseRoute('#/stats'), null), null, false)).toBe(
      'Nethraloka Eye Clinic'
    );
  });
});
