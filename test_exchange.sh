#!/bin/bash

# HFT Exchange Service API Test Script
echo " Testing HFT Exchange Service API"
echo "======================================"

BASE_URL="http://localhost:8080"

# Wait for service to start
echo "⏳ Waiting for service to start..."
sleep 3

# Test 1: Health Check
echo -e "\n 1. Health Check"
curl -s "$BASE_URL/health" | jq .

# Test 2: List Symbols
echo -e "\n 2. List Available Symbols"
curl -s "$BASE_URL/symbols" | jq .

# Test 3: Get Order Book State
echo -e "\n 3. Get Order Book State for AAPL"
curl -s "$BASE_URL/symbols/AAPL/orderbook" | jq .

# Test 4: Get Market Depth
echo -e "\n 4. Get Market Depth for AAPL (5 levels)"
curl -s "$BASE_URL/symbols/AAPL/depth?levels=5" | jq .

# Test 5: Submit Buy Order
echo -e "\n 5. Submit Buy Order (AAPL, 100 shares @ 15000 ticks)"
BUY_ORDER_RESPONSE=$(curl -s -X POST "$BASE_URL/symbols/AAPL/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "side": "Bid",
    "price": 15000,
    "quantity": 100
  }')
echo "$BUY_ORDER_RESPONSE" | jq .

# Extract order ID for later cancellation
BUY_ORDER_ID=$(echo "$BUY_ORDER_RESPONSE" | jq -r '.order_id')

# Test 6: Submit Sell Order
echo -e "\n 6. Submit Sell Order (AAPL, 50 shares @ 15100 ticks)"
SELL_ORDER_RESPONSE=$(curl -s -X POST "$BASE_URL/symbols/AAPL/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "side": "Ask",
    "price": 15100,
    "quantity": 50
  }')
echo "$SELL_ORDER_RESPONSE" | jq .

SELL_ORDER_ID=$(echo "$SELL_ORDER_RESPONSE" | jq -r '.order_id')

# Test 7: Check Order Book After Orders
echo -e "\n 7. Order Book State After Submitting Orders"
curl -s "$BASE_URL/symbols/AAPL/orderbook" | jq .

# Test 8: Submit Crossing Order (should create trades)
echo -e "\n⚡ 8. Submit Crossing Buy Order (AAPL, 75 shares @ 15100 ticks)"
curl -s -X POST "$BASE_URL/symbols/AAPL/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "side": "Bid",
    "price": 15100,
    "quantity": 75
  }' | jq .

# Test 9: Check Order Book After Trade
echo -e "\n 9. Order Book State After Trade"
curl -s "$BASE_URL/symbols/AAPL/orderbook" | jq .

# Test 10: Test Multiple Symbols
echo -e "\n 10. Test TSLA Orders"
curl -s -X POST "$BASE_URL/symbols/TSLA/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "side": "Ask",
    "price": 25000,
    "quantity": 200
  }' | jq .

# Test 11: Get Market Depth for TSLA
echo -e "\n 11. TSLA Market Depth"
curl -s "$BASE_URL/symbols/TSLA/depth" | jq .

# Test 12: Cancel Order
echo -e "\n 12. Cancel Buy Order (Order ID: $BUY_ORDER_ID)"
if [ "$BUY_ORDER_ID" != "null" ] && [ -n "$BUY_ORDER_ID" ]; then
    curl -s -X DELETE "$BASE_URL/symbols/AAPL/orders/$BUY_ORDER_ID" | jq .
else
    echo "No valid order ID to cancel"
fi

# Test 13: Final Order Book State
echo -e "\n 13. Final AAPL Order Book State"
curl -s "$BASE_URL/symbols/AAPL/orderbook" | jq .

# Test 14: High-Frequency Order Simulation
echo -e "\n 14. High-Frequency Order Simulation (10 orders)"
for i in {1..10}; do
    PRICE=$((15000 + i * 10))
    SIDE="Bid"
    if [ $((i % 2)) -eq 0 ]; then
        SIDE="Ask"
        PRICE=$((15100 + i * 10))
    fi
    
    echo "Submitting $SIDE order #$i at $PRICE ticks"
    curl -s -X POST "$BASE_URL/symbols/AAPL/orders" \
      -H "Content-Type: application/json" \
      -d "{
        \"side\": \"$SIDE\",
        \"price\": $PRICE,
        \"quantity\": 50
      }" > /dev/null
done

# Test 15: Final Market Summary
echo -e "\n 15. Final Market Summary"
echo "Available Symbols:"
curl -s "$BASE_URL/symbols" | jq -r '.symbols[]' | while read symbol; do
    echo "  $symbol:"
    curl -s "$BASE_URL/symbols/$symbol/orderbook" | jq -r '  "    Best Bid: \(.best_bid // "None") | Best Ask: \(.best_ask // "None") | Levels: \(.bid_levels) bids, \(.ask_levels) asks"'
done

echo -e "\n API Testing Complete!"
echo " WebSocket endpoints available at:"
echo "  - ws://localhost:8080/symbols/AAPL/trades/stream"
echo "  - ws://localhost:8080/symbols/AAPL/depth/stream"
echo ""
echo " Try connecting with a WebSocket client to see real-time updates!" 