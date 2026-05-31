import crypto from "node:crypto";

import { sqlite } from "../../db/client.js";
import { createId } from "../../utils/id.js";
import { rebuildLoanRecords, signedLoanTransactionAmount, type ParsedLoanInput, type RebuiltLoan } from "./normalizers.js";

type RepairOptions = {
  now?: string;
};

type CategoryMismatchRow = {
  transactionId: string;
  transactionType: "income" | "expense";
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
};

type LegacyLoanRow = {
  id: string;
  direction: RebuiltLoan["direction"];
  counterparty: string;
  principalAmount: string;
  remainingAmount: string;
  interestAmount: string;
  accountName: string | null;
  happenedOn: string;
  status: "open" | "closed";
  note: string | null;
  importBatchId: string | null;
  createdAt: string;
};

type OrphanLoanTransactionRow = {
  id: string;
  happenedOn: string;
  amount: string;
  displayAmount: string;
  accountId: string;
  accountName: string;
  note: string | null;
  rawPayload: string | null;
  createdAt: string;
};

type LoanEntryType = "principal" | "repayment" | "additional" | "interest";

type ExistingLoanRow = {
  id: string;
  direction: RebuiltLoan["direction"];
  counterparty: string;
  principalAmount: string;
  remainingAmount: string;
  interestAmount: string;
  accountId: string | null;
  happenedOn: string;
  status: "open" | "closed";
  closedAt: string | null;
};

type OrphanLoanAction = {
  direction: RebuiltLoan["direction"];
  entryType: Extract<LoanEntryType, "principal" | "repayment">;
};

const labels = {
  loanOut: "\u501f\u51fa",
  loanIn: "\u501f\u5165",
  receive: "\u6536\u6b3e",
  repay: "\u8fd8\u6b3e"
};

function money(value: number) {
  return value.toFixed(2);
}

function roundCents(value: string | number) {
  return Math.round(Number(value) * 100);
}

function stableCategoryId(name: string, type: "income" | "expense") {
  return `cat_${type}_${crypto.createHash("sha1").update(name).digest("hex").slice(0, 16)}`;
}

function getOrCreateCategory(row: CategoryMismatchRow, now: string) {
  const existing = sqlite
    .prepare(
      `
      SELECT id
      FROM categories
      WHERE name = ?
        AND type = ?
        AND archived_at IS NULL
        AND hidden = 0
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
    `
    )
    .get(row.categoryName, row.transactionType) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = stableCategoryId(row.categoryName, row.transactionType);
  sqlite
    .prepare(
      `
      INSERT OR IGNORE INTO categories
        (id, name, type, icon, color, sort_order, is_system, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, 900, 0, ?, ?)
    `
    )
    .run(id, row.categoryName, row.transactionType, row.categoryIcon ?? "star", row.categoryColor ?? "#8FD8F7", now, now);
  return id;
}

function rebindMismatchedCategories(now: string) {
  const rows = sqlite
    .prepare(
      `
      SELECT
        t.id AS transactionId,
        t.type AS transactionType,
        COALESCE(c.name, '未分类') AS categoryName,
        c.icon AS categoryIcon,
        c.color AS categoryColor
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL
        AND t.type IN ('income', 'expense')
        AND (t.category_id IS NULL OR c.id IS NULL OR c.type <> t.type)
      ORDER BY t.happened_on ASC, t.created_at ASC
    `
    )
    .all() as CategoryMismatchRow[];

  const update = sqlite.prepare("UPDATE transactions SET category_id = ?, updated_at = ? WHERE id = ?");
  rows.forEach((row) => update.run(getOrCreateCategory(row, now), now, row.transactionId));
  return rows.length;
}

function legacyLoanType(row: LegacyLoanRow) {
  if (row.direction === "receivable") return row.status === "closed" ? labels.receive : labels.loanOut;
  return row.status === "closed" ? labels.repay : labels.loanIn;
}

