/**
 * Utility functions for date and time handling, specifically for Colombia (UTC-5)
 */

/**
 * Returns a proper ISO string in UTC.
 * We use this to save to the database so that it's standard.
 */
export const getNowISO = (): string => {
  return new Date().toISOString();
};

/**
 * Returns just the date part in Colombia timezone (YYYY-MM-DD)
 */
export const getColombiaDateString = (): string => {
  const date = new Date();
  // 'en-CA' locale uses YYYY-MM-DD format
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date).trim();
};

/**
 * Returns the current time in Colombia (HH:mm)
 */
export const getColombiaTimeShort = (): string => {
  const date = new Date();
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

/**
 * Returns a local ISO string (YYYY-MM-DDTHH:mm:ss) for Colombia.
 * Useful for datetime-local inputs.
 */
export const getColombiaISO = (): string => {
  const date = new Date();
  const datePart = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
  
  return `${datePart.trim()}T${timePart.trim()}`;
};

/**
 * Returns a display string forced to Colombia timezone.
 * Format: DD/MM/YYYY HH:mm
 */
export const formatColombia = (dateInput: any): string => {
  if (!dateInput) return '';
  try {
    let date: Date;
    if (dateInput.toDate && typeof dateInput.toDate === 'function') {
      date = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
      // If it's a date-only string (YYYY-MM-DD), its interpretation as UTC can cause shifts
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        // Create the date using explicit year, month, day to avoid timezone issues
        const [y, m, d] = dateInput.split('-').map(Number);
        date = new Date(y, m - 1, d, 12, 0, 0); // Noon to stay within the same day
      } else {
        date = new Date(dateInput);
      }
    } else {
      date = dateInput;
    }
    
    if (!(date instanceof Date) || isNaN(date.getTime())) return String(dateInput);
    
    // For date-only inputs (when hours/minutes are not needed or were artificial)
    // we use a specific formatter if the input was YYYY-MM-DD
    const isDateOnly = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput);

    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: isDateOnly ? undefined : '2-digit',
      minute: isDateOnly ? undefined : '2-digit',
      hour12: false
    }).format(date);
  } catch (e) {
    return String(dateInput);
  }
};
