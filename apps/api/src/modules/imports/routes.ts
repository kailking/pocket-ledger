import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { FastifyPluginAsync } from "fastify";
import * as XLSX from "@e965/xlsx";
import { z } from "zod";

import { sqlite, sqliteFilePath } from "../../db/client.js";
import { createId } from "../../utils/id.js";
import { ok } from "../../utils/http.js";
import {
  collectCategoryKeys,
  rebuildLoanRecords,
  resolveTransactionKind,
  signedLoanTransactionAmount,
  type RebuiltLoan,
  type RebuiltLoanEntry
} from "./normalizers.js";
import { auditImportedData, repairImportedData } from "./repair.js";

type RawRow = Record<string, unknown>;

type ParsedTransactionRow = {
  rowNumber: number;
  happenedOn: string;
  ioType: string;
  category: string;
  amount: number;
  account: string;
  accountType: string;
  book: string;
  member: string;
  note: string;
  raw: RawRow;
};

type ParsedLoanRow = {
  rowNumber: number;
  happenedOn: string;
  loanType: string;
  counterparty: string;
  amount: number;
  interest: number;
  account: string;
  book: string;
  note: string;
  raw: RawRow;
};

type ImportWarning = {
  sheetName: string;
  rowNumber: number;
  level: "warning" | "error";
  message: string;
  raw: RawRow;
};

type PocketWorkbook = {
  transactions: ParsedTransactionRow[];
  loans: ParsedLoanRow[];
  warnings: ImportWarning[];
  summary: ImportSummary;
};

const defaultReceivableGroupId = "loan_group_receivable_default";
const defaultPayableGroupId = "loan_group_payable_default";

