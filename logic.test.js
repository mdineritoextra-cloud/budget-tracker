import { describe, it, expect } from "vitest";
import {
  amortize,
  debtPayoffSummary,
  checkRecurringDue,
  getNextDue,
  filterByRange,
  catEmoji,
  fmtPct,
  getHoldings,
  getBrokerAccountValue,
  getBrokerAccountCost,
  get401kValue,
} from "./logic.js";

describe("amortize", () => {
  it("pays off a balance with interest over time", () => {
    const sched = amortize(1200, 12, 110); // 12% APR, $110/mo
    expect(sched.length).toBeGreaterThan(0);
    expect(sched[sched.length - 1].balance).toBe(0);
    // first month interest = 1200 * 0.01 = 12
    expect(sched[0].interest).toBeCloseTo(12, 5);
    expect(sched[0].principal).toBeCloseTo(98, 5);
  });

  it("pays off instantly when balance is already zero", () => {
    expect(amortize(0, 5, 100)).toEqual([]);
  });

  it("handles 0% interest as straight-line principal payments", () => {
    const sched = amortize(1000, 0, 250);
    expect(sched).toHaveLength(4);
    sched.forEach(row => expect(row.interest).toBe(0));
    expect(sched[3].balance).toBe(0);
  });

  it("never pays down principal when payment <= interest, and stops at 600 months", () => {
    // 24% APR on 10,000 = $200/mo interest; min payment of $150 can't even cover interest
    const sched = amortize(10000, 24, 150);
    expect(sched).toHaveLength(1);
    expect(sched[0].principal).toBe(0);
    expect(sched[0].balance).toBe(10000);
  });

  it("applies extra payments to shorten the payoff schedule", () => {
    const base = amortize(5000, 18, 150);
    const withExtra = amortize(5000, 18, 150, 200);
    expect(withExtra.length).toBeLessThan(base.length);
  });

  it("does not overshoot a small remaining balance on the final payment", () => {
    const sched = amortize(100, 10, 90);
    const last = sched[sched.length - 1];
    expect(last.balance).toBe(0);
    expect(last.principal).toBeLessThanOrEqual(100);
  });
});

describe("debtPayoffSummary", () => {
  it("summarizes months, total paid, and total interest", () => {
    const debt = { balance: 1000, interestRate: 0, minPayment: 100 };
    const summary = debtPayoffSummary(debt);
    expect(summary.months).toBe(10);
    expect(summary.totalPaid).toBeCloseTo(1000, 5);
    expect(summary.totalInterest).toBe(0);
  });

  it("reduces total interest when extra payments are applied", () => {
    const debt = { balance: 5000, interestRate: 20, minPayment: 150 };
    const noExtra = debtPayoffSummary(debt, 0);
    const withExtra = debtPayoffSummary(debt, 100);
    expect(withExtra.totalInterest).toBeLessThan(noExtra.totalInterest);
    expect(withExtra.months).toBeLessThan(noExtra.months);
  });
});

describe("checkRecurringDue", () => {
  it("is not due if it already ran today or later", () => {
    expect(checkRecurringDue({ frequency: "weekly" }, "2026-06-10", "2026-06-10")).toBe(false);
    expect(checkRecurringDue({ frequency: "weekly" }, "2026-06-11", "2026-06-10")).toBe(false);
  });

  it("weekly is due once 7+ days have passed", () => {
    expect(checkRecurringDue({ frequency: "weekly" }, "2026-06-03", "2026-06-09")).toBe(false);
    expect(checkRecurringDue({ frequency: "weekly" }, "2026-06-03", "2026-06-10")).toBe(true);
  });

  it("biweekly is due once 14+ days have passed", () => {
    expect(checkRecurringDue({ frequency: "biweekly" }, "2026-06-01", "2026-06-14")).toBe(false);
    expect(checkRecurringDue({ frequency: "biweekly" }, "2026-06-01", "2026-06-15")).toBe(true);
  });

  it("monthly is due on/after the target day in a later month", () => {
    const r = { frequency: "monthly", day: 15 };
    expect(checkRecurringDue(r, "2026-05-15", "2026-06-14")).toBe(false); // same month, before day
    expect(checkRecurringDue(r, "2026-05-15", "2026-06-15")).toBe(true);  // next month, on day
    expect(checkRecurringDue(r, "2026-05-15", "2026-06-20")).toBe(true);  // next month, after day
  });

  it("monthly defaults the target day to 1 when not provided", () => {
    const r = { frequency: "monthly" };
    expect(checkRecurringDue(r, "2026-05-15", "2026-06-01")).toBe(true);
  });

  it("quarterly is due once 90+ days have passed", () => {
    expect(checkRecurringDue({ frequency: "quarterly" }, "2026-01-01", "2026-03-31")).toBe(false);
    expect(checkRecurringDue({ frequency: "quarterly" }, "2026-01-01", "2026-04-01")).toBe(true);
  });

  it("yearly is due once 365+ days have passed", () => {
    expect(checkRecurringDue({ frequency: "yearly" }, "2025-06-10", "2026-06-09")).toBe(false);
    expect(checkRecurringDue({ frequency: "yearly" }, "2025-06-10", "2026-06-10")).toBe(true);
  });

  it("returns false for an unrecognized frequency", () => {
    expect(checkRecurringDue({ frequency: "daily" }, "2026-01-01", "2026-12-31")).toBe(false);
  });
});

