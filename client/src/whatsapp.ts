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

/** HTTPS link that opens WhatsApp to a specific chat (works from a real <a href>). */
export function whatsAppChatUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phoneDigits}?text=${text}`;
}

/** Native app deep link (Android / some iOS cases). */
export function whatsAppAppUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message);
  return `whatsapp://send?phone=${phoneDigits}&text=${text}`;
}

/** Trigger a PDF download so the doctor can attach it in WhatsApp. */
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