function ensureDefaultLoanGroups(created = new Date().toISOString()) {
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO loan_groups
      (id, name, direction, color, icon, include_in_assets, sort_order, is_default, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  insert.run(defaultReceivableGroupId, "应收账", "receivable", "#46B98F", "hand-coins", 1, 10, created, created);
  insert.run(defaultPayableGroupId, "应付账", "payable", "#C86464", "receipt-text", 0, 10, created, created);
}

function defaultLoanGroupId(direction: "receivable" | "payable") {
  return direction === "receivable" ? defaultReceivableGroupId : defaultPayableGroupId;
}

type ImportSummary = {
  sheets: Array<{ name: string; rows: number }>;
  transactionRows: number;
  loanRows: number;
  dateRange: { from: string | null; to: string | null };
  accounts: string[];
  categories: string[];
  books: string[];
  members: string[];
  transferPairs: number;
  transferUnpairedRows: number;
};

type ImportBatchRow = {
  id: string;
  fileName: string;
  fileHash: string;
  status: string;
  rowsTotal: number;
  rowsSuccess: number;
  rowsWarning: number;
  rowsFailed: number;
  summary: string | null;
  createdAt: string;
};

type StatementRunner = {
  run: (...params: unknown[]) => unknown;
};

const commitSchema = z.object({
  mode: z.enum(["clear", "append"]).default("clear")
});

const text = (value: unknown): string => String(value ?? "").trim();
const pocketText = {
  defaultBook: "\u9ed8\u8ba4\u8d26\u672c",
  transactionSheet: "\u6536\u652f\u8bb0\u5f55",
  loanSheet: "\u501f\u5165\u501f\u51fa",
  transfer: "\u8f6c\u8d26",
  balanceAdjustment: "\u4f59\u989d\u53d8\u66f4",
  loanOut: "\u501f\u51fa",
  loanIn: "\u501f\u5165",
  receive: "\u6536\u6b3e",
  repay: "\u8fd8\u6b3e"
};

function badRequest(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function rowHash(sheetName: string, rowNumber: number, row: RawRow): string {
  return crypto
    .createHash("sha1")
    .update(`${sheetName}:${rowNumber}:${JSON.stringify(row)}`)
    .digest("hex");
}

function normalizeDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = text(value).replace(/\//g, "-");
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const year = match[1];
  const month = match[2];
  const day = match[3];
  if (!year || !month || !day) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseAmount(value: unknown): number | null {
  const normalized = text(value).replace(/,/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function accountTypeFromPocket(value: string): string {
  if (value.includes("现金")) return "cash";
  if (value.includes("储蓄")) return "debit_card";
  if (value.includes("信用")) return "credit_card";
  if (value.includes("支付宝")) return "alipay";
  if (value.includes("微信")) return "wechat";
  if (value.includes("投资")) return "investment";
  if (value.includes("花呗")) return "huabei";
  if (value.includes("白条")) return "jd_baitiao";
  if (value.includes("网络")) return "network";
  return "custom";
}

function accountKindFromPocket(value: string): "asset" | "liability" {
  return value.includes("信用") || value.includes("花呗") || value.includes("白条") ? "liability" : "asset";
}

function categoryIcon(name: string): string {
  if (name.includes("餐") || name.includes("饮")) return "utensils";
  if (name.includes("交通")) return "bus-front";
  if (name.includes("房")) return "home";
  if (name.includes("油")) return "fuel";
  if (name.includes("红包")) return "gift";
  if (name.includes("转账")) return "banknote-arrow-down";
  if (name.includes("借") || name.includes("收款") || name.includes("还款")) return "hand-coins";
  return "star";
}

function parseWorkbook(buffer: Buffer): PocketWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = sheet ? XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: false }) : [];
    return { name, rows };
  });
  const warnings: ImportWarning[] = [];

  const transactionSheet = sheets.find((sheet) => sheet.name === "收支记录");
  const loanSheet = sheets.find((sheet) => sheet.name === "借入借出");

  const transactions = (transactionSheet?.rows ?? []).flatMap((row, index) => {
    const rowNumber = index + 2;
    const happenedOn = normalizeDate(row["时间"]);
    const amount = parseAmount(row["金额"]);
    const category = text(row["账目分类"]);
    const account = text(row["账户"]);

    if (!happenedOn || amount === null || !category || !account) {
      warnings.push({
        sheetName: "收支记录",
        rowNumber,
        level: "error",
        message: "缺少日期、金额、分类或账户",
        raw: row
      });
      return [];
    }

    return [
      {
        rowNumber,
        happenedOn,
        ioType: text(row["收支类型"]),
        category,
        amount,
        account,
        accountType: text(row["账户类型"]),
        book: text(row["账本"]) || "默认账本",
        member: text(row["成员"]),
        note: text(row["备注"]),
        raw: row
      }
    ];
  });

  const loans = (loanSheet?.rows ?? []).flatMap((row, index) => {
    const rowNumber = index + 2;
    const happenedOn = normalizeDate(row["时间"]);
    const amount = parseAmount(row["金额"]);
    const loanType = text(row["借贷类型"]);
    const counterparty = text(row["借贷人"]);

    if (!happenedOn || amount === null || !loanType || !counterparty) {
      warnings.push({
        sheetName: "借入借出",
        rowNumber,
        level: "warning",
        message: "借贷记录缺少日期、类型、对象或金额，已跳过",
        raw: row
      });
      return [];
    }

    return [
      {
        rowNumber,
        happenedOn,
        loanType,
        counterparty,
        amount,
        interest: parseAmount(row["利息"]) ?? 0,
        account: text(row["使用账户"]),
        book: text(row["利息记录账本"]) || "默认账本",
        note: text(row["备注"]),
        raw: row
      }
    ];
  });

  const accounts = new Set<string>();
  const books = new Set<string>();
  const members = new Set<string>();
  transactions.forEach((row) => {
    accounts.add(row.account);
    books.add(row.book);
    if (row.member) members.add(row.member);
  });
  loans.forEach((row) => {
    if (row.account) accounts.add(row.account);
    books.add(row.book);
    members.add(row.counterparty);
  });

  const transferStats = countTransferPairs(transactions);
  const dates = transactions.map((row) => row.happenedOn).sort();

  return {
    transactions,
    loans,
    warnings,
    summary: {
      sheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length })),
      transactionRows: transactions.length,
      loanRows: loans.length,
      dateRange: {
        from: dates[0] ?? null,
        to: dates.at(-1) ?? null
      },
      accounts: Array.from(accounts).sort(),
      categories: collectCategoryKeys(transactions).map((category) => `${category.type}:${category.name}`).sort(),
      books: Array.from(books).sort(),
      members: Array.from(members).sort(),
      transferPairs: transferStats.pairs,
      transferUnpairedRows: transferStats.unpaired
    }
  };
}

