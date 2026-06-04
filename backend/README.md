# Backend Gemini Integration

## 功能摘要

本後端目前已串接 Google Gemini API，使用官方 Python SDK `google-genai` 呼叫文字生成模型與圖片理解模型。主要入口是 `main.py` 內的 `generate_text(prompt: str)`、`analyze_image(image_path, prompt)` 與 `analyze_artwork(image_path, title, mood)`，可在 CLI 測試，也可被其他 Python 程式重用。

目前主模型使用 `gemini-3.5-flash`，並加入模型備援機制，讓主要模型發生 API 錯誤、模型不可用、rate limit 或暫時性服務問題時，可以自動改試下一個模型。圖片分析使用 Gemini 的 image understanding 能力，將本機圖片 bytes 以 inline data 傳入模型。畫作賞析模式會套用「線上美術館首席策展人」角色，並要求模型輸出固定 JSON。

## 使用套件

此專案在 `pyproject.toml` 中加入以下依賴：

```toml
dependencies = [
    "google-genai",
    "python-dotenv",
]
```

- `google-genai`：Google 官方 Gemini API Python SDK。
- `python-dotenv`：讀取本機 `.env` 環境變數設定。

## 模型備援策略

模型會依照以下順序嘗試：

1. `gemini-3.5-flash`
2. `gemini-2.5-pro`
3. `gemini-2.5-flash`

只要其中一個模型成功回覆，就會回傳該模型的結果，並記錄實際使用的模型名稱。如果三個模型都失敗，程式會丟出 `GeminiGenerationError`，錯誤訊息中會列出每個模型的失敗原因。

## 環境設定

在 `backend/.env` 中設定 Gemini API key：

```env
GEMINI_API_KEY=your_api_key_here
```

實際使用時請將 `your_api_key_here` 換成自己的 API key。

注意：`.env` 已經被 `.gitignore` 忽略，不應提交到 git，以避免 API key 外洩。

## 執行方式

在 `backend` 目錄下執行 CLI smoke test：

```powershell
uv run main.py
```

也可以直接傳入 prompt：

```powershell
uv run main.py "請用一句話解釋 Gemini fallback"
```

成功時會看到類似輸出：

```text
Model: gemini-3.5-flash
Gemini model fallback is an automated reliability feature that switches an application's request to a backup AI model if the primary Gemini model encounters an error, rate limit, or service outage.
```

上方的 `Model` 代表實際成功回覆的模型。如果顯示 `gemini-3.5-flash`，表示第一順位模型成功，沒有啟動備援。

## 圖片分析

可以使用 `--image` 或 `-i` 傳入本機圖片路徑：

```powershell
uv run main.py --image ./sample.jpg "請描述並分析這張圖片"
```

若圖片模式沒有提供 prompt，會使用預設問題：

```powershell
uv run main.py --image ./sample.jpg
```

預設 prompt 為：「請用繁體中文描述並分析這張圖片。」

支援圖片格式：

- JPEG / JPG
- PNG
- WEBP
- HEIC
- HEIF

成功時會看到類似輸出：

```text
Model: gemini-3.5-flash
這張圖片中可以看到......整體來看......
```

第一版圖片分析採用一般問答模式，使用者可以自行決定 prompt，例如描述圖片、辨識畫面內容、摘要重點、分析圖表或詢問圖片中的細節。

## 策展人畫作賞析模式

若圖片是使用者在前端畫布上親手繪製的作品，可以使用策展人模式。此模式會結合圖片、畫作名稱與創作心情，讓 Gemini 以「線上美術館首席策展人」角色進行溫柔且具藝術史脈絡的賞析。

流派判斷採「視覺分類優先，心情詮釋輔助」原則：`style_name` 主要根據圖片中可見的色彩、構圖、線條、符號、重複性、空間感與造形語彙判斷；`title` 與 `mood` 主要影響 `curator_review`、`art_knowledge` 與 `artist_quote` 的語氣和共鳴。因此同一張圖片即使更換心情，流派應盡量保持穩定，但評論的詩意角度會有所不同。

CLI 範例：

```powershell
uv run main.py --image ./test_1.jpg --title "午後的心跳"
```

也可以提供創作心情，讓評論語氣更貼近使用者狀態：

```powershell
uv run main.py --image ./test_1.jpg --title "午後的心跳" --mood "有點期待又有點迷惘"
```

前端未來應提供以下欄位：

