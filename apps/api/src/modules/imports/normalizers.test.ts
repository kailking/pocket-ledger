import { describe, expect, it } from "vitest";

import {
  collectCategoryKeys,
  rebuildLoanRecords,
  resolveTransactionKind,
  type ParsedLoanInput,
  type ParsedTransactionInput
} from "./normalizers.js";
import { importedLoanGroupForLoan } from "./loanGroupRules.js";

const income = "\u6536\u5165";
const expense = "\u652f\u51fa";
const transfer = "\u8f6c\u8d26";
const loanOut = "\u501f\u51fa";
const loanIn = "\u501f\u5165";
const receive = "\u6536\u6b3e";
const repay = "\u8fd8\u6b3e";

describe("import normalizers", () => {
  it("keeps category type from the original income or expense column", () => {
    const rows: ParsedTransactionInput[] = [
      { ioType: income, category: "Custom", amount: 100 },
      { ioType: expense, category: "Custom", amount: -20 },
      { ioType: income, category: "Bonus", amount: 10 },
      { ioType: expense, category: transfer, amount: -10 }
    ];

    expect(resolveTransactionKind(rows[0]!)).toBe("income");
    expect(resolveTransactionKind(rows[1]!)).toBe("expense");
    expect(collectCategoryKeys(rows)).toEqual([
      { name: "Custom", type: "income" },
      { name: "Custom", type: "expense" },
      { name: "Bonus", type: "income" }
    ]);
  });

  it("rebuilds receivable loans by applying receipts to the oldest open principal", () => {
    const rows: ParsedLoanInput[] = [
      { rowNumber: 2, happenedOn: "2026-01-01", loanType: loanOut, counterparty: "A", amount: 100, interest: 0, account: "cash", book: "default", note: "", raw: {} },
      { rowNumber: 3, happenedOn: "2026-01-10", loanType: receive, counterparty: "A", amount: 40, interest: 0, account: "cash", book: "default", note: "", raw: {} },
      { rowNumber: 4, happenedOn: "2026-01-20", loanType: receive, counterparty: "A", amount: 60, interest: 5, account: "cash", book: "default", note: "", raw: {} }
    ];

    const result = rebuildLoanRecords(rows);

    expect(result.warnings).toHaveLength(0);
    expect(result.loans).toHaveLength(1);
    expect(result.loans[0]).toMatchObject({
      direction: "receivable",
      principalAmount: 100,
      remainingAmount: 0,
      interestAmount: 5,
      status: "closed"
    });
    expect(result.loans[0]?.entries.map((entry) => [entry.type, entry.amount])).toEqual([
      ["principal", 100],
      ["repayment", 40],
      ["repayment", 60],
      ["interest", 5]
    ]);
  });

  it("rebuilds payable loans by applying repayments to the oldest open principal", () => {
    const rows: ParsedLoanInput[] = [
      { rowNumber: 2, happenedOn: "2026-01-01", loanType: loanIn, counterparty: "B", amount: 100, interest: 0, account: "cash", book: "default", note: "", raw: {} },
      { rowNumber: 3, happenedOn: "2026-01-10", loanType: repay, counterparty: "B", amount: 30, interest: 0, account: "cash", book: "default", note: "", raw: {} }
    ];

    const result = rebuildLoanRecords(rows);

    expect(result.warnings).toHaveLength(0);
    expect(result.loans).toHaveLength(1);
    expect(result.loans[0]).toMatchObject({
      direction: "payable",
      principalAmount: 100,
      remainingAmount: 70,
      status: "open"
    });
  });

  it("splits a receipt across the oldest matching receivable loans", () => {
    const rows: ParsedLoanInput[] = [
      { rowNumber: 2, happenedOn: "2026-01-01", loanType: loanOut, counterparty: "A", amount: 100, interest: 0, account: "cash", book: "default", note: "first", raw: {} },
      { rowNumber: 3, happenedOn: "2026-01-02", loanType: loanOut, counterparty: "A", amount: 50, interest: 0, account: "cash", book: "default", note: "second", raw: {} },
      { rowNumber: 4, happenedOn: "2026-01-03", loanType: receive, counterparty: "A", amount: 120, interest: 0, account: "cash", book: "default", note: "receipt", raw: {} }
    ];

    const result = rebuildLoanRecords(rows);

    expect(result.warnings).toHaveLength(0);
    expect(result.loans.map((loan) => [loan.sourceRowNumber, loan.remainingAmount, loan.status])).toEqual([
      [2, 0, "closed"],
      [3, 30, "open"]
    ]);
    expect(result.loans.flatMap((loan) => loan.entries.map((entry) => [loan.sourceRowNumber, entry.sourceRowNumber, entry.type, entry.amount]))).toEqual([
      [2, 2, "principal", 100],
      [2, 4, "repayment", 100],
      [3, 3, "principal", 50],
      [3, 4, "repayment", 20]
    ]);
  });

  it("maps 2026 imported loans into separate project loan groups", () => {
    const result = rebuildLoanRecords([
      { rowNumber: 2, happenedOn: "2025-12-31", loanType: loanOut, counterparty: "Old", amount: 500, interest: 0, account: "cash", book: "default", note: "", raw: {} },
      { rowNumber: 3, happenedOn: "2026-03-21", loanType: loanOut, counterparty: "Project", amount: 1000, interest: 0, account: "cash", book: "default", note: "", raw: {} },
      { rowNumber: 4, happenedOn: "2026-04-28", loanType: loanIn, counterparty: "Lender", amount: 420, interest: 0, account: "cash", book: "default", note: "专项资金", raw: {} }
    ]);

    expect(result.loans.map((loan) => importedLoanGroupForLoan(loan).name)).toEqual(["应收账", "专项借出", "专项借入"]);
  });
});
