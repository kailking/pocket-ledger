export type TransactionKind =
  | "income"
  | "expense"
  | "transfer_in"
  | "transfer_out"
  | "balance_adjustment"
  | "loan";

export type EntryMode = "income" | "expense" | "transfer";

export type AccountKind = "asset" | "liability";

export type AccountType =
  | "cash"
  | "debit_card"
  | "alipay"
  | "wechat"
  | "network"
  | "investment"
  | "credit_card"
  | "huabei"
  | "jd_baitiao"
  | "receivable"
  | "payable"
  | "custom";

export type CategoryType = "income" | "expense";

export type LoanDirection = "receivable" | "payable";

export type LoanStatus = "open" | "closed";

export type LoanEntryType = "principal" | "repayment" | "interest";

export type ImportStatus = "pending" | "imported" | "failed";

export type ReportPeriod = "month" | "year";

export interface MoneySummary {
  income: string;
  expense: string;
  balance: string;
}

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  kind: AccountKind;
  balance: string;
  color: string;
  icon: string;
  includeInAssets: boolean;
}

export interface CategorySummary {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  sortOrder: number;
}

export interface TransactionSummary {
  id: string;
  kind: TransactionKind;
  happenedOn: string;
  amount: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  accountName: string;
  note?: string;
  transferId?: string;
  loanId?: string;
}

export interface TimelineDay {
  date: string;
  income: string;
  expense: string;
  transactions: TransactionSummary[];
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const APP_NAME = "Pocket Ledger";

export const DEFAULT_CURRENCY = "CNY";

export const SPECIAL_CATEGORY_NAMES = {
  transfer: "转账",
  balanceAdjustment: "余额变更",
  borrow: "借入",
  lend: "借出",
  repayment: "还款",
  collection: "收款"
} as const;

