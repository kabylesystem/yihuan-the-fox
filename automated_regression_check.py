#!/usr/bin/env python3
"""
Automated Regression Pre-Check for Phase 5 UI/UX Polish
Tests backend endpoints and WebSocket to verify no regressions before manual QA
"""

import requests
import json
import sys
from websockets.sync.client import connect
from time import sleep

# Configuration
BACKEND_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/ws/conversation"

def test_health():
    """Test backend health endpoint"""
    print("🔍 Testing backend health...")
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        assert response.status_code == 200
        assert response.text == "OK"
        print("✅ Backend health: OK")
        return True
    except Exception as e:
        print(f"❌ Backend health check failed: {e}")
        return False

def test_session_state():
    """Test session state endpoint"""
    print("\n🔍 Testing session state endpoint...")
    try:
        response = requests.get(f"{BACKEND_URL}/api/session/state", timeout=5)
        assert response.status_code == 200
        data = response.json()

        # Verify expected fields
        required_fields = ["turn", "level", "mastery_scores", "conversation_history", "demo_complete"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"

        print(f"✅ Session state: turn={data['turn']}, level={data['level']}")
        print(f"   Conversation history: {len(data['conversation_history'])} messages")
        return True
    except Exception as e:
        print(f"❌ Session state check failed: {e}")
        return False

def test_graph_nodes():
    """Test graph nodes endpoint"""
    print("\n🔍 Testing graph nodes endpoint...")
    try:
        response = requests.get(f"{BACKEND_URL}/api/graph/nodes", timeout=5)
        assert response.status_code == 200
        nodes = response.json()
        assert isinstance(nodes, list)

        print(f"✅ Graph nodes: {len(nodes)} nodes available")
        if len(nodes) > 0:
            # Verify node structure
            node = nodes[0]
            required_fields = ["id", "label", "type", "mastery"]
            for field in required_fields:
                assert field in node, f"Node missing field: {field}"
            print(f"   Sample node: {node['label']} (mastery: {node['mastery']})")
        return True
    except Exception as e:
        print(f"❌ Graph nodes check failed: {e}")
        return False

def test_graph_links():
    """Test graph links endpoint"""
    print("\n🔍 Testing graph links endpoint...")
    try:
        response = requests.get(f"{BACKEND_URL}/api/graph/links", timeout=5)
        assert response.status_code == 200
        links = response.json()
        assert isinstance(links, list)

        print(f"✅ Graph links: {len(links)} links available")
        if len(links) > 0:
            # Verify link structure
            link = links[0]
            required_fields = ["source", "target", "relationship"]
            for field in required_fields:
                assert field in link, f"Link missing field: {field}"
            print(f"   Sample link: {link['source']} → {link['target']} ({link['relationship']})")
        return True
    except Exception as e:
        print(f"❌ Graph links check failed: {e}")
        return False

def test_websocket():
    """Test WebSocket connection"""
    print("\n🔍 Testing WebSocket connection...")
    try:
        with connect(WS_URL, timeout=5) as ws:
            print("✅ WebSocket connected successfully")

            # Send a test message
            test_msg = {
                "type": "text",
                "content": "Test message for automated check"
            }
            ws.send(json.dumps(test_msg))
            print("   Sent test message")

            # Try to receive a response (with timeout)
            try:
                response = ws.recv(timeout=3)
                data = json.loads(response)
                print(f"   Received response: {data.get('type', 'unknown')}")
            except TimeoutError:
                print("   (No immediate response - this is OK for MOCK_MODE)")

            return True
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")
        return False

def test_session_reset():
    """Test session reset endpoint"""
    print("\n🔍 Testing session reset endpoint...")
    try:
        response = requests.post(f"{BACKEND_URL}/api/session/reset", timeout=5)
        assert response.status_code == 200
        data = response.json()

        assert "status" in data
        assert "turn" in data

        print(f"✅ Session reset: {data['status']}")
        print(f"   Turn reset to: {data['turn']}")
        return True
    except Exception as e:
        print(f"❌ Session reset check failed: {e}")
        return False

def main():
    """Run all automated regression checks"""
    print("=" * 60)
    print("AUTOMATED REGRESSION PRE-CHECK")
    print("Phase 5 UI/UX Polish - Subtask 9-3")
    print("=" * 60)

    tests = [
        ("Backend Health", test_health),
        ("Session State", test_session_state),
        ("Graph Nodes", test_graph_nodes),
        ("Graph Links", test_graph_links),
        ("WebSocket Connection", test_websocket),
        ("Session Reset", test_session_reset),
    ]

    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ Test '{name}' crashed: {e}")
            results.append((name, False))

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All automated checks passed!")
        print("✅ System is ready for manual QA testing")
        print(f"\n📋 Next steps:")
        print(f"   1. Open browser to http://localhost:5176")
        print(f"   2. Follow MANUAL_QA_REGRESSION_TEST.md")
        print(f"   3. Complete 5 conversation turns")
        print(f"   4. Verify no console errors")
        return 0
    else:
        print("\n⚠️  Some automated checks failed!")
        print("Please fix issues before proceeding to manual QA")
        return 1

if __name__ == "__main__":
    sys.exit(main())
