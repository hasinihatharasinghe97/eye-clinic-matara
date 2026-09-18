/** Normalize local/international numbers for wa.me (default Sri Lanka +94). */
export function toWhatsAppNumber(raw: string, defaultCountry = '94'): string | null {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);

  // +94 077… → 94077… → strip the extra 0 after country code
  if (digits.startsWith(defaultCountry + '0') && digits.length >= defaultCountry.length + 10) {
    digits = defaultCountry + digits.slice(defaultCountry.length + 1);
  }

  if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1);

  // Local mobile without leading 0 (e.g. 771234567)
  if (!digits.startsWith(defaultCountry) && digits.length === 9) {
    digits = defaultCountry + digits;
  }

  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function whatsAppChatUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phoneDigits}?text=${text}`;
}

export function canShareFiles(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  } catch {
    return false;
  }
}

/** True when this browser can share File objects (typical on Android Chrome / iOS Safari). */
export function canSharePdfFile(file: File): boolean {
  if (!canShareFiles()) return false;
  try {
    if (typeof navigator.canShare !== 'function') return true;
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Share a PDF via the system share sheet (user picks WhatsApp).
 * Note: browsers cannot force a specific WhatsApp contact when sharing a file.
 */
export async function sharePdfToWhatsApp(opts: {
  file: File;
  message: string;
  title?: string;
}): Promise<'shared' | 'unsupported' | 'aborted'> {
  const { file, message, title } = opts;
  if (!canShareFiles()) return 'unsupported';

  const pdf =
    file.type === 'application/pdf'
      ? file
      : new File([file], file.name || 'medicine.pdf', { type: 'application/pdf' });

  const payload: ShareData = {
    title: title || 'Medicine PDF',
    text: message,
    files: [pdf],
  };

  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
      return 'unsupported';
    }
    await navigator.share(payload);
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';
    return 'unsupported';
  }
}

/** Open WhatsApp to a number. Uses location assign when possible to avoid popup blockers. */
export function openWhatsAppChat(phoneDigits: string, message: string, preOpened?: Window | null) {
  const url = whatsAppChatUrl(phoneDigits, message);
  if (preOpened && !preOpened.closed) {
    preOpened.location.href = url;
    return;
  }
  // Prefer same-tab navigation on mobile so async clicks are not blocked
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = url;
    return;
  }
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) window.location.href = url;
}

/** Trigger a PDF download so the doctor can attach it in WhatsApp if share is unavailable. */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name || 'medicine.pdf';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function defaultMedicineMessage(
  patientName: string,
  clinic = 'Nethraloka Ayurvedic Eye Clinic',
  medicineNo?: number
) {
  const med =
    medicineNo != null && medicineNo !== undefined
      ? `\n\nMedicine reference: #${medicineNo}`
      : '';
  return `Dear ${patientName},\n\nPlease find your medicine details from ${clinic}.${med}\n\nThank you.`;
}
