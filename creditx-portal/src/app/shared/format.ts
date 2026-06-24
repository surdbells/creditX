/** Format a numeric/string amount as Naira currency. */
export function money(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  if (isNaN(n as number)) {
    return '₦0.00';
  }
  return '₦' + (n as number).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Human label for a loan status enum value. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return status
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Tailwind/cx badge class for a loan status. */
export function statusBadge(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'DISBURSED':
    case 'CLOSED':
      return 'cx-badge-success';
    case 'APPROVED':
      return 'cx-badge-gold';
    case 'REJECTED':
    case 'OVERDUE':
    case 'DEFAULTED':
      return 'cx-badge-danger';
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
    case 'CAPTURED':
    case 'DRAFT':
      return 'cx-badge-info';
    default:
      return 'cx-badge-neutral';
  }
}
