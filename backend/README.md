# Backend Gemini Integration

## 功能摘要

本後端目前已串接 Google Gemini API，使用官方 Python SDK `google-genai` 呼叫文字生成模型。主要入口是 `main.py` 內的 `generate_text(prompt: str)`，可在 CLI 測試，也可被其他 Python 程式重用。

目前主模型使用 `gemini-3.5-flash`，並加入模型備援機制，讓主要模型發生 API 錯誤、模型不可用、rate limit 或暫時性服務問題時，可以自動改試下一個模型。

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

## 錯誤處理

目前處理以下錯誤情境：

- 缺少 `GEMINI_API_KEY` 或仍使用占位值時，丟出 `GeminiConfigurationError`。
- prompt 為空字串時，丟出 `ValueError`。
- 所有模型都呼叫失敗時，丟出 `GeminiGenerationError`，並列出各模型失敗原因。

CLI 模式下會將錯誤印到 stderr，並以 exit code `1` 結束。

## 報告可用重點

- 本次後端新增 Gemini API 串接能力，使用官方 `google-genai` SDK 完成文字生成。
- 系統採用 `gemini-3.5-flash` 作為主要模型，兼顧速度與成本。
- 為提升穩定性，實作模型 fallback 機制，當主模型失敗時會依序改用 `gemini-2.5-pro` 與 `gemini-2.5-flash`。
- API key 透過 `.env` 管理，避免將敏感資訊寫死在程式碼中。
- `generate_text()` 被設計成可重用函式，未來可直接接到 FastAPI endpoint、前端服務或其他後端流程。
- CLI smoke test 可快速驗證 Gemini API key、SDK 依賴與模型回覆是否正常。
