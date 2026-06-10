// Pure calculation helpers shared by index.html and the test suite.
// Loaded as a classic script before the main inline script, so these
// functions are available as globals in the browser.

function amortize(balance, annualRate, minPayment, extraPayment = 0) {
  // Returns array of { month, payment, principal, interest, balance }
  const monthlyRate = annualRate / 100 / 12;
  const payment = minPayment + extraPayment;
  let bal = balance;
  const schedule = [];
  let month = 0;
  while (bal > 0.005 && month < 600) {
    month++;
    const interest = bal * monthlyRate;
    const principal = Math.min(payment - interest, bal);
    if (principal <= 0) { schedule.push({ month, payment: interest, principal: 0, interest, balance: bal }); break; }
    bal = Math.max(bal - principal, 0);
    schedule.push({ month, payment: principal + interest, principal, interest, balance: bal });
    if (bal < 0.005) break;
  }
  return schedule;
}

function debtPayoffSummary(debt, extra = 0) {
  const sched = amortize(debt.balance, debt.interestRate, debt.minPayment, extra);
  const totalPaid = sched.reduce((s, r) => s + r.payment, 0);
  const totalInterest = sched.reduce((s, r) => s + r.interest, 0);
  return { months: sched.length, totalPaid, totalInterest, schedule: sched };
}

function checkRecurringDue(r, lastRun, today) {
  if (lastRun >= today) return false;
  const last = new Date(lastRun), now = new Date(today);
  const diffDays = (now - last) / (1000 * 60 * 60 * 24);
  if (r.frequency === "weekly" && diffDays >= 7) return true;
  if (r.frequency === "biweekly" && diffDays >= 14) return true;
  if (r.frequency === "monthly") {
    const targetDay = parseInt(r.day) || 1;
    if (now.getDate() >= targetDay && (now.getFullYear() > last.getFullYear() || now.getMonth() > last.getMonth())) return true;
  }
  if (r.frequency === "quarterly" && diffDays >= 90) return true;
  if (r.frequency === "yearly" && diffDays >= 365) return true;
  return false;
}

function getNextDue(r, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const start = new Date(r.startDate || today.toISOString().slice(0, 10));
  let next = new Date(start);
  while (next <= today) {
    if (r.frequency === "weekly") next.setDate(next.getDate() + 7);
    else if (r.frequency === "biweekly") next.setDate(next.getDate() + 14);
    else if (r.frequency === "monthly") { next.setMonth(next.getMonth() + 1); if (r.day) next.setDate(Math.min(r.day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())); }
    else if (r.frequency === "quarterly") next.setMonth(next.getMonth() + 3);
    else if (r.frequency === "yearly") next.setFullYear(next.getFullYear() + 1);
    else break;
  }
  return next.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function filterByRange(expenses, from, to) {
  return expenses.filter(e => {
    const m = (e.transactionDate || e.date || "").slice(0, 7);
    if (from && m < from) return false;
    if (to && m > to) return false;
    return true;
  });
}

function catEmoji(name) { return (name || "📦").split(" ")[0]; }

const fmtPct = n => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

function getHoldings(trades) {
  const map = {};
  trades.forEach(t => {
    if (!map[t.ticker]) map[t.ticker] = { ticker: t.ticker, name: t.name || t.ticker, shares: 0, costBasis: 0, currentPrice: t.currentPrice || t.price };
    if (t.type === "buy") {
      map[t.ticker].costBasis += t.shares * t.price;
      map[t.ticker].shares += t.shares;
    } else {
      const avgCost = map[t.ticker].shares > 0 ? map[t.ticker].costBasis / map[t.ticker].shares : 0;
      map[t.ticker].costBasis -= avgCost * t.shares;
      map[t.ticker].shares -= t.shares;
    }
    if (t.currentPrice) map[t.ticker].currentPrice = t.currentPrice;
  });
  return Object.values(map).filter(h => h.shares > 0.0001).map(h => ({
    ...h,
    currentValue: h.shares * h.currentPrice,
    gain: (h.shares * h.currentPrice) - h.costBasis,
    gainPct: h.costBasis > 0 ? ((h.shares * h.currentPrice - h.costBasis) / h.costBasis * 100) : 0,
  }));
}

function getBrokerAccountValue(acc) {
  return (acc.positions || []).reduce((s, p) => s + (p.shares * p.currentPrice), 0);
}

function getBrokerAccountCost(acc) {
  return (acc.positions || []).reduce((s, p) => s + (p.shares * p.avgCost), 0);
}

function get401kValue(plan) {
  return plan.balance || (plan.contributions || []).reduce((s, c) => s + c.amount, 0);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
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
  };
}
