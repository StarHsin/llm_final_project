from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types


MODEL_FALLBACK_ORDER = (
    "gemini-3.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
)
SUPPORTED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}
IMAGE_MIME_TYPE_BY_SUFFIX = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
}
DEFAULT_IMAGE_PROMPT = "請用繁體中文描述並分析這張圖片。"


class GeminiConfigurationError(RuntimeError):
    """Raised when Gemini cannot be configured from the local environment."""


class GeminiGenerationError(RuntimeError):
    """Raised when every Gemini model in the fallback chain fails."""


class GeminiInputError(ValueError):
    """Raised when prompt or image input is invalid."""


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


def _generate_with_fallback(contents: object) -> GeminiResult:
    client = genai.Client(api_key=_load_api_key())
    failures: list[str] = []

    for model in MODEL_FALLBACK_ORDER:
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
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


def _validate_prompt(prompt: str) -> str:
    prompt = prompt.strip()
    if not prompt:
        raise GeminiInputError("prompt must not be empty")

    return prompt


def _resolve_image_mime_type(image_path: Path) -> str:
    mime_type = mimetypes.guess_type(image_path.name)[0]
    if not mime_type:
        mime_type = IMAGE_MIME_TYPE_BY_SUFFIX.get(image_path.suffix.lower())

    if mime_type not in SUPPORTED_IMAGE_MIME_TYPES:
        supported_formats = ", ".join(
            sorted(suffix.lstrip(".").upper() for suffix in IMAGE_MIME_TYPE_BY_SUFFIX)
        )
        raise GeminiInputError(
            f"Unsupported image format. Supported formats: {supported_formats}."
        )

    return mime_type


def _load_image_part(image_path: str | Path) -> types.Part:
    path = Path(image_path).expanduser()
    if not path.exists():
        raise GeminiInputError(f"Image file does not exist: {path}")
    if not path.is_file():
        raise GeminiInputError(f"Image path is not a file: {path}")

    mime_type = _resolve_image_mime_type(path)
    return types.Part.from_bytes(data=path.read_bytes(), mime_type=mime_type)


def generate_text(prompt: str) -> GeminiResult:
    return _generate_with_fallback(_validate_prompt(prompt))


def analyze_image(image_path: str | Path, prompt: str) -> GeminiResult:
    prompt = _validate_prompt(prompt)
    image_part = _load_image_part(image_path)
    return _generate_with_fallback([image_part, prompt])


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate text or analyze an image with Gemini model fallback."
    )
    parser.add_argument(
        "prompt",
        nargs="*",
        help="Prompt text. In image mode, defaults to a Traditional Chinese image analysis prompt.",
    )
    parser.add_argument(
        "--image",
        "-i",
        help="Path to a local image file to analyze. Supports JPEG, PNG, WEBP, HEIC, and HEIF.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    prompt = " ".join(args.prompt).strip()
    if args.image and not prompt:
        prompt = DEFAULT_IMAGE_PROMPT
    elif not prompt:
        prompt = "Explain Gemini model fallback in one sentence."

    try:
        if args.image:
            result = analyze_image(args.image, prompt)
        else:
            result = generate_text(prompt)
    except (
        GeminiConfigurationError,
        GeminiGenerationError,
        GeminiInputError,
    ) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print(f"Model: {result.model}")
    print(result.text)


if __name__ == "__main__":
    main()