function readLegacyLoanRows() {
  return sqlite
    .prepare(
      `
      SELECT
        l.id,
        l.direction,
        l.counterparty,
        l.principal_amount AS principalAmount,
        l.remaining_amount_cache AS remainingAmount,
        l.interest_amount_cache AS interestAmount,
        a.name AS accountName,
        l.happened_on AS happenedOn,
        l.status,
        l.note,
        l.import_batch_id AS importBatchId,
        l.created_at AS createdAt
      FROM loans l
      LEFT JOIN accounts a ON a.id = l.account_id
      WHERE l.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM loan_entries e WHERE e.loan_id = l.id)
      ORDER BY l.happened_on ASC, l.created_at ASC
    `
    )
    .all() as LegacyLoanRow[];
}

function readOrphanLoanTransactions() {
  return sqlite
    .prepare(
      `
      SELECT
        t.id,
        t.happened_on AS happenedOn,
        t.amount,
        t.display_amount AS displayAmount,
        t.account_id AS accountId,
        a.name AS accountName,
        t.note,
        t.raw_payload AS rawPayload,
        t.created_at AS createdAt
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.deleted_at IS NULL
        AND t.type = 'loan'
        AND t.loan_id IS NULL
      ORDER BY t.happened_on ASC, t.created_at ASC
    `
    )
    .all() as OrphanLoanTransactionRow[];
}

