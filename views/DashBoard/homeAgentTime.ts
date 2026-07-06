type ResolvedTimeRange = {
  start?: number;
  end?: number;
};

const DATE_TIME_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/;
const RANGE_SEPARATOR_PATTERN = /\s*(?:~|至|到|,)\s*/;

const applyDateMath = (expression: string, base = Date.now()) => {
  let matchedLength = 0;
  let value = new Date(base);
  const pattern = /([+-])(\d+)(ms|s|m|h|d|w|M|y)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(expression)) !== null) {
    const [, signValue, amountValue, unit] = match;
    const sign = signValue === '-' ? -1 : 1;
    const amount = Number(amountValue);
    const next = new Date(value);

    if (unit === 'ms') next.setMilliseconds(next.getMilliseconds() + sign * amount);
    else if (unit === 's') next.setSeconds(next.getSeconds() + sign * amount);
    else if (unit === 'm') next.setMinutes(next.getMinutes() + sign * amount);
    else if (unit === 'h') next.setHours(next.getHours() + sign * amount);
    else if (unit === 'd') next.setDate(next.getDate() + sign * amount);
    else if (unit === 'w') next.setDate(next.getDate() + sign * amount * 7);
    else if (unit === 'M') next.setMonth(next.getMonth() + sign * amount);
    else if (unit === 'y') next.setFullYear(next.getFullYear() + sign * amount);

    value = next;
    matchedLength += match[0].length;
  }

  if (matchedLength !== expression.length) {
    return undefined;
  }

  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const parsePlainTime = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return undefined;
  }

  if (/^\d+$/.test(raw)) {
    const timestamp = Number(raw);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  const matched = raw.match(DATE_TIME_PATTERN);
  if (matched) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = matched;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).getTime();
  }

  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const resolveTimePoint = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const raw = String(value).trim().replace(/^now\(\)/, 'now');
  if (raw === 'now') {
    return Date.now();
  }
  if (raw.startsWith('now')) {
    return applyDateMath(raw.slice(3), Date.now());
  }

  return parsePlainTime(value);
};

const resolveRangeText = (value: string): ResolvedTimeRange | undefined => {
  const text = value.trim();
  const compact = text.replace(/\s+/g, '');
  const relative = compact.match(/^(?:last|past|recent|最近|近|过去)(\d+)(ms|s|sec|second|seconds|min|minute|minutes|m|h|hour|hours|d|day|days|w|week|weeks|M|month|months|分钟|小时|天|周|月)$/i);
  if (relative) {
    const [, amount, unit] = relative;
    const unitKey = unit === 'M' ? unit : unit.toLowerCase();
    const normalizedUnit = ({
      sec: 's',
      second: 's',
      seconds: 's',
      min: 'm',
      minute: 'm',
      minutes: 'm',
      hour: 'h',
      hours: 'h',
      day: 'd',
      days: 'd',
      week: 'w',
      weeks: 'w',
      month: 'M',
      months: 'M',
      分钟: 'm',
      小时: 'h',
      天: 'd',
      周: 'w',
      月: 'M',
    } as Record<string, string>)[unitKey] || unitKey;
    const from = applyDateMath(`-${amount}${normalizedUnit}`);
    return { start: from, end: Date.now() };
  }

  const parts = text.split(RANGE_SEPARATOR_PATTERN).filter(Boolean);
  if (parts.length >= 2) {
    return {
      start: resolveTimePoint(parts[0]),
      end: resolveTimePoint(parts[1]),
    };
  }

  return undefined;
};

const resolveRangeValue = (value: unknown): ResolvedTimeRange | undefined => {
  if (Array.isArray(value)) {
    return {
      start: resolveTimePoint(value[0]),
      end: resolveTimePoint(value[1]),
    };
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return {
      start: resolveTimePoint(record.from ?? record.start ?? record.startTime),
      end: resolveTimePoint(record.to ?? record.end ?? record.endTime),
    };
  }

  if (typeof value === 'string') {
    return resolveRangeText(value);
  }

  return undefined;
};

export const resolveAlarmRecordTimeRange = (args: Record<string, any>): ResolvedTimeRange => {
  // Alarm record CRUD queries use timestamp ranges; dashboard trend/rank keeps date math server-side.
  const range = resolveRangeValue(args.timeRange ?? args.range ?? args.date ?? args.period);
  const start = resolveTimePoint(args.from ?? args.start ?? args.startTime) ?? range?.start;
  const end = resolveTimePoint(args.to ?? args.end ?? args.endTime) ?? range?.end;

  if (start !== undefined && end !== undefined && start > end) {
    return { start: end, end: start };
  }

  return { start, end };
};
