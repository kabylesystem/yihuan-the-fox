#!/bin/bash
# Automated Regression Pre-Check for Phase 5 UI/UX Polish
# Tests backend endpoints to verify no regressions before manual QA

echo "============================================================"
echo "AUTOMATED REGRESSION PRE-CHECK"
echo "Phase 5 UI/UX Polish - Subtask 9-3"
echo "============================================================"

BACKEND="http://localhost:8000"
FRONTEND="http://localhost:5176"
PASSED=0
FAILED=0

# Test backend health
echo ""
echo "🔍 Testing backend health..."
HEALTH=$(curl -s "$BACKEND/health" 2>&1)
if [ "$HEALTH" = "OK" ]; then
    echo "✅ Backend health: OK"
    ((PASSED++))
else
    echo "❌ Backend health check failed: $HEALTH"
    ((FAILED++))
fi

# Test session state endpoint
echo ""
echo "🔍 Testing session state endpoint..."
SESSION_STATE=$(curl -s "$BACKEND/api/session/state" 2>&1)
if echo "$SESSION_STATE" | grep -q '"turn"'; then
    TURN=$(echo "$SESSION_STATE" | grep -o '"turn":[0-9]*' | cut -d':' -f2)
    LEVEL=$(echo "$SESSION_STATE" | grep -o '"level":"[^"]*"' | cut -d'"' -f4)
    HISTORY_COUNT=$(echo "$SESSION_STATE" | grep -o '"conversation_history":\[[^]]*\]' | grep -o ',' | wc -l)
    echo "✅ Session state: turn=$TURN, level=$LEVEL"
    echo "   Conversation history: $HISTORY_COUNT messages"
    ((PASSED++))
else
    echo "❌ Session state check failed"
    ((FAILED++))
fi

# Test graph nodes endpoint
echo ""
echo "🔍 Testing graph nodes endpoint..."
NODES=$(curl -s "$BACKEND/api/graph/nodes" 2>&1)
if echo "$NODES" | grep -q '\['; then
    NODE_COUNT=$(echo "$NODES" | grep -o '{' | wc -l)
    echo "✅ Graph nodes: $NODE_COUNT nodes available"
    if [ "$NODE_COUNT" -gt 0 ]; then
        SAMPLE_NODE=$(echo "$NODES" | head -1)
        echo "   Sample: $(echo "$SAMPLE_NODE" | head -c 80)..."
    fi
    ((PASSED++))
else
    echo "❌ Graph nodes check failed"
    ((FAILED++))
fi

# Test graph links endpoint
echo ""
echo "🔍 Testing graph links endpoint..."
LINKS=$(curl -s "$BACKEND/api/graph/links" 2>&1)
if echo "$LINKS" | grep -q '\['; then
    LINK_COUNT=$(echo "$LINKS" | grep -o '{' | wc -l)
    echo "✅ Graph links: $LINK_COUNT links available"
    if [ "$LINK_COUNT" -gt 0 ]; then
        SAMPLE_LINK=$(echo "$LINKS" | head -1)
        echo "   Sample: $(echo "$SAMPLE_LINK" | head -c 80)..."
    fi
    ((PASSED++))
else
    echo "❌ Graph links check failed"
    ((FAILED++))
fi

# Test frontend accessibility
echo ""
echo "🔍 Testing frontend accessibility..."
FRONTEND_RESPONSE=$(curl -s "$FRONTEND" 2>&1)
if echo "$FRONTEND_RESPONSE" | grep -q '<title>'; then
    TITLE=$(echo "$FRONTEND_RESPONSE" | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g')
    echo "✅ Frontend loads: title='$TITLE'"
    ((PASSED++))
else
    echo "❌ Frontend check failed"
    ((FAILED++))
fi

# Test session reset endpoint
echo ""
echo "🔍 Testing session reset endpoint..."
RESET_RESPONSE=$(curl -s -X POST "$BACKEND/api/session/reset" 2>&1)
if echo "$RESET_RESPONSE" | grep -q '"status"'; then
    STATUS=$(echo "$RESET_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    RESET_TURN=$(echo "$RESET_RESPONSE" | grep -o '"turn":[0-9]*' | cut -d':' -f2)
    echo "✅ Session reset: $STATUS"
    echo "   Turn reset to: $RESET_TURN"
    ((PASSED++))
else
    echo "❌ Session reset check failed"
    ((FAILED++))
fi

# Summary
echo ""
echo "============================================================"
echo "SUMMARY"
echo "============================================================"
TOTAL=$((PASSED + FAILED))
echo "✅ PASSED: $PASSED/$TOTAL"
if [ $FAILED -gt 0 ]; then
    echo "❌ FAILED: $FAILED/$TOTAL"
fi

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "🎉 All automated checks passed!"
    echo "✅ System is ready for manual QA testing"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Open browser to $FRONTEND"
    echo "   2. Follow MANUAL_QA_REGRESSION_TEST.md"
    echo "   3. Complete 5 conversation turns"
    echo "   4. Verify no console errors"
    echo ""
    echo "WebSocket Connection Test:"
    echo "   - Open browser DevTools (F12)"
    echo "   - Go to Network > WS tab"
    echo "   - Look for ws://localhost:8000/ws/conversation"
    echo "   - Should show status 101 (Switching Protocols)"
    exit 0
else
    echo ""
    echo "⚠️  Some automated checks failed!"
    echo "Please fix issues before proceeding to manual QA"
    exit 1
fi
