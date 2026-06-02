import crypto from "node:crypto";

import type { RebuiltLoan } from "./normalizers.js";

export const defaultReceivableGroupId = "loan_group_receivable_default";
export const defaultPayableGroupId = "loan_group_payable_default";

export type ImportedLoanGroupRule = {
  id: string;
  name: string;
  direction: RebuiltLoan["direction"];
  color: string;
  icon: string;
  includeInAssets: 0 | 1;
  sortOrder: number;
};

export function defaultLoanGroupId(direction: RebuiltLoan["direction"]) {
  return direction === "receivable" ? defaultReceivableGroupId : defaultPayableGroupId;
}

function stableGroupId(direction: RebuiltLoan["direction"], name: string) {
  const hash = crypto.createHash("sha1").update(`${direction}:${name}`).digest("hex").slice(0, 12);
  return `loan_group_${direction}_${hash}`;
}

export function importedLoanGroupForLoan(loan: RebuiltLoan): ImportedLoanGroupRule {
  if (loan.happenedOn >= "2026-01-01") {
    if (loan.direction === "receivable") {
      const name = "专项借出";
      return {
        id: stableGroupId("receivable", name),
        name,
        direction: "receivable",
        color: "#E889BE",
        icon: "hand-coins",
        includeInAssets: 1,
        sortOrder: 20
      };
    }

    const name = "专项借入";
    return {
      id: stableGroupId("payable", name),
      name,
      direction: "payable",
      color: "#6F8FE8",
      icon: "receipt-text",
      includeInAssets: 1,
      sortOrder: 20
    };
  }

  return {
    id: defaultLoanGroupId(loan.direction),
    name: loan.direction === "receivable" ? "应收账" : "应付账",
    direction: loan.direction,
    color: loan.direction === "receivable" ? "#46B98F" : "#C86464",
    icon: loan.direction === "receivable" ? "hand-coins" : "receipt-text",
    includeInAssets: loan.direction === "receivable" ? 1 : 0,
    sortOrder: 10
  };
}
