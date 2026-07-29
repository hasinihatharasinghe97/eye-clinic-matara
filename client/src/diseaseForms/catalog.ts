import type { DiseaseFormDef } from './types';
import { FORM_PART_1 } from './catalogPart1';
import { FORM_PART_2 } from './catalogPart2';
import { FORM_PART_3 } from './catalogPart3';

/** Built-in clinic PDF proformas (not editable in the form builder). */
export const BUILTIN_DISEASE_FORMS: DiseaseFormDef[] = [
  ...FORM_PART_1,
  ...FORM_PART_2,
  ...FORM_PART_3,
];

let customFormsCache: DiseaseFormDef[] = [];

/** Keep a module cache in sync so helpers work outside React (e.g. route crumbs). */
export function setCustomDiseaseForms(forms: DiseaseFormDef[]) {
  customFormsCache = forms.map((f) => ({
    id: f.id,
    title: f.title,
    shortTitle: f.shortTitle,
    fields: f.fields || [],
  }));
}

export function getCustomDiseaseForms(): DiseaseFormDef[] {
  return customFormsCache;
}

export function getAllDiseaseForms(): DiseaseFormDef[] {
  return [...BUILTIN_DISEASE_FORMS, ...customFormsCache];
}

/** @deprecated Prefer getAllDiseaseForms() or useDiseaseForms() for live custom forms. */
export const DISEASE_FORMS = BUILTIN_DISEASE_FORMS;

export function getDiseaseForm(id: string): DiseaseFormDef | undefined {
  return getAllDiseaseForms().find((f) => f.id === id);
}

export function diseaseFormTitle(id: string): string {
  return getDiseaseForm(id)?.shortTitle || id;
}

export function isBuiltinDiseaseForm(id: string): boolean {
  return BUILTIN_DISEASE_FORMS.some((f) => f.id === id);
}
