import type { Db } from "../db.js";

export interface Order {
  id: string;
  customerId: string;
  amountKop: number;
  status: "pending" | "paid" | "refunded";

  amountPaidKop: number;
  discountPercent: number;

  createdAt: Date;
  updatedAt: Date;
}

interface Row {
  id: string;
  customer_id: string;
  amount_kop: string;
  status: Order["status"];

  amount_paid_kop: string;
  discount_percent: string;

  created_at: Date;
  updated_at: Date;
}

const fromRow = (r: Row): Order => ({
  id: r.id,
  customerId: r.customer_id,
  amountKop: Number(r.amount_kop),
  status: r.status,

  amountPaidKop: Number(r.amount_paid_kop),
  discountPercent: Number(r.discount_percent),

  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class OrdersRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Order | null> {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM orders WHERE id = $1`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async save(o: Order): Promise<boolean> {
   const res = await this.db.query(
      `INSERT INTO orders (id, customer_id, amount_kop, status, amount_paid_kop, discount_percent, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         customer_id = excluded.customer_id,
         amount_kop  = excluded.amount_kop,
         status      = excluded.status,
         amount_paid_kop = excluded.amount_paid_kop,
         discount_percent = excluded.discount_percent,
         created_at  = excluded.created_at,
         updated_at  = excluded.updated_at 
       WHERE orders.updated_at < excluded.updated_at
         `, 
      [
        o.id,
        o.customerId,
        o.amountKop,
        o.status,
        o.amountPaidKop,
        o.discountPercent,
        o.createdAt,
        o.updatedAt,
      ],
    );

    return (res.rowCount ?? 0) > 0;
  }

  /** Оплаченные заказы клиента, созданные в [from, to). */
  async paidCreatedBetween(
    customerId: string,
    from: Date,
    to: Date,
  ): Promise<Order[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT * FROM orders
        WHERE customer_id = $1 AND status = 'paid' AND created_at >= $2 AND created_at < $3`,
      [customerId, from, to],
    );
    return rows.map(fromRow);
  }
}
