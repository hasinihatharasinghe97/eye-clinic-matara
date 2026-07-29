import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { DiseaseFormsProvider } from './diseaseForms/DiseaseFormsContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiseaseFormsProvider>
      <App />
    </DiseaseFormsProvider>
  </StrictMode>
);
