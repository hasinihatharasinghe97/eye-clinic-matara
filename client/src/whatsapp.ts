/** Normalize local/international numbers for WhatsApp (default Sri Lanka +94). */
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

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Universal link — works on phones; on desktop shows the wa.me landing page. */
export function whatsAppMeUrl(phoneDigits: string, message: string): string {
  const text = String(message || '').trim();
  if (!text) return `https://wa.me/${phoneDigits}`;
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

/**
 * Opens WhatsApp Web chat directly (desktop clinic PC / browser).
 * Avoids the wa.me “Open app / Continue to WhatsApp Web” interstitial.
 */
export function whatsAppWebUrl(phoneDigits: string, message: string): string {
  const text = String(message || '').trim();
  const base = `https://web.whatsapp.com/send?phone=${phoneDigits}`;
  if (!text) return base;
  return `${base}&text=${encodeURIComponent(text)}`;
}

/** Best https URL for the current device. */
export function whatsAppChatUrl(phoneDigits: string, message: string): string {
  return isMobileBrowser()
    ? whatsAppMeUrl(phoneDigits, message)
    : whatsAppWebUrl(phoneDigits, message);
}

/** Native app deep link — often opens the WhatsApp app chat faster on phones. */
export function whatsAppAppLink(phoneDigits: string, message: string): string {
  const text = String(message || '').trim();
  if (!text) return `whatsapp://send?phone=${phoneDigits}`;
  return `whatsapp://send?phone=${phoneDigits}&text=${encodeURIComponent(text)}`;
}

export function canShareFiles(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  } catch {
    return false;
  }
}

export function canSharePdfFile(file: File): boolean {
  if (!canShareFiles()) return false;
  try {
    if (typeof navigator.canShare !== 'function') return true;
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function sharePdfToWhatsApp(opts: {
  file: File;
  message: string;
  title?: string;
  phoneHint?: string;
}): Promise<'shared' | 'unsupported' | 'aborted'> {
  const { file, message, title, phoneHint } = opts;
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }

  const pdf =
    file.type === 'application/pdf'
      ? file
      : new File([file], file.name || 'medicine.pdf', { type: 'application/pdf' });

  const text = phoneHint ? `${message}\n\n(Patient WhatsApp: +${phoneHint})` : message;

  const withFiles: ShareData = {
    title: title || 'Medicine PDF',
    text,
    files: [pdf],
  };

  try {
    // Prefer sharing the file (opens share sheet → WhatsApp with PDF)
    if (typeof navigator.canShare !== 'function' || navigator.canShare(withFiles)) {
      await navigator.share(withFiles);
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';
    // fall through and try without canShare gate
  }

  try {
    await navigator.share(withFiles);
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';
    return 'unsupported';
  }
}

/**
 * Open WhatsApp chat with this phone + message.
 * Desktop → WhatsApp Web directly; phone → app deep link with wa.me fallback.
 * Must be called from a user tap when possible; pass a pre-opened window if you opened
 * `about:blank` synchronously before any `await`.
 */
export function openWhatsAppChat(phoneDigits: string, message: string, preOpened?: Window | null) {
  const httpsUrl = whatsAppChatUrl(phoneDigits, message);
  const appUrl = whatsAppAppLink(phoneDigits, message);
  const isMobile = isMobileBrowser();

  if (preOpened && !preOpened.closed) {
    preOpened.location.href = isMobile ? appUrl : httpsUrl;
    // If the app link fails on some devices, fall back shortly via https in the same window
    if (isMobile) {
      setTimeout(() => {
        try {
          if (preOpened && !preOpened.closed) preOpened.location.href = httpsUrl;
        } catch {
          /* ignore */
        }
      }, 800);
    }
    return;
  }

  // Programmatic <a click> is more reliable than window.open after async work
  const a = document.createElement('a');
  a.href = isMobile ? appUrl : httpsUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();

  if (isMobile) {
    setTimeout(() => {
      const fallback = document.createElement('a');
      fallback.href = httpsUrl;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      document.body.appendChild(fallback);
      fallback.click();
      fallback.remove();
    }, 900);
  }
}

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
