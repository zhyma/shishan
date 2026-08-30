// @shishan function calculate-order
// @summary Calculate a normalized order total
// @input item prices
// @output discounted total
export function calculateOrder(prices) {
  // @shishan detail normalize-prices
  // @summary Copy prices and calculate the subtotal
  // @covers statements=2
  const normalized = [...prices];
  let total = normalized.reduce((sum, price) => sum + price, 0);

  // @shishan loop audit-prices
  // @summary Visit every normalized price for auditing
  for (const price of normalized) {
    // @shishan step record-price
    // @summary Record one price in the audit stream
    console.log(price);
  }

  // @shishan step return-total
  // @summary Return the final numeric total
  return total;
}
