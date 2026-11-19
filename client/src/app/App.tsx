import { useMemo } from 'react';
import type { AppUser } from '@/lib/api';
import { LoadingBlock } from '@/components/ui';
import { PageNav } from '@/components/PageNav';
import { TopBar } from '@/components/layout/TopBar';
import { IdleWarningDialog } from '@/components/layout/IdleWarningDialog';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { usePatientName } from '@/hooks/usePatientName';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { DiseaseFormPage } from '@/diseaseForms/DiseaseFormPage';
import { BackupPage } from '@/pages/BackupPage';
import { DailyReportPage } from '@/pages/DailyReportPage';
import { ForcePasswordChangePage } from '@/pages/ForcePasswordChangePage';
import { FormBuilderPage } from '@/pages/FormBuilderPage';
import { LoginPage } from '@/pages/LoginPage';
import { PatientDetail } from '@/pages/PatientDetail';
import { PatientForm } from '@/pages/PatientForm';
import { PatientsPage } from '@/pages/PatientsPage';
import { StatsPage } from '@/pages/StatsPage';
import { UsersPage } from '@/pages/UsersPage';
import { VisitForm } from '@/pages/VisitForm';
import { useAuth } from './useAuth';
import { useHashRoute } from './useHashRoute';
import { buildCrumbs, navigate, pageTitle, routePatientId, type Route } from './routes';

/** Renders the page for a route. Exhaustive: TypeScript flags a route with no page. */
function RoutePage({
  route,
  user,
  patientName,
  onUserChanged,
}: {
  route: Route;
  user: AppUser;
  patientName: string | null;
  onUserChanged: (u: AppUser) => void;
}) {
  switch (route.name) {
    case 'dashboard':
      return <PatientsPage onNavigate={navigate} />;
    case 'daily':
      return <DailyReportPage />;
    case 'stats':
      return <StatsPage />;
    case 'new-patient':
      return (
        <PatientForm
          onDone={(id) => navigate(`/patients/${id}/visits`)}
          onCancel={() => navigate('/')}
        />
      );
    case 'edit-patient':
      return (
        <PatientForm
          patientId={route.id}
          onDone={(id) => navigate(`/patients/${id}/visits`)}
          onCancel={() => navigate(`/patients/${route.id}/visits`)}
        />
      );
    case 'patient':
      return (
        <PatientDetail patientId={route.id} tab={route.tab || 'visits'} onNavigate={navigate} />
      );
    case 'new-visit':
    case 'edit-visit': {
      const back = () => navigate(`/patients/${route.patientId}/visits`);
      return (
        <VisitForm
          patientId={route.patientId}
          visitId={route.name === 'edit-visit' ? route.visitId : undefined}
          patientName={patientName}
          onDone={back}
          onCancel={back}
        />
      );
    }
    case 'new-disease':
    case 'edit-disease': {
      const back = () => navigate(`/patients/${route.patientId}/diseases`);
      return (
        <DiseaseFormPage
          patientId={route.patientId}
          formType={route.formType}
          assessmentId={route.name === 'edit-disease' ? route.assessmentId : undefined}
          patientName={patientName}
          onDone={back}
          onCancel={back}
        />
      );
    }
    case 'backup':
      return <BackupPage isAdmin={user.role === 'admin'} />;
    case 'users':
      return <UsersPage me={user} onMeChanged={onUserChanged} />;
    case 'forms':
      return <FormBuilderPage onNavigate={navigate} />;
  }
}

export default function App() {
  const auth = useAuth();
  const route = useHashRoute();
  const user = auth.user;
  const patientName = usePatientName(routePatientId(route), user !== null);
  const nav = useMemo(() => buildCrumbs(route, patientName), [route, patientName]);
  const idle = useIdleLogout(user !== null, auth.signOutIdle);
  useDocumentTitle(pageTitle(nav, patientName, user !== null));

  if (auth.status === 'checking') {
    return (
      <div className="login-wrap">
        <LoadingBlock label="Checking sign-in…" />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onSignedIn={(u) => {
          // Always start on the patient list after signing in, not the page used last time.
          navigate('/');
          auth.signedIn(u);
        }}
      />
    );
  }

  if (user.mustChangePassword) {
    return (
      <ForcePasswordChangePage
        user={user}
        onChanged={(u) => {
          navigate('/');
          auth.setUser(u);
        }}
        onSignOut={auth.signOut}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar user={user} activeRoute={route.name} onNavigate={navigate} onSignOut={auth.signOut} />
      {route.name !== 'dashboard' && (
        <PageNav crumbs={nav.crumbs} backTo={nav.backTo} onNavigate={navigate} />
      )}
      <main>
        <RoutePage
          route={route}
          user={user}
          patientName={patientName}
          onUserChanged={auth.setUser}
        />
      </main>
      <IdleWarningDialog
        secondsLeft={idle.secondsLeft}
        onStay={idle.stayActive}
        onSignOut={auth.signOutIdle}
      />
    </div>
  );
}
