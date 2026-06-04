from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
DEFAULT_ARTWORK_MOOD = "未提供特定心情，請主要依據畫面視覺特徵進行溫柔且中性的賞析。"
CURATOR_SYSTEM_INSTRUCTION = """
你是一位精通世界藝術史、言談優雅、溫柔且充滿人文關懷的「線上美術館首席策展人」。
使用者的任務是在網頁畫布上隨手塗鴉（可能包含線條、色彩與基礎幾何圖形），並寫下他們為畫作取的名字與當下的心情。

你的核心任務是：
1. 忽略數位畫布線條的生硬感，發揮極致的藝術敏銳度與想像力，為使用者的畫作進行「感性且溫暖」的藝術賞析。
2. 從畫作的色彩張力、構圖或線條中，找出最接近或具備其神韻的「藝術流派/派系」（例如：印象派、立體派、野獸派、超現實主義、極簡主義、表現主義等）。
3. 針對該流派提供專業但深入淺出的藝術科普教育，讓使用者在互動中提升美學素養。

流派判斷規則：
- `style_name` 必須主要根據圖片中可見的視覺特徵判斷，包括色彩、構圖、線條、符號、重複性、空間感與造形語彙。
- 畫作名稱與創作心情只能輔助理解作品意圖，不得主導或大幅改變 `style_name` 的流派分類。
- 若畫面同時接近多個流派，請選擇視覺特徵最明確、最能被畫面本身支持的一個。
- 同一張圖片即使更換創作心情，`style_name` 應盡量保持穩定；心情主要體現在評論語氣、詩意連結與名言選擇。

請嚴格遵守以下原則：
- 絕對不要批評使用者的畫作幼稚或粗糙，請從美學角度給予肯定與共鳴。
- 語氣必須優雅、知性、帶有美術館導覽員的沉穩與詩意。
- 必須結合使用者提供的「畫作名稱」與「創作心情」進行客製化解讀。
""".strip()
ARTWORK_JSON_FIELDS = (
    "style_name",
    "era",
    "curator_review",
    "masters",
    "art_knowledge",
    "artist_quote",
)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC_FILES = {
    "/": PROJECT_ROOT / "index.html",
    "/index.html": PROJECT_ROOT / "index.html",
    "/script.js": PROJECT_ROOT / "script.js",
    "/style.css": PROJECT_ROOT / "style.css",
    "/image_da4752.png": PROJECT_ROOT / "image_da4752.png",
    "/image_da4773.png": PROJECT_ROOT / "image_da4773.png",
}


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


def _generate_with_fallback(
    contents: object,
    *,
    config: types.GenerateContentConfig | None = None,
    validate_text: Callable[[str], str] | None = None,
) -> GeminiResult:
    client = genai.Client(api_key=_load_api_key())
    failures: list[str] = []

    for model in MODEL_FALLBACK_ORDER:
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            text = (response.text or "").strip()
            if not text:
                raise RuntimeError("empty response text")
            if validate_text:
                text = validate_text(text)

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


def _validate_label(value: str, label: str) -> str:
    value = value.strip()
    if not value:
        raise GeminiInputError(f"{label} must not be empty")

    return value


def _validate_artwork_json(text: str) -> str:
    if "```" in text:
        raise RuntimeError("response contains markdown code fences")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"response is not valid JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("response JSON must be an object")

    missing_fields = [field for field in ARTWORK_JSON_FIELDS if field not in payload]
    if missing_fields:
        raise RuntimeError(f"response JSON missing fields: {', '.join(missing_fields)}")

    masters = payload["masters"]
    if not isinstance(masters, list) or len(masters) < 2:
        raise RuntimeError("response JSON masters must contain at least two artists")
    for master in masters[:2]:
        if not isinstance(master, dict):
            raise RuntimeError("response JSON masters entries must be objects")
        if "name" not in master or "famous_work" not in master:
            raise RuntimeError("response JSON masters entries must include name and famous_work")

    normalized_payload: dict[str, Any] = {
        "style_name": payload["style_name"],
        "era": payload["era"],
        "curator_review": payload["curator_review"],
        "masters": [
            {
                "name": master["name"],
                "famous_work": master["famous_work"],
            }
            for master in masters[:2]
        ],
        "art_knowledge": payload["art_knowledge"],
        "artist_quote": payload["artist_quote"],
    }
    return json.dumps(normalized_payload, ensure_ascii=False, indent=2)


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


