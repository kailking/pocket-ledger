import type { CategorySummary, EntryMode } from "@pocket-ledger/shared";

export interface LedgerTransaction {
  id: string;
  type: EntryMode | "balance_adjustment" | "loan";
  happenedOn: string;
  dateLabel: string;
  category: string;
  note: string;
  amount: string;
  displayAmount?: string;
  transferAmount?: string;
  account: string;
  accountId?: string;
  categoryId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  member?: string;
  memberId?: string;
  icon: string;
  color: string;
}

export interface LedgerAccount {
  id: string;
  name: string;
  type: string;
  kind: "asset" | "liability";
  initialBalance?: string;
  balance: string;
  color: string;
  icon: string;
  includeInAssets: boolean;
  virtual?: boolean;
  loanGroupId?: string;
}

export const fallbackExpenseCategories: CategorySummary[] = [
  { id: "general", name: "一般", type: "expense", icon: "star", color: "#8FD8F7", sortOrder: 1 },
  { id: "food", name: "餐饮饮料", type: "expense", icon: "utensils", color: "#FFC76F", sortOrder: 2 },
  { id: "traffic", name: "交通出行", type: "expense", icon: "bus-front", color: "#98AAFF", sortOrder: 3 },
  { id: "shopping", name: "日用购物", type: "expense", icon: "shopping-bag", color: "#8ABEF0", sortOrder: 4 },
  { id: "home", name: "居家生活", type: "expense", icon: "home", color: "#8ABBE5", sortOrder: 5 },
  { id: "software", name: "软件服务", type: "expense", icon: "briefcase-business", color: "#2E9BDE", sortOrder: 6 },
  { id: "fuel", name: "加油", type: "expense", icon: "fuel", color: "#74CFC5", sortOrder: 7 },
  { id: "travel", name: "旅行", type: "expense", icon: "plane", color: "#B4A0DF", sortOrder: 8 },
  { id: "gift", name: "礼品人情", type: "expense", icon: "gift", color: "#FF8F98", sortOrder: 9 }
];

export const fallbackIncomeCategories: CategorySummary[] = [
  { id: "salary", name: "工资收入", type: "income", icon: "briefcase-business", color: "#5CB5CE", sortOrder: 1 },
  { id: "refund", name: "退款", type: "income", icon: "hand-coins", color: "#8BE0B2", sortOrder: 2 },
  { id: "invest", name: "投资收入", type: "income", icon: "circle-dollar-sign", color: "#D66D1E", sortOrder: 3 },
  { id: "income_cash", name: "现金", type: "income", icon: "wallet", color: "#C7847A", sortOrder: 4 },
  { id: "bonus", name: "礼金", type: "income", icon: "gift", color: "#FF8F98", sortOrder: 5 }
];

export const fallbackAccounts: LedgerAccount[] = [
  { id: "cash", name: "现金钱包", type: "cash", kind: "asset", balance: "3200.00", color: "#58B982", icon: "badge-yen-sign", includeInAssets: true },
  { id: "debit", name: "储蓄卡", type: "debit_card", kind: "asset", balance: "12000.00", color: "#5F9FD0", icon: "credit-card", includeInAssets: true },
  { id: "wallet", name: "移动钱包", type: "wallet", kind: "asset", balance: "860.00", color: "#9DBA57", icon: "wallet", includeInAssets: true },
  { id: "credit", name: "信用卡", type: "credit_card", kind: "liability", balance: "2800.00", color: "#C86464", icon: "landmark", includeInAssets: true }
];

export const members = ["我", "家庭", "项目", "演示成员"];

export function getMonthSummary(transactions: LedgerTransaction[]) {
  return transactions.reduce(
    (summary, transaction) => {
      const amount = Number(transaction.amount);
      if (transaction.type === "income") summary.income += amount;
      if (transaction.type === "expense") summary.expense += Math.abs(amount);
      return summary;
    },
    { income: 0, expense: 0 }
  );
}
