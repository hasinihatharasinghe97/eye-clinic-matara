import { useEffect } from 'react';

/** Sets the browser tab title. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