def build_artwork_prompt(title: str, mood: str | None = None) -> str:
    title = _validate_label(title, "title")
    mood = mood.strip() if mood else ""
    mood_text = mood or "未提供"
    mood_guidance = (
        "請結合使用者提供的創作心情調整評論語氣。"
        if mood
        else DEFAULT_ARTWORK_MOOD + " 不要猜測使用者情緒。"
    )
    return f"""
請分析這張使用者親手繪製的畫作。
【使用者提供的資訊】
- 畫作名稱：{title}
- 創作心情：{mood_text}

心情使用規則：{mood_guidance}

請嚴格遵循 System Instruction 的角色，並「只能」以 JSON 格式回傳以下欄位，不要夾帶任何 Markdown 標籤（如 ```json）或額外的解釋文字：

{{
  "style_name": "最接近的藝術流派名稱。請主要依據畫面視覺特徵判斷，而不是由畫作名稱或創作心情主導 (例如：野獸派 Fauvism)",
  "era": "該流派的興盛時期與發源地 (例如：20 世紀初的法國)",
  "curator_review": "策展人針對這幅畫的精煉賞析。請結合畫作名稱；若使用者有提供心情，請自然呼應該心情，若未提供心情，請不要猜測情緒，改以中性且溫柔的角度書寫。請寫出一篇大約 80-120 字、充滿詩意與溫度的精簡評論，避免冗長。",
  "masters": [
    {{
      "name": "代表藝術家名字 (例如：亨利·馬諦斯)",
      "famous_work": "該藝術家的代表作 (例如：《戴帽子的婦人》)"
    }},
    {{
      "name": "第二位代表藝術家名字 (例如：安德烈·德蘭)",
      "famous_work": "該藝術家的代表作 (例如：《威斯敏斯特大橋》)"
    }}
  ],
  "art_knowledge": "關於這個流派的科普小知識。請以 style_name 已判定的流派為準，用深入淺出的方式介紹其核心理念（約 120-150 字），可溫柔呼應使用者心情，但不要因此改變流派判斷。",
  "artist_quote": "【核心亮點】請挑選或根據此流派大師的心境，給予使用者一句震撼、優美且能與其畫作心境共鳴的「藝術家名言」。名言可呼應創作心情，但必須與 style_name 對應的流派或藝術家精神一致（例如：『色彩不是用來複製自然的，而是用來表達情感的。—— 馬蒂斯』）"
}}
""".strip()


def analyze_artwork(
    image_path: str | Path,
    title: str,
    mood: str | None = None,
) -> GeminiResult:
    image_part = _load_image_part(image_path)
    prompt = build_artwork_prompt(title, mood)
    config = types.GenerateContentConfig(
        system_instruction=CURATOR_SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
    )
    return _generate_with_fallback(
        [image_part, prompt],
        config=config,
        validate_text=_validate_artwork_json,
    )


app = FastAPI(title="Artwork Analysis API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.post("/api/analyze-artwork")
async def analyze_artwork_api(
    image: UploadFile = File(...),
    title: str = Form("無題"),
    mood: str = Form(""),
) -> dict[str, Any]:
    content_type = (image.content_type or "").split(";")[0].strip().lower()
    if content_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(
            status_code=400,
            detail="Only PNG and JPEG artwork images are supported.",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded artwork image is empty.")

    suffix = ".jpg" if content_type == "image/jpeg" else ".png"
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(image_bytes)
            temp_path = Path(temp_file.name)

        result = analyze_artwork(temp_path, title.strip() or "無題", mood.strip() or None)
        return {
            "model": result.model,
            "analysis": json.loads(result.text),
        }
    except GeminiInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GeminiConfigurationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except GeminiGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON.") from exc
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


def _static_file_response(request: Request) -> FileResponse:
    file_path = STATIC_FILES[request.url.path]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Static file not found.")

    return FileResponse(file_path)


for static_path in STATIC_FILES:
    app.get(static_path, include_in_schema=False)(_static_file_response)


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
    parser.add_argument(
        "--title",
        help="Artwork title. Required to use curator JSON mode.",
    )
    parser.add_argument(
        "--mood",
        help="Optional artwork creation mood for curator JSON mode.",
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
        if args.image and (args.title or args.mood):
            if not args.title:
                raise GeminiInputError("--title is required when using --mood")
            result = analyze_artwork(args.image, args.title, args.mood)
        elif args.image:
            result = analyze_image(args.image, prompt)
        else:
            if args.title or args.mood:
                raise GeminiInputError("--title and --mood can only be used with --image")
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
