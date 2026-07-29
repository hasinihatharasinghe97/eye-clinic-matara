import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api';
import {
  BUILTIN_DISEASE_FORMS,
  setCustomDiseaseForms,
} from './catalog';
import type { DiseaseFormDef } from './types';

type Ctx = {
  forms: DiseaseFormDef[];
  customForms: DiseaseFormDef[];
  ready: boolean;
  reload: () => Promise<void>;
};

const DiseaseFormsContext = createContext<Ctx>({
  forms: BUILTIN_DISEASE_FORMS,
  customForms: [],
  ready: false,
  reload: async () => {},
});

export function DiseaseFormsProvider({ children }: { children: ReactNode }) {
  const [customForms, setCustomForms] = useState<DiseaseFormDef[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const list = await api.listCustomDiseaseForms();
    const mapped: DiseaseFormDef[] = list.map((f) => ({
      id: f.id,
      title: f.title,
      shortTitle: f.shortTitle,
      fields: f.fields || [],
    }));
    setCustomForms(mapped);
    setCustomDiseaseForms(mapped);
  }, []);

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch(() => {
        if (!cancelled) {
          setCustomForms([]);
          setCustomDiseaseForms([]);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const value = useMemo(
    () => ({
      forms: [...BUILTIN_DISEASE_FORMS, ...customForms],
      customForms,
      ready,
      reload,
    }),
    [customForms, ready, reload]
  );

  return (
    <DiseaseFormsContext.Provider value={value}>{children}</DiseaseFormsContext.Provider>
  );
}

export function useDiseaseForms() {
  return useContext(DiseaseFormsContext);
}

export function useDiseaseForm(id: string | undefined) {
  const { forms } = useDiseaseForms();
  return useMemo(() => (id ? forms.find((f) => f.id === id) : undefined), [forms, id]);
}
