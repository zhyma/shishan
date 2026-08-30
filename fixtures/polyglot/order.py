# @shishan function calculate-order
# @summary Calculate a normalized order total
# @input raw item prices
# @output discounted total
def calculate_order(prices):
    # @shishan detail normalize-prices
    # @summary Materialize prices and calculate the subtotal
    # @covers statements=2
    prices = list(prices)
    total = sum(prices)

    # @shishan branch apply-discount
    # @summary Apply a discount to sufficiently large orders
    # @condition total is at least 100
    if total >= 100:
        # @shishan step reduce-total
        # @summary Reduce the subtotal by ten percent
        total *= 0.9

    # @shishan loop audit-prices
    # @summary Visit every normalized price for auditing
    for price in prices:
        # @shishan step record-price
        # @summary Record one price in the audit stream
        print(price)

    # @shishan step return-total
    # @summary Return the final numeric total
    return total
