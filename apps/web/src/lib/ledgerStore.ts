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
}

export const fallbackExpenseCategories: CategorySummary[] = [
  { id: "general", name: "一般", type: "expense", icon: "star", color: "#8FD8F7", sortOrder: 1 },
  { id: "food", name: "餐饮饮料", type: "expense", icon: "utensils", color: "#FFC76F", sortOrder: 2 },
  { id: "traffic", name: "交通出行", type: "expense", icon: "bus-front", color: "#98AAFF", sortOrder: 3 },
  { id: "wine", name: "烟茶酒水", type: "expense", icon: "wine", color: "#8ABEF0", sortOrder: 4 },
  { id: "home", name: "房租房费", type: "expense", icon: "home", color: "#8ABBE5", sortOrder: 5 },
  { id: "project", name: "项目运营成本", type: "expense", icon: "briefcase-business", color: "#2E9BDE", sortOrder: 6 },
  { id: "fuel", name: "加油", type: "expense", icon: "fuel", color: "#74CFC5", sortOrder: 7 },
  { id: "travel", name: "旅行", type: "expense", icon: "plane", color: "#B4A0DF", sortOrder: 8 },
  { id: "gift", name: "红包", type: "expense", icon: "gift", color: "#FF8F98", sortOrder: 9 }
];

export const fallbackIncomeCategories: CategorySummary[] = [
  { id: "install", name: "源码安装", type: "income", icon: "briefcase-business", color: "#5CB5CE", sortOrder: 1 },
  { id: "refund", name: "退款", type: "income", icon: "hand-coins", color: "#8BE0B2", sortOrder: 2 },
  { id: "invest", name: "投资收入", type: "income", icon: "circle-dollar-sign", color: "#D66D1E", sortOrder: 3 },
  { id: "income_cash", name: "现金", type: "income", icon: "wallet", color: "#C7847A", sortOrder: 4 },
  { id: "bonus", name: "红包", type: "income", icon: "gift", color: "#FF8F98", sortOrder: 5 }
];

export const fallbackAccounts: LedgerAccount[] = [
  { id: "cash", name: "现金", type: "cash", kind: "asset", balance: "52260.00", color: "#58B982", icon: "badge-yen-sign", includeInAssets: true },
  { id: "alipay", name: "支付宝", type: "alipay", kind: "asset", balance: "40368.81", color: "#F1C66B", icon: "wallet", includeInAssets: true },
  { id: "wechat", name: "微信", type: "wechat", kind: "asset", balance: "95.38", color: "#9DBA57", icon: "wallet", includeInAssets: true },
  { id: "citic", name: "中信银行", type: "debit_card", kind: "asset", balance: "120242.53", color: "#C86464", icon: "landmark", includeInAssets: true }
];

export const members = ["我", "项目花费", "鼠", "智", "辉", "国威"];

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
