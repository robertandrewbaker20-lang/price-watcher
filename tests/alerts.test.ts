import assert from "node:assert/strict";
import test from "node:test";
import { shouldAlertPriceDrop } from "../src/lib/alerts";
import { DROP_THRESHOLD_PCT, type AlertRule } from "../src/lib/domain";

const rule: AlertRule = {
  dropThresholdPct: DROP_THRESHOLD_PCT,
  targetPrice: null,
  preferredSize: null,
};

test("a missing price does not alert", () => {
  const decision = shouldAlertPriceDrop({
    currentPrice: null,
    previousPrice: 40,
    rule,
  });
  assert.equal(decision.shouldAlert, false);
  assert.equal(decision.reason, null);
});

test("a 20 percent drop alerts and a smaller drop does not", () => {
  const hit = shouldAlertPriceDrop({
    currentPrice: 80,
    previousPrice: 100,
    rule,
  });
  assert.equal(hit.shouldAlert, true);
  assert.equal(hit.dropPct, 20);
  assert.match(hit.reason ?? "", /Dropped 20\.0%/);

  const miss = shouldAlertPriceDrop({
    currentPrice: 80.1,
    previousPrice: 100,
    rule,
  });
  assert.equal(miss.shouldAlert, false);
  assert.ok((miss.dropPct ?? 0) < 20);
});

test("a target price alerts even when the price rose", () => {
  const decision = shouldAlertPriceDrop({
    currentPrice: 10,
    previousPrice: 9,
    rule: { ...rule, targetPrice: 12 },
  });
  assert.equal(decision.shouldAlert, true);
  assert.match(decision.reason ?? "", /Hit target/);
});

test("an unavailable preferred size suppresses the alert", () => {
  const hidden = shouldAlertPriceDrop({
    currentPrice: 30,
    previousPrice: 50,
    rule: { ...rule, preferredSize: "L" },
    sizeAvailable: false,
  });
  assert.equal(hidden.shouldAlert, false);
  assert.match(hidden.reason ?? "", /Size L is not available/);

  const unknown = shouldAlertPriceDrop({
    currentPrice: 30,
    previousPrice: 50,
    rule: { ...rule, preferredSize: "L" },
    sizeAvailable: null,
  });
  assert.equal(unknown.shouldAlert, true);
});
