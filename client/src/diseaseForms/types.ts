export type InputKind = 'text' | 'date' | 'datetime' | 'number' | 'tel';

export type FollowupColumn = {
  key: string;
  label: string;
  inputType?: InputKind;
  placeholder?: string;
  step?: string | number;
  min?: number;
  max?: number;
  unit?: string;
};

export type FormField =
  | { type: 'section'; title: string }
  | {
      type: 'text';
      key: string;
      label: string;
      placeholder?: string;
      inputType?: Exclude<InputKind, 'date' | 'datetime'>;
      unit?: string;
    }
  | {
      type: 'date';
      key: string;
      label: string;
    }
  | {
      type: 'datetime';
      key: string;
      label: string;
    }
  | {
      type: 'number';
      key: string;
      label: string;
      placeholder?: string;
      step?: string | number;
      min?: number;
      max?: number;
      unit?: string;
    }
  | { type: 'textarea'; key: string; label: string; rows?: number }
  | { type: 'select'; key: string; label: string; options: string[]; allowEmpty?: boolean }
  | { type: 'checkboxes'; key: string; label: string; options: string[] }
  | { type: 'radio'; key: string; label: string; options: string[] }
  | {
      type: 'score';
      key: string;
      label: string;
      options: Array<{ value: number; label: string }>;
    }
  | {
      type: 'followup';
      key: string;
      label: string;
      columns: FollowupColumn[];
    };

export type DiseaseFormDef = {
  id: string;
  title: string;
  shortTitle: string;
  fields: FormField[];
};

export type FormDataMap = Record<string, unknown>;
