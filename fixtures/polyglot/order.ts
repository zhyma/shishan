// @shishan function calculate-order
// @summary Calculate a normalized order total
// @input item prices
// @output discounted total
export const calculateOrder = (prices: number[]): number => {
  // @shishan detail normalize-prices
  // @summary Copy prices and calculate the subtotal
  // @covers statements=2
  const normalized = [...prices];
  let total = normalized.reduce((sum, price) => sum + price, 0);

  // @shishan branch apply-discount
  // @summary Apply a discount to sufficiently large orders
  // @condition total is at least 100
  if (total >= 100) {
    // @shishan step reduce-total
    // @summary Reduce the subtotal by ten percent
    total *= 0.9;
  }

  // @shishan step return-total
  // @summary Return the finalized numeric total
  return total;
};
