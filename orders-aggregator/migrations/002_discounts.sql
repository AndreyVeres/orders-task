ALTER TABLE orders
  ADD COLUMN amount_paid_kop BIGINT,
  ADD COLUMN discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

UPDATE orders
SET amount_paid_kop = amount_kop
WHERE amount_paid_kop IS NULL;

ALTER TABLE orders
  ALTER COLUMN amount_paid_kop SET NOT NULL;