function countTransferPairs(rows: ParsedTransactionRow[]) {
  const groups = new Map<string, { positive: number; negative: number }>();
  rows
    .filter((row) => resolveTransactionKind(row) === "transfer")
    .forEach((row) => {
      const key = `${row.happenedOn}:${Math.abs(row.amount).toFixed(2)}`;
      const group = groups.get(key) ?? { positive: 0, negative: 0 };
      if (row.amount >= 0) group.positive += 1;
      else group.negative += 1;
      groups.set(key, group);
    });

  let pairs = 0;
  let unpaired = 0;
  groups.forEach((group) => {
    const groupPairs = Math.min(group.positive, group.negative);
    pairs += groupPairs;
    unpaired += group.positive + group.negative - groupPairs * 2;
  });
  return { pairs, unpaired };
}

function readSummary(row: ImportBatchRow) {
  return {
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash,
    status: row.status,
    rowsTotal: row.rowsTotal,
    rowsSuccess: row.rowsSuccess,
    rowsWarning: row.rowsWarning,
    rowsFailed: row.rowsFailed,
    summary: row.summary ? JSON.parse(row.summary) : null,
    createdAt: row.createdAt
  };
}

function upsertDimensionData(parsed: PocketWorkbook, created: string) {
  const insertBook = sqlite.prepare(`
    INSERT OR IGNORE INTO books (id, name, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  parsed.summary.books.forEach((name) => {
    insertBook.run(stableId("book", name), name, name === "默认账本" ? 1 : 0, created, created);
  });
  insertBook.run("default", "默认账本", 1, created, created);

  const accounts = new Map<string, string>();
  parsed.transactions.forEach((row) => {
    if (!accounts.has(row.account)) accounts.set(row.account, row.accountType);
  });
  parsed.loans.forEach((row) => {
    if (row.account && !accounts.has(row.account)) accounts.set(row.account, "");
  });
  Array.from(accounts.entries()).forEach(([name, typeName], index) => {
    const hue = (index * 47) % 360;
    getActiveAccountId(name, created, {
      type: accountTypeFromPocket(`${typeName}${name}`),
      kind: accountKindFromPocket(`${typeName}${name}`),
      color: `hsl(${hue} 56% 58%)`,
      icon: accountTypeFromPocket(`${typeName}${name}`) === "cash" ? "badge-yen-sign" : "wallet"
    });
  });

  collectCategoryKeys(parsed.transactions).forEach((category, index) => {
    getCategoryId(category.name, category.type, created, {
      icon: categoryIcon(category.name),
      color: `hsl(${(index * 31) % 360} 68% 66%)`,
      sortOrder: index + 1
    });
  });
  getCategoryId("转账", "expense", created, {
    id: "transfer",
    icon: "banknote-arrow-down",
    color: "#5CB5CE",
    sortOrder: 999,
    isSystem: true
  });

  const insertMember = sqlite.prepare(`
    INSERT OR IGNORE INTO members (id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  insertMember.run("member_me", "我", created, created);
  parsed.summary.members.forEach((name) => {
    insertMember.run(stableId("member", name), name, created, created);
  });
}

function getId(table: "accounts" | "categories" | "books" | "members", name: string, fallback?: string): string | null {
  if (!name && fallback) return fallback;
  const row = sqlite.prepare(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`).get(name) as { id: string } | undefined;
  return row?.id ?? fallback ?? null;
}

function getActiveAccountId(
  name: string,
  created?: string,
  defaults?: { type: string; kind: "asset" | "liability"; color: string; icon: string }
): string | null {
  if (!name) return null;
  const existing = sqlite
    .prepare("SELECT id FROM accounts WHERE name = ? AND archived_at IS NULL AND hidden = 0 LIMIT 1")
    .get(name) as { id: string } | undefined;
  if (existing || !created || !defaults) return existing?.id ?? null;

  const preferredId = stableId("acct", name);
  const fallbackId = stableId("acct_active", name);
  for (const id of [preferredId, fallbackId]) {
    sqlite
      .prepare(
        `
        INSERT OR IGNORE INTO accounts
          (id, name, type, kind, initial_balance, current_balance_cache, color, icon, include_in_assets, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, '0.00', '0.00', ?, ?, 1, ?, ?)
      `
      )
      .run(id, name, defaults.type, defaults.kind, defaults.color, defaults.icon, created, created);
    const inserted = sqlite
      .prepare("SELECT id FROM accounts WHERE name = ? AND archived_at IS NULL AND hidden = 0 LIMIT 1")
      .get(name) as { id: string } | undefined;
    if (inserted) return inserted.id;
  }
  return null;
}

function getCategoryId(
  name: string,
  type: "income" | "expense",
  created?: string,
  defaults?: { id?: string; icon: string; color: string; sortOrder: number; isSystem?: boolean }
): string | null {
  if (!name) return null;
  const existing = sqlite
    .prepare("SELECT id FROM categories WHERE name = ? AND type = ? AND archived_at IS NULL AND hidden = 0 LIMIT 1")
    .get(name, type) as { id: string } | undefined;
  if (existing || !created || !defaults) return existing?.id ?? null;

  const id = defaults.id ?? stableId(`cat_${type}`, name);
  sqlite
    .prepare(
      `
      INSERT OR IGNORE INTO categories
        (id, name, type, icon, color, sort_order, is_system, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(id, name, type, defaults.icon, defaults.color, defaults.sortOrder, defaults.isSystem ? 1 : 0, created, created);

  const inserted = sqlite
    .prepare("SELECT id FROM categories WHERE name = ? AND type = ? AND archived_at IS NULL AND hidden = 0 LIMIT 1")
    .get(name, type) as { id: string } | undefined;
  return inserted?.id ?? id;
}

function clearImportedData() {
  sqlite.exec(`
    DELETE FROM import_warnings;
    DELETE FROM import_batches;
    DELETE FROM budget_categories;
    DELETE FROM budgets;
    DELETE FROM loan_entries;
    DELETE FROM loans;
    DELETE FROM loan_groups;
    DELETE FROM transfers;
    DELETE FROM transactions;
    DELETE FROM categories;
    DELETE FROM accounts;
    DELETE FROM members;
    DELETE FROM books;
  `);
}

function insertImportWarnings(batchId: string, warnings: ImportWarning[], created: string) {
  const insertWarning = sqlite.prepare(`
    INSERT INTO import_warnings
      (id, import_batch_id, sheet_name, row_number, level, message, raw_payload, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  warnings.forEach((warning) => {
    insertWarning.run(createId("warn"), batchId, warning.sheetName, warning.rowNumber, warning.level, warning.message, JSON.stringify(warning.raw), created);
  });
}

function insertTransactions(parsed: PocketWorkbook, batchId: string, created: string) {
  const ordinaryRows = parsed.transactions.filter((row) => {
    const kind = resolveTransactionKind(row);
    return kind === "income" || kind === "expense" || kind === "balance_adjustment";
  });
  const transferRows = parsed.transactions.filter((row) => resolveTransactionKind(row) === "transfer");
  const insertTransaction = sqlite.prepare(`
    INSERT OR IGNORE INTO transactions
      (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, transfer_id, import_batch_id, source_row_hash, raw_payload, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  const warnings: ImportWarning[] = [];

  ordinaryRows.forEach((row) => {
    const type = resolveTransactionKind(row);
    if (type !== "income" && type !== "expense" && type !== "balance_adjustment") return;
    const accountId = getActiveAccountId(row.account);
    const categoryId = type === "income" || type === "expense" ? getCategoryId(row.category, type, created, {
      icon: categoryIcon(row.category),
      color: "#8FD8F7",
      sortOrder: 0
    }) : null;
    const bookId = getId("books", row.book, "default");
    const memberId = getId("members", row.member);
    if (!accountId || !bookId) {
      warnings.push({ sheetName: "收支记录", rowNumber: row.rowNumber, level: "error", message: "账户或账本不存在", raw: row.raw });
      return;
    }

    insertTransaction.run(
      stableId("txn", rowHash("收支记录", row.rowNumber, row.raw)),
      type,
      row.happenedOn,
      row.amount.toFixed(2),
      Math.abs(row.amount).toFixed(2),
      accountId,
      categoryId,
      bookId,
      memberId,
      row.note,
      null,
      batchId,
      rowHash("收支记录", row.rowNumber, row.raw),
      JSON.stringify(row.raw),
      created,
      created
    );
    inserted += 1;
  });

  const transferInserted = insertTransfers(transferRows, batchId, created, insertTransaction, warnings);
  insertImportWarnings(batchId, warnings, created);
  return { inserted: inserted + transferInserted, warnings: warnings.length };
}

function insertTransfers(
  rows: ParsedTransactionRow[],
  batchId: string,
  created: string,
  insertTransaction: StatementRunner,
  warnings: ImportWarning[]
) {
  const pending = new Map<string, { positive: ParsedTransactionRow[]; negative: ParsedTransactionRow[] }>();
  rows.forEach((row) => {
    const key = `${row.happenedOn}:${Math.abs(row.amount).toFixed(2)}`;
    const group = pending.get(key) ?? { positive: [], negative: [] };
    if (row.amount >= 0) group.positive.push(row);
    else group.negative.push(row);
    pending.set(key, group);
  });

  const insertTransfer = sqlite.prepare(`
    INSERT OR IGNORE INTO transfers
      (id, happened_on, amount, from_account_id, to_account_id, note, book_id, import_batch_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  pending.forEach((group) => {
    const pairs = Math.min(group.positive.length, group.negative.length);
    for (let index = 0; index < pairs; index += 1) {
      const incoming = group.positive[index];
      const outgoing = group.negative[index];
      if (!incoming || !outgoing) continue;
      const fromAccountId = getActiveAccountId(outgoing.account);
      const toAccountId = getActiveAccountId(incoming.account);
      const bookId = getId("books", outgoing.book || incoming.book, "default");
      if (!fromAccountId || !toAccountId || !bookId || fromAccountId === toAccountId) {
        warnings.push({ sheetName: "收支记录", rowNumber: outgoing.rowNumber, level: "warning", message: "转账无法配对，已跳过", raw: outgoing.raw });
        continue;
      }

      const transferId = stableId("trf", `${rowHash("收支记录", outgoing.rowNumber, outgoing.raw)}:${rowHash("收支记录", incoming.rowNumber, incoming.raw)}`);
      const amount = Math.abs(outgoing.amount);
      insertTransfer.run(transferId, outgoing.happenedOn, amount.toFixed(2), fromAccountId, toAccountId, outgoing.note || incoming.note, bookId, batchId, created, created);
      const transferRows = [
        { row: outgoing, kind: "transfer_out", accountId: fromAccountId },
        { row: incoming, kind: "transfer_in", accountId: toAccountId }
      ] as const;
      transferRows.forEach(({ row, kind, accountId }) => {
        insertTransaction.run(
          stableId("txn", rowHash("收支记录", row.rowNumber, row.raw)),
          kind,
          row.happenedOn,
          row.amount.toFixed(2),
          Math.abs(row.amount).toFixed(2),
          accountId,
          "transfer",
          bookId,
          getId("members", row.member),
          row.note,
          transferId,
          batchId,
          rowHash("收支记录", row.rowNumber, row.raw),
          JSON.stringify(row.raw),
          created,
          created
        );
        inserted += 1;
      });
    }

    [...group.positive.slice(pairs), ...group.negative.slice(pairs)].forEach((row) => {
      warnings.push({ sheetName: "收支记录", rowNumber: row.rowNumber, level: "warning", message: "转账缺少对应正负流水，已跳过", raw: row.raw });
    });
  });

  return inserted;
}

function loanTransactionNote(loan: RebuiltLoan, entry: RebuiltLoanEntry) {
  if (entry.note) return entry.note;
  if (entry.type === "principal") return `${loan.direction === "receivable" ? "借出" : "借入"} ${loan.counterparty}`;
  if (entry.type === "interest") return `${loan.direction === "receivable" ? "利息收入" : "利息支出"} ${loan.counterparty}`;
  return `${loan.direction === "receivable" ? "收款" : "还款"} ${loan.counterparty}`;
}

function loanRowsForImport(parsed: PocketWorkbook): ParsedLoanRow[] {
  if (parsed.loans.length > 0) return parsed.loans;
  return parsed.transactions
    .filter((row) => resolveTransactionKind(row) === "loan")
    .map((row) => ({
      rowNumber: row.rowNumber,
      happenedOn: row.happenedOn,
      loanType: row.category,
      counterparty: row.member || row.note || "unknown",
      amount: Math.abs(row.amount),
      interest: 0,
      account: row.account,
      book: row.book,
      note: row.note,
      raw: row.raw
    }));
}

function insertLoans(parsed: PocketWorkbook, batchId: string, created: string) {
  ensureDefaultLoanGroups(created);
  const loanRows = loanRowsForImport(parsed);
  const rebuilt = rebuildLoanRecords(loanRows);
  const insertLoan = sqlite.prepare(`
    INSERT OR IGNORE INTO loans
      (id, direction, loan_group_id, counterparty, principal_amount, remaining_amount_cache, interest_amount_cache, account_id, happened_on, status, note, import_batch_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEntry = sqlite.prepare(`
    INSERT OR IGNORE INTO loan_entries
      (id, loan_id, type, amount, account_id, book_id, happened_on, note, transaction_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTransaction = sqlite.prepare(`
    INSERT OR IGNORE INTO transactions
      (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, loan_id, import_batch_id, source_row_hash, raw_payload, created_at, updated_at)
    VALUES
      (?, 'loan', ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
  `);
  const warnings: ImportWarning[] = rebuilt.warnings.map((warning) => ({
    sheetName: "借入借出",
    rowNumber: warning.rowNumber,
    level: warning.level,
    message: warning.message,
    raw: warning.raw
  }));

  rebuilt.loans.forEach((loan) => {
    const loanId = stableId("loan", rowHash("借入借出", loan.sourceRowNumber, loan.raw));
    const accountId = getActiveAccountId(loan.account);
    insertLoan.run(
      loanId,
      loan.direction,
      defaultLoanGroupId(loan.direction),
      loan.counterparty,
      loan.principalAmount.toFixed(2),
      loan.remainingAmount.toFixed(2),
      loan.interestAmount.toFixed(2),
      accountId,
      loan.happenedOn,
      loan.status,
      loan.note,
      batchId,
      created,
      created
    );

    loan.entries.forEach((entry, index) => {
      const entryAccountId = getActiveAccountId(entry.account);
      const bookId = getId("books", entry.book, "default");
      let transactionId: string | null = null;
      const sourceHash = rowHash("借入借出", entry.sourceRowNumber, entry.raw);
      if (entryAccountId && bookId) {
        transactionId = stableId("txn", `${loanId}:${sourceHash}:${entry.type}:${index}`);
        const signedAmount = signedLoanTransactionAmount(loan.direction, entry.type, entry.amount);
        insertTransaction.run(
          transactionId,
          entry.happenedOn,
          signedAmount.toFixed(2),
          Math.abs(entry.amount).toFixed(2),
          entryAccountId,
          bookId,
          loanTransactionNote(loan, entry),
          loanId,
          batchId,
          sourceHash,
          JSON.stringify(entry.raw),
          created,
          created
        );
      } else {
        warnings.push({
          sheetName: "借入借出",
          rowNumber: entry.sourceRowNumber,
          level: "warning",
          message: "借贷流水缺少可用账户或账本，未创建关联交易",
          raw: entry.raw
        });
      }
      insertEntry.run(
        stableId("loan_entry", `${loanId}:${entry.sourceRowNumber}:${entry.type}:${index}`),
        loanId,
        entry.type,
        Math.abs(entry.amount).toFixed(2),
        entryAccountId,
        bookId,
        entry.happenedOn,
        entry.note,
        transactionId,
        created,
        created
      );
    });
  });

  return { inserted: loanRows.length, warnings };
}

function commitImport(fileName: string, fileHash: string, parsed: PocketWorkbook, mode: "clear" | "append") {
  const created = new Date().toISOString();
  const batchId = createId("imp");
  let rowsSuccess = 0;
  let rowsWarning = parsed.warnings.length;

  sqlite.transaction(() => {
    if (mode === "clear") clearImportedData();
    upsertDimensionData(parsed, created);
    const transactionResult = insertTransactions(parsed, batchId, created);
    const loanResult = insertLoans(parsed, batchId, created);
    rowsSuccess = transactionResult.inserted + loanResult.inserted;
    rowsWarning += transactionResult.warnings + loanResult.warnings.length;

    insertImportWarnings(batchId, parsed.warnings, created);
    insertImportWarnings(batchId, loanResult.warnings, created);
    sqlite
      .prepare(
        `
        INSERT INTO import_batches
          (id, file_name, file_hash, source, status, rows_total, rows_success, rows_warning, rows_failed, summary, created_at)
        VALUES
          (?, ?, ?, 'pocket_accounting', 'imported', ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        batchId,
        fileName,
        fileHash,
        parsed.transactions.length + parsed.loans.length + parsed.warnings.length,
        rowsSuccess,
        rowsWarning,
        parsed.warnings.filter((warning) => warning.level === "error").length,
        JSON.stringify(parsed.summary),
        created
      );
  })();

  return { id: batchId, rowsSuccess, rowsWarning, summary: parsed.summary };
}

function createRepairBackup() {
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  const backupDir = path.join(path.dirname(sqliteFilePath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `before-import-repair-${stamp}.db`);
  fs.copyFileSync(sqliteFilePath, target);
  return target;
}

export const importsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const rows = sqlite
      .prepare(
        `
        SELECT
          id,
          file_name AS fileName,
          file_hash AS fileHash,
          status,
          rows_total AS rowsTotal,
          rows_success AS rowsSuccess,
          rows_warning AS rowsWarning,
          rows_failed AS rowsFailed,
          summary,
          created_at AS createdAt
        FROM import_batches
        ORDER BY created_at DESC
      `
      )
      .all() as ImportBatchRow[];
    return ok(rows.map(readSummary));
  });

  app.get("/audit", async () => ok(auditImportedData()));

  app.post("/repair", async () => {
    const backupPath = createRepairBackup();
    return ok({
      backupPath,
      ...repairImportedData()
    });
  });

  app.get("/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const row = sqlite
      .prepare(
        `
        SELECT
          id,
          file_name AS fileName,
          file_hash AS fileHash,
          status,
          rows_total AS rowsTotal,
          rows_success AS rowsSuccess,
          rows_warning AS rowsWarning,
          rows_failed AS rowsFailed,
          summary,
          created_at AS createdAt
        FROM import_batches
        WHERE id = ?
      `
      )
      .get(params.id) as ImportBatchRow | undefined;
    if (!row) throw badRequest("导入批次不存在");
    return ok(readSummary(row));
  });

  app.get("/:id/warnings", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const rows = sqlite
      .prepare(
        `
        SELECT sheet_name AS sheetName, row_number AS rowNumber, level, message, raw_payload AS rawPayload, created_at AS createdAt
        FROM import_warnings
        WHERE import_batch_id = ?
        ORDER BY row_number ASC
      `
      )
      .all(params.id);
    return ok(rows);
  });

  app.post("/pocket/preview", async (request) => {
    const file = await request.file();
    if (!file) throw badRequest("请上传口袋记账导出的 .xls 文件");
    const buffer = await file.toBuffer();
    const parsed = parseWorkbook(buffer);
    return ok({
      fileName: file.filename,
      fileHash: crypto.createHash("sha1").update(buffer).digest("hex"),
      summary: parsed.summary,
      warnings: parsed.warnings.slice(0, 100)
    });
  });

  app.post("/pocket/commit", async (request) => {
    const file = await request.file();
    if (!file) throw badRequest("请上传口袋记账导出的 .xls 文件");
    const mode = commitSchema.parse({ mode: text(request.query && (request.query as { mode?: unknown }).mode) || "clear" }).mode;
    const buffer = await file.toBuffer();
    const parsed = parseWorkbook(buffer);
    const result = commitImport(file.filename, crypto.createHash("sha1").update(buffer).digest("hex"), parsed, mode);
    return ok(result);
  });
};
