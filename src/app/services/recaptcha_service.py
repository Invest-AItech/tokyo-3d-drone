"""Google reCAPTCHA Enterprise v3 token verification.

Uses Application Default Credentials / the Cloud Run service account to
authenticate against the reCAPTCHA Enterprise API. Compared to Classic v3
this means: no Secret Key to manage, just the Site Key (already public)
plus the GCP project ID + IAM role ``roles/recaptchaenterprise.agent``
on the service account.
"""
from __future__ import annotations

import logging

from google.cloud import recaptchaenterprise_v1

logger = logging.getLogger(__name__)


class RecaptchaFailed(Exception):
    """Raised when reCAPTCHA verification fails (invalid token / score below threshold / action mismatch)."""


def verify_recaptcha(
    token: str,
    *,
    project_id: str,
    site_key: str,
    expected_action: str = "post_preset",
    threshold: float = 0.5,
) -> None:
    """Verify a reCAPTCHA Enterprise token. Raises RecaptchaFailed on any failure.

    If ``project_id`` or ``site_key`` is empty (dev mode), skip verification
    with a warning log. Production must have both set.
    """
    if not project_id or not site_key:
        logger.warning(
            "reCAPTCHA project_id or site_key not set — skipping verification (dev mode)"
        )
        return

    client = recaptchaenterprise_v1.RecaptchaEnterpriseServiceClient()

    event = recaptchaenterprise_v1.Event(
        token=token,
        site_key=site_key,
        expected_action=expected_action,
    )
    assessment = recaptchaenterprise_v1.Assessment(event=event)
    request = recaptchaenterprise_v1.CreateAssessmentRequest(
        parent=f"projects/{project_id}",
        assessment=assessment,
    )

    response = client.create_assessment(request=request)

    if not response.token_properties.valid:
        reason = response.token_properties.invalid_reason.name
        raise RecaptchaFailed(f"recaptcha token invalid: {reason}")

    if expected_action and response.token_properties.action != expected_action:
        raise RecaptchaFailed(
            f"recaptcha action mismatch: got {response.token_properties.action!r}, "
            f"expected {expected_action!r}"
        )

    score = float(response.risk_analysis.score)
    if score < threshold:
        raise RecaptchaFailed(f"recaptcha score too low: {score} < {threshold}")
