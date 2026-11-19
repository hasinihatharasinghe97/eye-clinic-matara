import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/Toast';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { DiseaseFormsProvider } from '@/diseaseForms/DiseaseFormsContext';

/** App-wide context providers, in one place. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <DiseaseFormsProvider>{children}</DiseaseFormsProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
