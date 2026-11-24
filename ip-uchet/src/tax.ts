import type { Entry, Profile, Regime } from './store.js';

export const NPD_LIMIT_YEAR = 2_400_000;
export const NPD_DEDUCTION = 10_000;
export const USN6_RATE = 0.06;
export const USN15_RATE = 0.15;
export const DEFAULT_FIXED_CONTRIBUTIONS = 57_390;

export function npdRate(payerType: 'person' | 'company' | undefined): number {
  return payerType === 'company' ? 0.06 : 0.04;
}

export interface MonthSummary {
  month: string;
  income: number;
  expenses: number;
  tax: number;
  taxLabel: string;
}

export interface YearSummary {
  year: number;
  regime: Regime;
  months: MonthSummary[];
  yearIncome: number;
  yearExpenses: number;
  yearTax: number;
  npdLimitLeft: number | null;
  nextDeadlines: { date: string; label: string }[];
  categories: { category: string; income: number; expense: number }[];
  comparison: { npd: number; usn6: number; usn15: number; best: Regime };
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function npdMonthTax(incomes: Entry[]): number {
  return incomes.reduce((sum, e) => sum + e.amount * npdRate(e.payerType), 0);
}

export function summarize(entries: Entry[], profile: Profile, year: number, now = new Date()): YearSummary {
  const months: MonthSummary[] = [];
  let deductionLeft = profile.regime === 'npd' ? NPD_DEDUCTION : 0;
  let yearIncome = 0;
  let yearExpenses = 0;
  let yearTax = 0;

  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    const inMonth = entries.filter((e) => e.type === 'income' && monthKey(e.date) === ym);
    const outMonth = entries.filter((e) => e.type === 'expense' && monthKey(e.date) === ym);
    const income = inMonth.reduce((s, e) => s + e.amount, 0);
    const expenses = outMonth.reduce((s, e) => s + e.amount, 0);
    let tax = 0;
    let taxLabel = '';
    if (profile.regime === 'npd') {
      tax = npdMonthTax(inMonth);
      if (deductionLeft > 0 && tax > 0) {
        const applied = Math.min(deductionLeft, tax);
        tax -= applied;
        deductionLeft -= applied;
      }
      taxLabel = 'НПД (4%/6%)';
    } else if (profile.regime === 'usn6') {
      tax = income * USN6_RATE;
      taxLabel = 'УСН 6% (взносы вычитаются помесячно пропорционально)';
    } else {
      tax = Math.max(0, (income - expenses) * USN15_RATE);
      taxLabel = 'УСН 15% (доходы минус расходы)';
    }
    if (income > 0 || expenses > 0 || profile.regime === 'npd') {
      months.push({ month: ym, income, expenses, tax: Math.round(tax * 100) / 100, taxLabel });
      yearIncome += income;
      yearExpenses += expenses;
      yearTax += tax;
    }
  }

  if (profile.regime === 'usn6' && profile.status === 'ip') {
    const contributions = profile.fixedContributions || DEFAULT_FIXED_CONTRIBUTIONS;
    yearTax = Math.max(0, yearTax - contributions);
    for (const mo of months) {
      const share = contributions / 12;
      mo.tax = Math.max(0, Math.round((mo.tax - share) * 100) / 100);
    }
  }

  const deadlines: { date: string; label: string }[] = [];
  const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (profile.regime === 'npd') {
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      const dl = `${addMonths(ym, 1)}-28`;
      if (dl >= `${curYm}-01` && entries.some((e) => e.type === 'income' && monthKey(e.date) === ym)) {
        deadlines.push({ date: dl, label: `НПД за ${ym} — до 28 числа след. месяца` });
      }
    }
  } else {
    const quarterEnds = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`];
    const quarterDeadlines = [`${year}-04-28`, `${year}-07-28`, `${year}-10-28`, `${year + 1}-04-28`];
    quarterEnds.forEach((q, i) => {
      if (quarterDeadlines[i] >= `${curYm}-01`) {
        deadlines.push({ date: quarterDeadlines[i], label: i === 3 ? `УСН за ${year} год (ИП) — до 28.04.${year + 1}` : `УСН аванс за Q${i + 1} ${year} — до ${quarterDeadlines[i]}` });
      }
    });
  }

  const byCategory: Record<string, { income: number; expense: number }> = {};
  for (const e of entries) {
    const b = (byCategory[e.category] ??= { income: 0, expense: 0 });
    if (e.type === 'income') b.income += e.amount;
    else b.expense += e.amount;
  }
  const categories = Object.entries(byCategory)
    .map(([category, v]) => ({ category, income: Math.round(v.income * 100) / 100, expense: Math.round(v.expense * 100) / 100 }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense));

  const npdGross = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount * npdRate(e.payerType), 0);
  const contributions = profile.fixedContributions || DEFAULT_FIXED_CONTRIBUTIONS;
  const comparison = {
    npd: Math.round(Math.max(0, npdGross - NPD_DEDUCTION) * 100) / 100,
    usn6: Math.round(Math.max(0, yearIncome * USN6_RATE - (profile.status === 'ip' ? contributions : 0)) * 100) / 100,
    usn15: Math.round(Math.max(0, (yearIncome - yearExpenses) * USN15_RATE) * 100) / 100,
  };
  const best = (Object.entries(comparison) as [Regime, number][]).sort((a, b) => a[1] - b[1])[0][0];

  return {
    year,
    regime: profile.regime,
    months,
    yearIncome: Math.round(yearIncome * 100) / 100,
    yearExpenses: Math.round(yearExpenses * 100) / 100,
    yearTax: Math.round(yearTax * 100) / 100,
    npdLimitLeft: profile.regime === 'npd' ? Math.max(0, NPD_LIMIT_YEAR - yearIncome) : null,
    nextDeadlines: deadlines.slice(0, 6),
    categories,
    comparison: { ...comparison, best },
  };
}