- `image`：使用者畫布匯出的圖片檔。
- `title`：使用者為畫作取的名稱，必填。
- `mood`：使用者創作當下的心情，選填。

有 `--image` 且提供 `--title` 時，程式會走策展人 JSON 模式。`--mood` 可省略；若省略，後端會要求模型不要猜測使用者情緒，改以畫面視覺特徵與畫作名稱做中性且溫柔的賞析。若只提供 `--mood` 但沒有 `--title`，會顯示錯誤並停止。

回傳 JSON 格式固定如下，不會包含 Markdown code fence：

```json
{
  "style_name": "野獸派 Fauvism",
  "era": "20 世紀初的法國",
  "curator_review": "策展人針對這幅畫的精煉賞析。",
  "masters": [
    {
      "name": "亨利·馬諦斯",
      "famous_work": "《戴帽子的婦人》"
    },
    {
      "name": "安德烈·德蘭",
      "famous_work": "《威斯敏斯特大橋》"
    }
  ],
  "art_knowledge": "關於此流派的深入淺出介紹。",
  "artist_quote": "一句能與畫作心境共鳴的藝術家名言。"
}
```

後端會檢查模型回傳是否為合法 JSON，且是否包含所有必要欄位。如果模型回傳格式錯誤，該模型會被視為失敗，並自動進入下一個 fallback 模型。

## 程式介面

其他 Python 程式可以重用 `generate_text()`：

```python
from main import generate_text

result = generate_text("請用一句話解釋 Gemini fallback")

print(result.model)
print(result.text)
```

回傳物件是 `GeminiResult`，包含：

- `text`：Gemini 回覆文字。
- `model`：實際成功使用的模型名稱。

圖片分析可以重用 `analyze_image()`：

```python
from main import analyze_image

result = analyze_image("./sample.jpg", "請用繁體中文分析這張圖片")

print(result.model)
print(result.text)
```

策展人畫作賞析可以重用 `analyze_artwork()`：

```python
from main import analyze_artwork

result = analyze_artwork("./sample.jpg", "午後的心跳")

print(result.model)
print(result.text)
```

也可以傳入選填的心情：

```python
result = analyze_artwork("./sample.jpg", "午後的心跳", "有點期待又有點迷惘")
```

`result.text` 會是已驗證過的 JSON 字串，適合前端再用 `JSON.parse()` 轉成物件顯示。

## 錯誤處理

目前處理以下錯誤情境：

- 缺少 `GEMINI_API_KEY` 或仍使用占位值時，丟出 `GeminiConfigurationError`。
- prompt 為空字串時，丟出 `GeminiInputError`。
- 策展人模式缺少 `title` 時，丟出 `GeminiInputError`。
- 圖片不存在、路徑不是檔案、或圖片格式不支援時，丟出 `GeminiInputError`。
- 策展人模式若模型回傳不是合法 JSON，會視為該模型失敗並進入 fallback。
- 所有模型都呼叫失敗時，丟出 `GeminiGenerationError`，並列出各模型失敗原因。

CLI 模式下會將錯誤印到 stderr，並以 exit code `1` 結束。

## 報告可用重點

- 本次後端新增 Gemini API 串接能力，使用官方 `google-genai` SDK 完成文字生成。
- 系統採用 `gemini-3.5-flash` 作為主要模型，兼顧速度與成本。
- 為提升穩定性，實作模型 fallback 機制，當主模型失敗時會依序改用 `gemini-2.5-pro` 與 `gemini-2.5-flash`。
- API key 透過 `.env` 管理，避免將敏感資訊寫死在程式碼中。
- `generate_text()`、`analyze_image()` 與 `analyze_artwork()` 被設計成可重用函式，未來可直接接到 FastAPI endpoint、前端服務或其他後端流程。
- 圖片分析功能支援本機圖片路徑輸入，透過 `types.Part.from_bytes()` 將圖片資料傳給 Gemini 進行理解與問答。
- 策展人畫作賞析模式會以畫面視覺特徵穩定判斷藝術流派，並結合使用者的畫作名稱與創作心情輸出時代背景、策展評論、代表藝術家、流派知識與藝術家名言。
- JSON 輸出經後端驗證，能降低模型夾帶 Markdown 或漏欄位造成前端解析失敗的風險。
- CLI smoke test 可快速驗證 Gemini API key、SDK 依賴與模型回覆是否正常。
