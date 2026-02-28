"""
Tests for backend.config module.

Verifies:
- MOCK_MODE defaults to True when env var is unset
- MOCK_MODE reads correctly from environment variable
- API key config variables load when set
"""

import importlib
import os


class TestMockModeConfig:
    """Tests for the MOCK_MODE configuration toggle."""

    def test_mock_mode_defaults_true(self, monkeypatch):
        """MOCK_MODE should default to True when MOCK_MODE env var is unset."""
        monkeypatch.delenv("MOCK_MODE", raising=False)
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.MOCK_MODE is True

    def test_mock_mode_true_when_set_true(self, monkeypatch):
        """MOCK_MODE=true in env should result in True."""
        monkeypatch.setenv("MOCK_MODE", "true")
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.MOCK_MODE is True

    def test_mock_mode_true_when_set_yes(self, monkeypatch):
        """MOCK_MODE=yes in env should result in True."""
        monkeypatch.setenv("MOCK_MODE", "yes")
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.MOCK_MODE is True

    def test_mock_mode_true_when_set_one(self, monkeypatch):
        """MOCK_MODE=1 in env should result in True."""
        monkeypatch.setenv("MOCK_MODE", "1")
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.MOCK_MODE is True

    def test_mock_mode_false_when_set_false(self, monkeypatch):
        """MOCK_MODE=false in env should result in False."""
        monkeypatch.setenv("MOCK_MODE", "false")
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.MOCK_MODE is False

    def test_mock_mode_false_when_set_zero(self, monkeypatch):
        """MOCK_MODE=0 in env should result in False."""
        monkeypatch.setenv("MOCK_MODE", "0")
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.MOCK_MODE is False

    def test_mock_mode_case_insensitive(self, monkeypatch):
        """MOCK_MODE=TRUE should also result in True (case-insensitive)."""
        monkeypatch.setenv("MOCK_MODE", "TRUE")
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.MOCK_MODE is True


class TestApiKeyConfig:
    """Tests for API key configuration variables."""

    def test_api_keys_default_empty(self, monkeypatch):
        """API keys should default to empty strings when unset."""
        monkeypatch.delenv("SPEECHMATICS_API_KEY", raising=False)
        monkeypatch.delenv("BACKBOARD_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_ORG_ID", raising=False)
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.SPEECHMATICS_API_KEY == ""
        assert backend.config.BACKBOARD_API_KEY == ""
        assert backend.config.OPENAI_API_KEY == ""
        assert backend.config.OPENAI_ORG_ID == ""

    def test_api_keys_load_when_set(self, monkeypatch):
        """API keys should load from environment when set."""
        monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm_test_key_123")
        monkeypatch.setenv("BACKBOARD_API_KEY", "bb_test_key_456")
        monkeypatch.setenv("OPENAI_API_KEY", "sk_test_key_789")
        monkeypatch.setenv("OPENAI_ORG_ID", "org_test_id")
        import backend.config
        importlib.reload(backend.config)
        assert backend.config.SPEECHMATICS_API_KEY == "sm_test_key_123"
        assert backend.config.BACKBOARD_API_KEY == "bb_test_key_456"
        assert backend.config.OPENAI_API_KEY == "sk_test_key_789"
        assert backend.config.OPENAI_ORG_ID == "org_test_id"
