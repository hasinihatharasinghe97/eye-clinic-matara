/**
 * Hash-based routing (#/patients/12/visits). Kept dependency-free on purpose: the app
 * runs offline on the clinic laptop and the URL scheme is small.
 */
import type { Crumb } from '@/components/PageNav';
import { diseaseFormTitle } from '@/diseaseForms/catalog';
import { confirmLeave } from '@/hooks/useLeaveGuard';

export type Route =
  | { name: 'dashboard' }
  | { name: 'new-patient' }
  | { name: 'edit-patient'; id: string }
  | { name: 'patient'; id: string; tab?: string }
  | { name: 'new-visit'; patientId: string }
  | { name: 'edit-visit'; patientId: string; visitId: string }
  | { name: 'new-disease'; patientId: string; formType: string }
  | { name: 'edit-disease'; patientId: string; formType: string; assessmentId: string }
  | { name: 'backup' }
  | { name: 'stats' }
  | { name: 'daily' }
  | { name: 'forms' }
  | { name: 'users' };

export type RouteName = Route['name'];

/** Labels for the tabs on a patient's page, keyed by the URL segment. */
export const PATIENT_TAB_LABELS: Record<string, string> = {
  visits: 'Visits',
  diseases: 'Assessments',
  charts: 'Charts',
  progress: 'Progress',
  images: 'Images',
  whatsapp: 'WhatsApp',
};

/** Simple top-level pages: URL segment → route name. */
const TOP_LEVEL: Record<string, RouteName> = {
  backup: 'backup',
  stats: 'stats',
  daily: 'daily',
  forms: 'forms',
  users: 'users',
};

/** Reads the current route from a hash such as "#/patients/12/visits". */
export function parseRoute(hash: string = window.location.hash): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [section, id, sub, subId, action, extra] = parts;

  if (section === 'patients' && id) {
    if (id === 'new') return { name: 'new-patient' };
    if (sub === 'edit') return { name: 'edit-patient', id };
    if (sub === 'visits' && subId === 'new') return { name: 'new-visit', patientId: id };
    if (sub === 'visits' && subId && action === 'edit') {
      return { name: 'edit-visit', patientId: id, visitId: subId };
    }
    if (sub === 'diseases' && subId && action === 'new') {
      return { name: 'new-disease', patientId: id, formType: decodeURIComponent(subId) };
    }
    if (sub === 'diseases' && subId && action && extra === 'edit') {
      return {
        name: 'edit-disease',
        patientId: id,
        formType: decodeURIComponent(subId),
        assessmentId: action,
      };
    }
    return { name: 'patient', id, tab: sub };
  }
  const top = section ? TOP_LEVEL[section] : undefined;
  return top ? ({ name: top } as Route) : { name: 'dashboard' };
}

/** Go to a path like "/patients/12/visits". Asks first if a form has unsaved changes. */
export function navigate(to: string): void {
  if (!confirmLeave()) return;
  window.location.hash = to;
}

/** The patient a route is about, if any. */
export function routePatientId(route: Route): string | null {
  switch (route.name) {
    case 'patient':
    case 'edit-patient':
      return route.id;
    case 'new-visit':
    case 'edit-visit':
    case 'new-disease':
    case 'edit-disease':
      return route.patientId;
    default:
      return null;
  }
}

export type RouteNav = { crumbs: Crumb[]; backTo?: string };

/** Breadcrumb trail and Back target for a route. */
export function buildCrumbs(route: Route, patientName: string | null): RouteNav {
  const patients: Crumb = { label: 'Patients', href: '/' };
  const name = patientName || 'Patient';
  const simple = (label: string): RouteNav => ({ crumbs: [patients, { label }], backTo: '/' });

  switch (route.name) {
    case 'dashboard':
      return { crumbs: [{ label: 'Patients' }] };
    case 'new-patient':
      return simple('New patient');
    case 'edit-patient':
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.id}` },
          { label: 'Edit details' },
        ],
        backTo: `/patients/${route.id}`,
      };
    case 'patient': {
      const tabLabel = PATIENT_TAB_LABELS[route.tab || 'visits'] || 'Visits';
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.id}/visits` },
          { label: tabLabel },
        ],
        backTo: '/',
      };
    }
    case 'new-visit':
    case 'edit-visit': {
      const visits = `/patients/${route.patientId}/visits`;
      return {
        crumbs: [
          patients,
          { label: name, href: visits },
          { label: 'Visits', href: visits },
          { label: route.name === 'new-visit' ? 'New screening form' : 'Edit screening form' },
        ],
        backTo: visits,
      };
    }
    case 'new-disease':
    case 'edit-disease': {
      const diseases = `/patients/${route.patientId}/diseases`;
      return {
        crumbs: [
          patients,
          { label: name, href: diseases },
          { label: 'Assessments', href: diseases },
          { label: diseaseFormTitle(route.formType) },
          { label: route.name === 'new-disease' ? 'New' : 'Edit' },
        ],
        backTo: diseases,
      };
    }
    case 'stats':
      return simple('Clinic stats');
    case 'daily':
      return simple('Daily & monthly report');
    case 'backup':
      return simple('Backup & Settings');
    case 'forms':
      return simple('Disease form builder');
    case 'users':
      return simple('Users & account');
  }
}

/** Browser tab title for a route, e.g. "Kamala Silva · Visits - Nethraloka Eye Clinic". */
export function pageTitle(nav: RouteNav, patientName: string | null, signedIn: boolean): string {
  const clinic = 'Nethraloka Eye Clinic';
  if (!signedIn) return clinic;
  const labels = nav.crumbs.map((c) => c.label);
  const last = labels[labels.length - 1];
  const title =
    patientName && labels.includes(patientName) && last !== patientName
      ? `${patientName} · ${last}`
      : last;
  return title ? `${title} - ${clinic}` : clinic;
}
