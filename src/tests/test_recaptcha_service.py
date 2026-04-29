from unittest.mock import MagicMock, patch

import pytest

from app.services.recaptcha_service import RecaptchaFailed, verify_recaptcha


def _make_response(*, valid: bool = True, action: str = "post_preset", score: float = 0.9, invalid_reason: str = "UNKNOWN_INVALID_REASON") -> MagicMock:
    resp = MagicMock()
    resp.token_properties.valid = valid
    resp.token_properties.action = action
    resp.token_properties.invalid_reason.name = invalid_reason
    resp.risk_analysis.score = score
    return resp


@patch("app.services.recaptcha_service.recaptchaenterprise_v1.RecaptchaEnterpriseServiceClient")
def test_verify_recaptcha_success(mock_client_cls: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.create_assessment.return_value = _make_response(score=0.9)
    mock_client_cls.return_value = mock_client

    verify_recaptcha("token", project_id="p", site_key="6Le", expected_action="post_preset", threshold=0.5)
    mock_client.create_assessment.assert_called_once()


@patch("app.services.recaptcha_service.recaptchaenterprise_v1.RecaptchaEnterpriseServiceClient")
def test_verify_recaptcha_low_score(mock_client_cls: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.create_assessment.return_value = _make_response(score=0.3)
    mock_client_cls.return_value = mock_client

    with pytest.raises(RecaptchaFailed, match="score too low"):
        verify_recaptcha("token", project_id="p", site_key="6Le", expected_action="post_preset", threshold=0.5)


@patch("app.services.recaptcha_service.recaptchaenterprise_v1.RecaptchaEnterpriseServiceClient")
def test_verify_recaptcha_invalid_token(mock_client_cls: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.create_assessment.return_value = _make_response(valid=False, invalid_reason="EXPIRED")
    mock_client_cls.return_value = mock_client

    with pytest.raises(RecaptchaFailed, match="EXPIRED"):
        verify_recaptcha("token", project_id="p", site_key="6Le", expected_action="post_preset", threshold=0.5)


@patch("app.services.recaptcha_service.recaptchaenterprise_v1.RecaptchaEnterpriseServiceClient")
def test_verify_recaptcha_action_mismatch(mock_client_cls: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.create_assessment.return_value = _make_response(action="other_action")
    mock_client_cls.return_value = mock_client

    with pytest.raises(RecaptchaFailed, match="action mismatch"):
        verify_recaptcha("token", project_id="p", site_key="6Le", expected_action="post_preset", threshold=0.5)


def test_verify_recaptcha_no_project_skips_in_dev() -> None:
    # Empty project_id -> skip without exception (dev mode)
    verify_recaptcha("token", project_id="", site_key="6Le", expected_action="post_preset", threshold=0.5)


def test_verify_recaptcha_no_site_key_skips_in_dev() -> None:
    verify_recaptcha("token", project_id="p", site_key="", expected_action="post_preset", threshold=0.5)


@patch("app.services.recaptcha_service.recaptchaenterprise_v1.RecaptchaEnterpriseServiceClient")
def test_verify_recaptcha_at_threshold(mock_client_cls: MagicMock) -> None:
    mock_client = MagicMock()
    mock_client.create_assessment.return_value = _make_response(score=0.5)
    mock_client_cls.return_value = mock_client

    # Threshold inclusive: 0.5 >= 0.5 passes
    verify_recaptcha("token", project_id="p", site_key="6Le", expected_action="post_preset", threshold=0.5)
