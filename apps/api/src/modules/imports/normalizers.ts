export type ImportTransactionKind = "income" | "expense" | "loan" | "balance_adjustment" | "transfer";
export type CategoryKey = { name: string; type: "income" | "expense" };

export type ParsedTransactionInput = {
  ioType: string;
  category: string;
  amount: number;
};

export type ParsedLoanInput = {
  rowNumber: number;
  happenedOn: string;
  loanType: string;
  counterparty: string;
  amount: number;
  interest: number;
  account: string;
  book: string;
  note: string;
  raw: Record<string, unknown>;
};

export type RebuiltLoanEntry = {
  sourceRowNumber: number;
  type: "principal" | "repayment" | "interest";
  amount: number;
  account: string;
  book: string;
  happenedOn: string;
  note: string;
  raw: Record<string, unknown>;
};

export type RebuiltLoan = {
  sourceRowNumber: number;
  direction: "receivable" | "payable";
  counterparty: string;
  principalAmount: number;
  remainingAmount: number;
  interestAmount: number;
  account: string;
  book: string;
  happenedOn: string;
  status: "open" | "closed";
  note: string;
  raw: Record<string, unknown>;
  entries: RebuiltLoanEntry[];
};

export type LoanRebuildWarning = {
  rowNumber: number;
  level: "warning" | "error";
  message: string;
  raw: Record<string, unknown>;
};

const labels = {
  income: "\u6536\u5165",
  expense: "\u652f\u51fa",
  transfer: "\u8f6c\u8d26",
  balanceAdjustment: "\u4f59\u989d\u53d8\u66f4",
  loanOut: "\u501f\u51fa",
  loanIn: "\u501f\u5165",
  receive: "\u6536\u6b3e",
  repay: "\u8fd8\u6b3e"
};

const labelAliases: Record<string, string[]> = {
  [labels.income]: [labels.income, "鏀跺叆"],
  [labels.expense]: [labels.expense, "鏀嚭"],
  [labels.transfer]: [labels.transfer, "杞处"],
  [labels.balanceAdjustment]: [labels.balanceAdjustment, "浣欓鍙樻洿"],
  [labels.loanOut]: [labels.loanOut, "鍊熷嚭"],
  [labels.loanIn]: [labels.loanIn, "鍊熷叆"],
  [labels.receive]: [labels.receive, "鏀舵"],
  [labels.repay]: [labels.repay, "杩樻"]
};

const loanFlowCategories = new Set([
  ...(labelAliases[labels.loanOut] ?? []),
  ...(labelAliases[labels.loanIn] ?? []),
  ...(labelAliases[labels.receive] ?? []),
  ...(labelAliases[labels.repay] ?? [])
]);

function hasLabel(value: string, label: string) {
  return (labelAliases[label] ?? [label]).some((alias) => value.includes(alias));
}

function toCents(value: number) {
  return Math.round(Math.abs(value) * 100);
}

function fromCents(value: number) {
  return value / 100;
}

export function resolveTransactionKind(row: ParsedTransactionInput): ImportTransactionKind {
  if ((labelAliases[labels.transfer] ?? [labels.transfer]).includes(row.category)) return "transfer";
  if (loanFlowCategories.has(row.category)) return "loan";
  if ((labelAliases[labels.balanceAdjustment] ?? [labels.balanceAdjustment]).includes(row.category)) return "balance_adjustment";
  if (hasLabel(row.ioType, labels.income)) return "income";
  if (hasLabel(row.ioType, labels.expense)) return "expense";
  return row.amount >= 0 ? "income" : "expense";
}

export function collectCategoryKeys(rows: ParsedTransactionInput[]): CategoryKey[] {
  const seen = new Set<string>();
  const keys: CategoryKey[] = [];

  rows.forEach((row) => {
    const kind = resolveTransactionKind(row);
    if (kind !== "income" && kind !== "expense") return;

    const key = `${kind}:${row.category}`;
    if (seen.has(key)) return;
    seen.add(key);
    keys.push({ name: row.category, type: kind });
  });

  return keys;
}

function loanDirection(loanType: string): RebuiltLoan["direction"] {
  return hasLabel(loanType, labels.loanIn) || hasLabel(loanType, labels.repay) ? "payable" : "receivable";
}

