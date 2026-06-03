from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from google import genai


MODEL_FALLBACK_ORDER = (
    "gemini-3.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
)


class GeminiConfigurationError(RuntimeError):
    """Raised when Gemini cannot be configured from the local environment."""


class GeminiGenerationError(RuntimeError):
    """Raised when every Gemini model in the fallback chain fails."""


@dataclass(frozen=True)
class GeminiResult:
    text: str
    model: str


def _load_api_key() -> str:
    load_dotenv(Path(__file__).with_name(".env"))
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if not api_key or api_key == "your_api_key_here":
        raise GeminiConfigurationError(
            "Missing GEMINI_API_KEY. Set it in backend/.env or your shell environment."
        )

    return api_key


def generate_text(prompt: str) -> GeminiResult:
    if not prompt.strip():
        raise ValueError("prompt must not be empty")

    client = genai.Client(api_key=_load_api_key())
    failures: list[str] = []

    for model in MODEL_FALLBACK_ORDER:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
            )
            text = (response.text or "").strip()
            if not text:
                raise RuntimeError("empty response text")

            return GeminiResult(text=text, model=model)
        except Exception as exc:
            failures.append(f"{model}: {exc}")

    failure_details = "\n".join(f"- {failure}" for failure in failures)
    raise GeminiGenerationError(
        "All Gemini models failed.\n"
        f"{failure_details}"
    )


def main() -> None:
    prompt = " ".join(sys.argv[1:]).strip() or "Explain Gemini model fallback in one sentence."

    try:
        result = generate_text(prompt)
    except (GeminiConfigurationError, GeminiGenerationError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print(f"Model: {result.model}")
    print(result.text)


if __name__ == "__main__":
    main()
