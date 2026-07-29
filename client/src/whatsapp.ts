/** Normalize local/International numbers for wa.me (default Sri Lanka +94). */
export function toWhatsAppNumber(raw: string, defaultCountry = '94'): string | null {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1);
  // Local mobile without leading 0 (e.g. 771234567)
  if (!digits.startsWith(defaultCountry) && digits.length === 9) {
    digits = defaultCountry + digits;
  }
  // Already has country code
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function whatsAppChatUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phoneDigits}?text=${text}`;
}

export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    );
  } catch {
    return false;
  }
}

export async function sharePdfToWhatsApp(opts: {
  file: File;
  message: string;
  title?: string;
}): Promise<'shared' | 'unsupported' | 'aborted'> {
  const { file, message, title } = opts;
  if (!canShareFiles()) return 'unsupported';

  const payload: ShareData = {
    title: title || 'Medicine PDF',
    text: message,
    files: [file],
  };

  try {
    if (!navigator.canShare?.(payload)) return 'unsupported';
    await navigator.share(payload);
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';
    return 'unsupported';
  }
}

export function defaultMedicineMessage(patientName: string, clinic = 'Eye Clinic, District Ayurvedic Hospital Matara') {
  return `Dear ${patientName},\n\nPlease find your medicine details from ${clinic}.\n\nThank you.`;
}