function isRepayment(loanType: string) {
  return hasLabel(loanType, labels.receive) || hasLabel(loanType, labels.repay);
}

export function rebuildLoanRecords(rows: ParsedLoanInput[]) {
  const loans: RebuiltLoan[] = [];
  const warnings: LoanRebuildWarning[] = [];
  const sortedRows = rows
    .slice()
    .sort((left, right) => left.happenedOn.localeCompare(right.happenedOn) || left.rowNumber - right.rowNumber);

  sortedRows.forEach((row) => {
    const direction = loanDirection(row.loanType);
    const amountCents = toCents(row.amount);
    const interestCents = toCents(row.interest);

    if (!isRepayment(row.loanType)) {
      loans.push({
        sourceRowNumber: row.rowNumber,
        direction,
        counterparty: row.counterparty,
        principalAmount: fromCents(amountCents),
        remainingAmount: fromCents(amountCents),
        interestAmount: 0,
        account: row.account,
        book: row.book,
        happenedOn: row.happenedOn,
        status: "open",
        note: row.note,
        raw: row.raw,
        entries: [
          {
            sourceRowNumber: row.rowNumber,
            type: "principal",
            amount: fromCents(amountCents),
            account: row.account,
            book: row.book,
            happenedOn: row.happenedOn,
            note: row.note,
            raw: row.raw
          }
        ]
      });
      return;
    }

    let remainingPaymentCents = amountCents;
    let interestAssigned = false;
    const targets = loans
      .filter((loan) => loan.direction === direction && loan.counterparty === row.counterparty && toCents(loan.remainingAmount) > 0)
      .sort((left, right) => left.happenedOn.localeCompare(right.happenedOn) || left.sourceRowNumber - right.sourceRowNumber);

    targets.forEach((loan, index) => {
      if (remainingPaymentCents <= 0) return;

      const loanRemainingCents = toCents(loan.remainingAmount);
      const paidCents = Math.min(remainingPaymentCents, loanRemainingCents);
      loan.remainingAmount = fromCents(loanRemainingCents - paidCents);
      loan.entries.push({
        sourceRowNumber: row.rowNumber,
        type: "repayment",
        amount: fromCents(paidCents),
        account: row.account,
        book: row.book,
        happenedOn: row.happenedOn,
        note: row.note,
        raw: row.raw
      });

      remainingPaymentCents -= paidCents;
      const shouldAssignInterest = interestCents > 0 && !interestAssigned && (remainingPaymentCents <= 0 || index === targets.length - 1);
      if (shouldAssignInterest) {
        loan.interestAmount = fromCents(toCents(loan.interestAmount) + interestCents);
        loan.entries.push({
          sourceRowNumber: row.rowNumber,
          type: "interest",
          amount: fromCents(interestCents),
          account: row.account,
          book: row.book,
          happenedOn: row.happenedOn,
          note: row.note,
          raw: row.raw
        });
        interestAssigned = true;
      }

      loan.status = toCents(loan.remainingAmount) === 0 ? "closed" : "open";
    });

    if (remainingPaymentCents > 0) {
      warnings.push({
        rowNumber: row.rowNumber,
        level: "warning",
        message: "\u6536\u6b3e/\u8fd8\u6b3e\u672a\u627e\u5230\u53ef\u62b5\u6263\u7684\u501f\u8d37\u672c\u91d1",
        raw: row.raw
      });
    }
    if (interestCents > 0 && !interestAssigned) {
      warnings.push({
        rowNumber: row.rowNumber,
        level: "warning",
        message: "\u5229\u606f\u672a\u627e\u5230\u53ef\u5173\u8054\u7684\u501f\u8d37\u8bb0\u5f55",
        raw: row.raw
      });
    }
  });

  return { loans, warnings };
}

export function signedLoanTransactionAmount(
  direction: RebuiltLoan["direction"],
  entryType: RebuiltLoanEntry["type"],
  amount: number
) {
  const absolute = Math.abs(amount);
  if (direction === "receivable") return entryType === "principal" ? -absolute : absolute;
  return entryType === "principal" ? absolute : -absolute;
}