describe("getNextDue", () => {
  const today = new Date("2026-06-10T12:00:00Z");

  it("advances a weekly recurrence to the next future date", () => {
    const r = { frequency: "weekly", startDate: "2026-06-08" };
    expect(getNextDue(r, today)).toBe("Jun 15, 2026");
  });

  it("KNOWN QUIRK: a day-31 start date overflows past February into March", () => {
    // Started Jan 31st. setMonth(+1) on a day-31 date overflows Feb (28 days
    // in 2026) into March 3rd before the day is clamped to 31, so the
    // computed "next due" date skips February entirely and lands on Mar 31.
    // This documents the current behavior; see analysis notes for a possible fix.
    const r = { frequency: "monthly", day: 31, startDate: "2026-01-31" };
    const next = getNextDue(r, new Date("2026-02-15T12:00:00Z"));
    expect(next).toBe("Mar 31, 2026");
  });

  it("returns the start date itself if it is in the future", () => {
    const r = { frequency: "monthly", startDate: "2026-07-01" };
    expect(getNextDue(r, today)).toBe("Jul 1, 2026");
  });
});

describe("filterByRange", () => {
  const expenses = [
    { transactionDate: "2026-01-15", amount: 10 },
    { transactionDate: "2026-02-15", amount: 20 },
    { transactionDate: "2026-03-15", amount: 30 },
  ];

  it("returns all expenses when no range is given", () => {
    expect(filterByRange(expenses, "", "")).toHaveLength(3);
  });

  it("filters out expenses before the from month", () => {
    const result = filterByRange(expenses, "2026-02", "");
    expect(result.map(e => e.amount)).toEqual([20, 30]);
  });

  it("filters out expenses after the to month", () => {
    const result = filterByRange(expenses, "", "2026-02");
    expect(result.map(e => e.amount)).toEqual([10, 20]);
  });

  it("is inclusive of both endpoints", () => {
    const result = filterByRange(expenses, "2026-02", "2026-02");
    expect(result.map(e => e.amount)).toEqual([20]);
  });

  it("falls back to date when transactionDate is missing", () => {
    const result = filterByRange([{ date: "2026-02-15T00:00:00.000Z", amount: 5 }], "2026-02", "2026-02");
    expect(result).toHaveLength(1);
  });
});

describe("catEmoji", () => {
  it("extracts the emoji prefix from a category name", () => {
    expect(catEmoji("🍔 Food")).toBe("🍔");
  });

  it("falls back to a default emoji for empty/missing names", () => {
    expect(catEmoji("")).toBe("📦");
    expect(catEmoji(undefined)).toBe("📦");
  });
});

describe("fmtPct", () => {
  it("prefixes positive values with a plus sign", () => {
    expect(fmtPct(5.123)).toBe("+5.12%");
  });

  it("does not prefix negative values", () => {
    expect(fmtPct(-3.456)).toBe("-3.46%");
  });

  it("treats zero as positive", () => {
    expect(fmtPct(0)).toBe("+0.00%");
  });
});

describe("getHoldings", () => {
  it("aggregates buys into shares and cost basis", () => {
    const trades = [
      { ticker: "AAPL", type: "buy", shares: 10, price: 100, currentPrice: 150 },
      { ticker: "AAPL", type: "buy", shares: 10, price: 200, currentPrice: 150 },
    ];
    const [holding] = getHoldings(trades);
    expect(holding.shares).toBe(20);
    expect(holding.costBasis).toBe(3000);
    expect(holding.currentValue).toBe(3000);
    expect(holding.gain).toBe(0);
  });

  it("recomputes cost basis using average cost on sells", () => {
    const trades = [
      { ticker: "AAPL", type: "buy", shares: 10, price: 100, currentPrice: 120 },
      { ticker: "AAPL", type: "sell", shares: 5, price: 150, currentPrice: 120 },
    ];
    const [holding] = getHoldings(trades);
    expect(holding.shares).toBe(5);
    // avg cost was 100/share, so selling 5 removes 500 of cost basis
    expect(holding.costBasis).toBe(500);
    expect(holding.gainPct).toBeCloseTo(20, 5);
  });

  it("excludes positions that have been fully sold off", () => {
    const trades = [
      { ticker: "AAPL", type: "buy", shares: 10, price: 100, currentPrice: 120 },
      { ticker: "AAPL", type: "sell", shares: 10, price: 150, currentPrice: 120 },
    ];
    expect(getHoldings(trades)).toHaveLength(0);
  });

  it("returns an empty array for no trades", () => {
    expect(getHoldings([])).toEqual([]);
  });
});

describe("getBrokerAccountValue / getBrokerAccountCost", () => {
  const acc = {
    positions: [
      { shares: 10, currentPrice: 50, avgCost: 40 },
      { shares: 2, currentPrice: 100, avgCost: 90 },
    ],
  };

  it("sums market value across positions", () => {
    expect(getBrokerAccountValue(acc)).toBe(700);
  });

  it("sums cost basis across positions", () => {
    expect(getBrokerAccountCost(acc)).toBe(580);
  });

  it("treats a missing positions array as empty", () => {
    expect(getBrokerAccountValue({})).toBe(0);
    expect(getBrokerAccountCost({})).toBe(0);
  });
});

describe("get401kValue", () => {
  it("prefers the explicit balance when present", () => {
    expect(get401kValue({ balance: 5000, contributions: [{ amount: 100 }] })).toBe(5000);
  });

  it("falls back to summing contributions when balance is unset", () => {
    expect(get401kValue({ contributions: [{ amount: 100 }, { amount: 200 }] })).toBe(300);
  });

  it("returns 0 with no balance and no contributions", () => {
    expect(get401kValue({})).toBe(0);
  });
});
