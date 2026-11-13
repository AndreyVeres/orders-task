import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });


  it("при параллельных вебхуках побеждает самая свежая версия", async () => {
  const base = apiOrder({ id: "o_race", amount: 5904, discountPercent: 0, amountPaid: 5904, updatedAt: "2026-03-30T01:15:32Z" });
  await postWebhook(ctx.app, base);

  const older = { ...base, discountPercent: 10, amountPaid: 5313.6, updatedAt: "2026-03-30T02:15:32Z" };
  const newer = { ...base, discountPercent: 33, amountPaid: 3955.68, updatedAt: "2026-03-30T03:15:32Z" };

  await Promise.all([
    postWebhook(ctx.app, newer),
    postWebhook(ctx.app, older),
    postWebhook(ctx.app, newer),
    postWebhook(ctx.app, older),
  ]);

  const { rows } = await ctx.db.query(`SELECT amount_paid_kop, discount_percent FROM orders WHERE id = 'o_race'`);
  expect(Number(rows[0].amount_paid_kop)).toBe(395568);
  expect(Number(rows[0].discount_percent)).toBe(33);
});
});
