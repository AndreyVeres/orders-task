import { z } from "zod";
import { ValidationError } from "../errors.js";
import type { Order, OrdersRepository } from "../repositories/orders.js";
import { parsePercent, parseRub, toKop } from "../utils/money.js";
import { parseUtc } from "../utils/time.js";

const Amount = z.union([z.number(), z.string()]);
/** Заказ в формате внешнего API (поля, которые нам нужны; остальные игнорируем). */
const ExternalOrder = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  amount: Amount,
  status: z.enum(["pending", "paid", "refunded"]),

  discountPercent: Amount.nullish(),
  amountPaid: Amount.nullish(),

  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplyResult = "created" | "updated" | "stale";

export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  normalize(raw: unknown): Order {
    const parsed = ExternalOrder.safeParse(raw);
    if (!parsed.success)
      throw new ValidationError(
        `invalid order: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      );
    const o = parsed.data;

    try {
      const amountKop = toKop(parseRub(o.amount));
      const amountPaidKop =
        o.amountPaid === null || o.amountPaid === undefined
          ? amountKop
          : toKop(parseRub(o.amountPaid));

      if (amountPaidKop > amountKop) {
        throw new Error(
          `amountPaid (${o.amountPaid}) cannot exceed amount (${o.amount})`,
        );
      }

      return {
        id: o.id,
        customerId: o.customerId,
        amountKop: amountKop,
        amountPaidKop,
        discountPercent:
          o.discountPercent === null || o.discountPercent === undefined
            ? 0
            : parsePercent(o.discountPercent),
        status: o.status,
        createdAt: parseUtc(o.createdAt),
        updatedAt: parseUtc(o.updatedAt),
      };
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
  }

  /**
   * Применяет версию заказа (из синка или вебхука).
   * Вебхуки приходят с повторами и не по порядку, поэтому версию сохраняем,
   * только если она новее уже сохранённой (по updatedAt).
   */
  async apply(raw: unknown): Promise<ApplyResult> {
    const incoming = this.normalize(raw);
    const current = await this.orders.get(incoming.id);
    if (current && current.updatedAt.getTime() >= incoming.updatedAt.getTime())
      return "stale";
    const saved = await this.orders.save(incoming);

    if (!saved) return "stale";
    return current ? "updated" : "created";
  }
}
