#include <iostream>
#include <vector>

// @shishan function calculate-order
// @summary Calculate a normalized order total
// @input item prices
// @output discounted total
double calculateOrder(const std::vector<double>& prices) {
  // @shishan detail initialize-total
  // @summary Initialize the accumulator and item counter
  // @covers statements=2
  double total = 0.0;
  int count = 0;

  // @shishan loop accumulate-prices
  // @summary Add each price to the running total
  for (double price : prices) {
    // @shishan step add-price
    // @summary Add one price and increment the counter
    total += price;
    count += 1;
  }

  // @shishan branch apply-discount
  // @summary Apply a discount to sufficiently large orders
  // @condition total is at least 100
  if (total >= 100.0) {
    total *= 0.9;
  }

  // @shishan step return-total
  // @summary Return the final numeric total
  return total + count * 0.0;
}
