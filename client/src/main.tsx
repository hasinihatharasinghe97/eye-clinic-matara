import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { DiseaseFormsProvider } from './diseaseForms/DiseaseFormsContext';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <DiseaseFormsProvider>
          <App />
        </DiseaseFormsProvider>
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>
);