function parseRawPayload(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rawText(raw: Record<string, unknown>, key: string) {
  return String(raw[key] ?? "").trim();
}

function transactionLoanType(row: OrphanLoanTransactionRow) {
  const raw = parseRawPayload(row.rawPayload);
  const category = rawText(raw, "\u8d26\u76ee\u5206\u7c7b");
  if (category) return category;
  return Number(row.amount) < 0 ? labels.loanOut : labels.receive;
}

function transactionCounterparty(row: OrphanLoanTransactionRow) {
  const raw = parseRawPayload(row.rawPayload);
  return rawText(raw, "\u6210\u5458") || row.note || "\u672a\u547d\u540d";
}

function orphanLoanAmount(row: OrphanLoanTransactionRow) {
  const displayAmount = Number(row.displayAmount);
  if (Number.isFinite(displayAmount) && displayAmount !== 0) return Math.abs(displayAmount);
  return Math.abs(Number(row.amount));
}

function orphanLoanAction(row: OrphanLoanTransactionRow): OrphanLoanAction {
  const loanType = transactionLoanType(row);
  if (loanType.includes(labels.loanIn)) return { direction: "payable", entryType: "principal" };
  if (loanType.includes(labels.repay)) return { direction: "payable", entryType: "repayment" };
  if (loanType.includes(labels.receive)) return { direction: "receivable", entryType: "repayment" };
  if (loanType.includes(labels.loanOut)) return { direction: "receivable", entryType: "principal" };
  return Number(row.amount) < 0
    ? { direction: "receivable", entryType: "principal" }
    : { direction: "receivable", entryType: "repayment" };
}

function readLoan(loanId: string) {
  return sqlite
    .prepare(
      `
      SELECT
        id,
        direction,
        counterparty,
        principal_amount AS principalAmount,
        remaining_amount_cache AS remainingAmount,
        interest_amount_cache AS interestAmount,
        account_id AS accountId,
        happened_on AS happenedOn,
        status,
        closed_at AS closedAt
      FROM loans
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `
    )
    .get(loanId) as ExistingLoanRow | undefined;
}

function findExistingLoanForOrphan(row: OrphanLoanTransactionRow, action: OrphanLoanAction) {
  const counterparty = transactionCounterparty(row);
  const amountCents = Math.abs(roundCents(orphanLoanAmount(row)));

  if (action.entryType === "principal") {
    return sqlite
      .prepare(
        `
        SELECT
          id,
          direction,
          counterparty,
          principal_amount AS principalAmount,
          remaining_amount_cache AS remainingAmount,
          interest_amount_cache AS interestAmount,
          account_id AS accountId,
          happened_on AS happenedOn,
          status,
          closed_at AS closedAt
        FROM loans
        WHERE deleted_at IS NULL
          AND direction = ?
          AND counterparty = ?
          AND happened_on = ?
          AND ROUND(ABS(CAST(principal_amount AS REAL)) * 100) = ?
        ORDER BY
          CASE WHEN account_id = ? THEN 0 ELSE 1 END,
          created_at ASC
        LIMIT 1
      `
      )
      .get(action.direction, counterparty, row.happenedOn, amountCents, row.accountId) as ExistingLoanRow | undefined;
  }

  return sqlite
    .prepare(
      `
      SELECT
        id,
        direction,
        counterparty,
        principal_amount AS principalAmount,
        remaining_amount_cache AS remainingAmount,
        interest_amount_cache AS interestAmount,
        account_id AS accountId,
        happened_on AS happenedOn,
        status,
        closed_at AS closedAt
      FROM loans
      WHERE deleted_at IS NULL
        AND direction = ?
        AND counterparty = ?
        AND happened_on <= ?
      ORDER BY
        CASE WHEN status = 'open' THEN 0 ELSE 1 END,
        CASE WHEN account_id = ? THEN 0 ELSE 1 END,
        happened_on DESC,
        created_at DESC
      LIMIT 1
    `
    )
    .get(action.direction, counterparty, row.happenedOn, row.accountId) as ExistingLoanRow | undefined;
}

function recalculateExistingLoan(loanId: string, now: string) {
  const loan = readLoan(loanId);
  if (!loan) return;

  const entries = sqlite
    .prepare("SELECT type, amount FROM loan_entries WHERE loan_id = ?")
    .all(loanId) as Array<{ type: LoanEntryType; amount: string }>;
  const sum = (types: LoanEntryType[]) =>
    entries.filter((entry) => types.includes(entry.type)).reduce((total, entry) => total + Math.abs(roundCents(entry.amount)), 0);
  const principalEntriesCents = sum(["principal"]);
  const principalBaseCents = principalEntriesCents > 0 ? principalEntriesCents : Math.abs(roundCents(loan.principalAmount));
  const principalCents = principalBaseCents + sum(["additional"]);
  const repaymentCents = sum(["repayment"]);
  const interestCents = sum(["interest"]);
  const remainingCents = Math.max(0, principalCents - repaymentCents);
  const nextStatus: ExistingLoanRow["status"] = remainingCents === 0 ? "closed" : "open";

  sqlite
    .prepare(
      `
      UPDATE loans
      SET principal_amount = ?,
          remaining_amount_cache = ?,
          interest_amount_cache = ?,
          status = ?,
          closed_at = ?,
          updated_at = ?
      WHERE id = ?
    `
    )
    .run(
      money(principalCents / 100),
      money(remainingCents / 100),
      money(interestCents / 100),
      nextStatus,
      nextStatus === "closed" ? loan.closedAt ?? now : null,
      now,
      loanId
    );
}

function attachOrphanTransactionToLoan(row: OrphanLoanTransactionRow, loan: ExistingLoanRow, action: OrphanLoanAction, now: string) {
  const alreadyLinked = sqlite
    .prepare("SELECT loan_id AS loanId FROM loan_entries WHERE transaction_id = ? LIMIT 1")
    .get(row.id) as { loanId: string } | undefined;
  if (alreadyLinked) {
    sqlite.prepare("UPDATE transactions SET loan_id = ?, updated_at = ? WHERE id = ?").run(alreadyLinked.loanId, now, row.id);
    recalculateExistingLoan(alreadyLinked.loanId, now);
    return true;
  }

  const amountCents = Math.abs(roundCents(orphanLoanAmount(row)));
  const reusableEntry = sqlite
    .prepare(
      `
      SELECT id
      FROM loan_entries
      WHERE loan_id = ?
        AND type = ?
        AND transaction_id IS NULL
        AND happened_on = ?
        AND ROUND(ABS(CAST(amount AS REAL)) * 100) = ?
      ORDER BY
        CASE WHEN account_id = ? THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
    `
    )
    .get(loan.id, action.entryType, row.happenedOn, amountCents, row.accountId) as { id: string } | undefined;

  if (reusableEntry) {
    sqlite
      .prepare(
        `
        UPDATE loan_entries
        SET transaction_id = ?,
            account_id = COALESCE(account_id, ?),
            note = COALESCE(note, ?),
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(row.id, row.accountId, row.note, now, reusableEntry.id);
  } else {
    sqlite
      .prepare(
        `
        INSERT INTO loan_entries
          (id, loan_id, type, amount, account_id, book_id, happened_on, note, transaction_id, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, 'default', ?, ?, ?, ?, ?)
      `
      )
      .run(createId("loan_entry"), loan.id, action.entryType, money(amountCents / 100), row.accountId, row.happenedOn, row.note, row.id, now, now);
  }

  sqlite.prepare("UPDATE transactions SET loan_id = ?, updated_at = ? WHERE id = ?").run(loan.id, now, row.id);
  recalculateExistingLoan(loan.id, now);
  return true;
}

function attachRemainingOrphanLoanTransactions(now: string, rows = readOrphanLoanTransactions()) {
  let attached = 0;
  rows.forEach((row) => {
    const action = orphanLoanAction(row);
    const loan = findExistingLoanForOrphan(row, action);
    if (!loan) return;
    if (attachOrphanTransactionToLoan(row, loan, action, now)) attached += 1;
  });
  return attached;
}

function findMatchingLoanTransaction(
  pool: OrphanLoanTransactionRow[],
  loan: RebuiltLoan,
  entry: RebuiltLoan["entries"][number]
) {
  const signedCents = roundCents(signedLoanTransactionAmount(loan.direction, entry.type, entry.amount));
  const index = pool.findIndex((row) => {
    if (row.happenedOn !== entry.happenedOn) return false;
    if (row.accountName !== entry.account) return false;
    return roundCents(row.amount) === signedCents;
  });
  if (index < 0) return null;
  const [row] = pool.splice(index, 1);
  return row ?? null;
}

function insertRebuiltLoans(loans: RebuiltLoan[], orphanTransactions: OrphanLoanTransactionRow[], now: string) {
  const insertLoan = sqlite.prepare(`
    INSERT INTO loans
      (id, direction, counterparty, principal_amount, remaining_amount_cache, interest_amount_cache, account_id,
       happened_on, status, note, import_batch_id, closed_at, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEntry = sqlite.prepare(`
    INSERT INTO loan_entries
      (id, loan_id, type, amount, account_id, book_id, happened_on, note, transaction_id, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, 'default', ?, ?, ?, ?, ?)
  `);
  const insertTransaction = sqlite.prepare(`
    INSERT INTO transactions
      (id, type, happened_on, amount, display_amount, account_id, category_id, book_id, member_id, note, loan_id, created_at, updated_at)
    VALUES
      (?, 'loan', ?, ?, ?, ?, NULL, 'default', NULL, ?, ?, ?, ?)
  `);
  const updateTransaction = sqlite.prepare("UPDATE transactions SET loan_id = ?, updated_at = ? WHERE id = ?");
  let linked = 0;
  let insertedTransactions = 0;

  loans.forEach((loan) => {
    const account = sqlite.prepare("SELECT id FROM accounts WHERE name = ? AND hidden = 0 ORDER BY archived_at IS NULL DESC LIMIT 1").get(loan.account) as
      | { id: string }
      | undefined;
    const loanId = createId("loan");
    insertLoan.run(
      loanId,
      loan.direction,
      loan.counterparty,
      money(loan.principalAmount),
      money(loan.remainingAmount),
      money(loan.interestAmount),
      account?.id ?? null,
      loan.happenedOn,
      loan.status,
      loan.note || null,
      null,
      loan.status === "closed" ? now : null,
      now,
      now
    );

    loan.entries.forEach((entry) => {
      const entryAccount = sqlite.prepare("SELECT id FROM accounts WHERE name = ? AND hidden = 0 ORDER BY archived_at IS NULL DESC LIMIT 1").get(entry.account || loan.account) as
        | { id: string }
        | undefined;
      const matchedTransaction = findMatchingLoanTransaction(orphanTransactions, loan, entry);
      let transactionId = matchedTransaction?.id ?? null;
      if (matchedTransaction) {
        updateTransaction.run(loanId, now, matchedTransaction.id);
        linked += 1;
      } else if (entryAccount) {
        transactionId = createId("txn");
        const signed = signedLoanTransactionAmount(loan.direction, entry.type, entry.amount);
        insertTransaction.run(
          transactionId,
          entry.happenedOn,
          money(signed),
          money(Math.abs(entry.amount)),
          entryAccount.id,
          entry.note || loan.counterparty,
          loanId,
          now,
          now
        );
        insertedTransactions += 1;
      }

      insertEntry.run(
        createId("loan_entry"),
        loanId,
        entry.type,
        money(entry.amount),
        entryAccount?.id ?? null,
        entry.happenedOn,
        entry.note || null,
        transactionId,
        now,
        now
      );
    });
  });

  return { linked, insertedTransactions };
}

function rebuildLegacyLoans(now: string) {
  const legacyLoans = readLegacyLoanRows();
  let orphanTransactions = readOrphanLoanTransactions();
  let remainingLoanTransactionsAttached = 0;

  if (!legacyLoans.length && orphanTransactions.length) {
    remainingLoanTransactionsAttached = attachRemainingOrphanLoanTransactions(now, orphanTransactions);
    if (remainingLoanTransactionsAttached > 0) {
      orphanTransactions = readOrphanLoanTransactions();
    }
  }

  if (!legacyLoans.length && !orphanTransactions.length) {
    return { loansRebuilt: 0, orphanLoanTransactionsLinked: 0, loanTransactionsInserted: 0, remainingLoanTransactionsAttached };
  }

  const parsedRows: ParsedLoanInput[] = legacyLoans.length
    ? legacyLoans.map((row, index) => ({
        rowNumber: index + 1,
        happenedOn: row.happenedOn,
        loanType: legacyLoanType(row),
        counterparty: row.counterparty,
        amount: Math.abs(Number(row.principalAmount)),
        interest: Math.abs(Number(row.interestAmount)),
        account: row.accountName ?? "",
        book: "default",
        note: row.note ?? "",
        raw: { legacyLoanId: row.id }
      }))
    : orphanTransactions.map((row, index) => ({
        rowNumber: index + 1,
        happenedOn: row.happenedOn,
        loanType: transactionLoanType(row),
        counterparty: transactionCounterparty(row),
        amount: Math.abs(Number(row.displayAmount || row.amount)),
        interest: 0,
        account: row.accountName,
        book: "default",
        note: row.note ?? "",
        raw: parseRawPayload(row.rawPayload)
      }));

  const rebuilt = rebuildLoanRecords(parsedRows);
  if (legacyLoans.length) {
    const deleteLegacyLoan = sqlite.prepare("DELETE FROM loans WHERE id = ?");
    legacyLoans.forEach((loan) => deleteLegacyLoan.run(loan.id));
  }
  const inserted = insertRebuiltLoans(rebuilt.loans, orphanTransactions, now);
  remainingLoanTransactionsAttached += attachRemainingOrphanLoanTransactions(now, orphanTransactions);

  return {
    loansRebuilt: rebuilt.loans.length,
    orphanLoanTransactionsLinked: inserted.linked,
    loanTransactionsInserted: inserted.insertedTransactions,
    remainingLoanTransactionsAttached,
    loanWarnings: rebuilt.warnings.length
  };
}

export function auditImportedData() {
  const categoryMismatches = sqlite
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL
        AND t.type IN ('income', 'expense')
        AND (t.category_id IS NULL OR c.id IS NULL OR c.type <> t.type)
    `
    )
    .get() as { count: number };
  const orphanLoanTransactions = sqlite
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE deleted_at IS NULL AND type = 'loan' AND loan_id IS NULL")
    .get() as { count: number };
  const loanStatusMismatches = sqlite
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM loans
      WHERE deleted_at IS NULL
        AND ((status = 'closed' AND ROUND(CAST(remaining_amount_cache AS REAL), 2) <> 0)
          OR (status = 'open' AND ROUND(CAST(remaining_amount_cache AS REAL), 2) = 0))
    `
    )
    .get() as { count: number };
  return {
    categoryMismatches: categoryMismatches.count,
    orphanLoanTransactions: orphanLoanTransactions.count,
    loanStatusMismatches: loanStatusMismatches.count
  };
}

export function repairImportedData(options: RepairOptions = {}) {
  const now = options.now ?? new Date().toISOString();
  const before = auditImportedData();
  let categoriesRebound = 0;
  let loanResult: ReturnType<typeof rebuildLegacyLoans> = {
    loansRebuilt: 0,
    orphanLoanTransactionsLinked: 0,
    loanTransactionsInserted: 0,
    remainingLoanTransactionsAttached: 0
  };

  sqlite.transaction(() => {
    categoriesRebound = rebindMismatchedCategories(now);
    loanResult = rebuildLegacyLoans(now);
  })();

  const after = auditImportedData();
  return {
    before,
    after,
    categoriesRebound,
    ...loanResult
  };
}
