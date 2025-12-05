# 交易策略信號與前端下單系統－開發文檔

## 一、系統目標與角色說明

- **目標**
  - 讓「後台交易策略」產生買賣信號，但不直接下單。
  - 由「前端管理頁面」的人員，基於信號做最後確認與調整，然後觸發程式自動在交易所網頁上下單（透過 Playwright/Selenium）。
- **核心角色**
  - 策略服務（例如：`propw_bot.py`）
  - 後端 API（FastAPI）
  - 下單執行器（瀏覽器自動化模組）
  - 前端管理頁（React）

---

## 二、整體架構概覽

- 資料與流程：
  - 策略 → FastAPI → DB → React 前端 → FastAPI → 下單執行器 → 交易所頁面
- 關鍵設計重點：
  - 「信號」與「訂單」資料都統一存到資料庫，可查詢與追蹤。
  - 所有實際下單都經過 FastAPI 的風控與背景任務，不由策略程式直接操作瀏覽器。
  - 前端透過 REST + WebSocket 即時看見信號與訂單狀態。

---

## 三、系統元件與職責

### 1. 策略服務（Strategy Service）

- 範例：現在的 `propw_bot.py`。
- **職責**
  - 接收行情（交易所 WebSocket / 第三方行情源）。
  - 根據策略規則產生「買 / 賣」信號。
  - 透過 HTTP 呼叫 FastAPI 的 `/api/signals` 新增信號。
- **不負責**
  - 不直接呼叫瀏覽器，不自行下單。
  - 不與前端直接互動。

### 2. 後端 API（FastAPI）

- **職責**
  - 對外提供 REST API：`/api/signals`、`/api/orders` 等。
  - 管理信號與訂單的狀態流轉。
  - 提供 WebSocket 推播信號、訂單狀態給前端。
  - 呼叫「下單執行器」模組進行實體下單。
  - 實作基礎風控（單筆限制、日總額限制等）。
- **不負責**
  - 不直接實作策略，不直接讀行情。

### 3. 下單執行器（Order Executor）

- 技術：優先 Playwright（Python），也可 Selenium。
- **職責**
  - 維持一個長駐的登入瀏覽器實例（已登入交易所）。
  - 收到 FastAPI 下單要求後，在既有頁面上：
    - 切到指定交易對頁面。
    - 填寫價格、數量、選擇買/賣。
    - 點擊送出與確認，等待前端回應。
  - 回報執行結果（成功 / 失敗 / 錯誤訊息）給 FastAPI。
- **不負責**
  - 不自行做策略判斷。
  - 不直接對外提供 API（由 FastAPI 呼叫）。

### 4. 前端管理頁（React）

- **職責**
  - 顯示「信號列表」與詳細內容。
  - 提供「下單表單」讓使用者調整價格 / 數量，按下確認。
  - 顯示所有訂單的狀態與歷史紀錄。
  - 透過 WebSocket 接收即時信號與訂單狀態更新。
- **不負責**
  - 不實作策略、不直接操作瀏覽器。

---

## 四、資料模型設計

### 1. `Signal`（策略信號）

- 主要欄位：
  - `id`：主鍵
  - `symbol`：交易對（如 `BTC/USDT`）
  - `side`：`BUY` / `SELL`
  - `suggest_price`：策略建議價（可為 `null` 代表市價）
  - `suggest_qty`：策略建議數量
  - `strategy_name`：策略名稱（如 `mean_reversion_v1`）
  - `reason`：文字描述原因
  - `status`：`PENDING` / `ACCEPTED` / `REJECTED` / `EXECUTED` / `CANCELED`
  - `created_at`、`updated_at`
- 關係：
  - 一個 `signal` 可以對應 0 ~ 多個 `orders`。

### 2. `Order`（下單紀錄）

- 主要欄位：
  - `id`：主鍵
  - `signal_id`：對應的信號
  - `symbol`、`side`、`price`、`qty`
  - `order_type`：`MARKET` / `LIMIT` …
  - `status`：`SUBMITTING` / `SUCCESS` / `FAILED` / `CANCELED`
  - `exchange_order_id`：交易所回傳的訂單 ID（如有）
  - `error_message`：失敗原因（如有）
  - `created_at`、`updated_at`

---

## 五、後端（FastAPI）設計

### 1. 技術選型

- 主體：FastAPI + Uvicorn
- ORM：SQLAlchemy 或 Tortoise ORM
- DB：PostgreSQL / MySQL / SQLite（開發環境可用 SQLite）

### 2. 建議目錄結構（後端）

```text
backend/
  main.py              # FastAPI app、路由註冊
  database.py          # 資料庫連線與 session 管理
  models.py            # SQLAlchemy models（Signal、Order）
  schemas.py           # Pydantic schemas（Request/Response）
  routes/
    signals.py         # 信號相關 API
    orders.py          # 訂單相關 API
  services/
    order_executor.py  # 下單執行器介面
    risk_control.py    # 風控邏輯
  ws/
    signals_ws.py      # 信號 WebSocket
    orders_ws.py       # 訂單 WebSocket
  config.py            # 環境變數與設定
```

### 3. REST API 設計

#### `POST /api/signals`

- 用途：策略服務新增信號。
- Request Body（主要欄位）：
  - `symbol`, `side`, `suggest_price`, `suggest_qty`, `strategy_name`, `reason`
- Response：新增後的 `signal` 資料。
- 行為：
  - 建立 `Signal`（狀態 `PENDING`）。
  - 通知 WebSocket `/ws/signals` 有新信號。

#### `GET /api/signals`

- 用途：查詢信號列表。
- 查詢條件：
  - `status`、`symbol`、時間範圍等。
- 回傳：信號列表（支援分頁）。

#### `POST /api/orders`

- 用途：前端在信號上「確認下單」。
- Request Body（主要欄位）：
  - `signal_id`, `price`, `qty`, `order_type`, `side`
- 主要流程：
  - 讀取對應 `Signal`。
  - 風控檢查（單筆大小、日限額等）。
  - 建立 `Order`（狀態 `SUBMITTING`）。
  - 使用 `BackgroundTasks` 或佇列（Celery/RQ）呼叫 `order_executor.place_order`。
- Response：建立後的 `order` 資料（非同步執行）。

#### `GET /api/orders`

- 用途：查詢訂單列表。
- 查詢條件：
  - `signal_id`、`status`、`symbol` 等。
- 回傳：訂單列表。

### 4. WebSocket 設計

#### `GET /ws/signals`

- 功能：
  - 當有新信號或信號狀態改變時推播事件。
- 事件格式（示意）：
  - `{"type": "signal_created", "data": { ...signal... }}`
  - `{"type": "signal_updated", "data": { ...signal... }}`

#### `GET /ws/orders`

- 功能：
  - 當訂單狀態改變時推播事件。
- 事件格式（示意）：
  - `{"type": "order_updated", "data": { ...order... }}`

### 5. 風控與錯誤處理

- 每次 `POST /api/orders`：
  - 檢查：
    - `qty` 是否超過單筆上限。
    - 該 `symbol` 今日累計下單量是否超過上限。
    - 狀態為 `PENDING` 或 `ACCEPTED` 的 `Signal` 才能下單。
- 下單執行器回傳結果後：
  - 若成功：`order.status = SUCCESS`，`signal.status = EXECUTED`。
  - 若失敗：`order.status = FAILED`，紀錄 `error_message`，必要時把 `signal.status` 設為 `REJECTED` 或保留 `PENDING`。

---

## 六、下單執行器設計（Playwright 推薦）

### 1. 目標

- 封裝成一個乾淨的 Python 模組，對外提供簡單介面，例如：

```python
async def place_order(symbol: str, side: str, price: float, qty: float) -> OrderResult:
    ...
```

### 2. 實作重點

- **啟動階段**
  - 啟動 Playwright browser（headless 或 visible）。
  - 登入交易所帳戶，處理 2FA / CAPTCHA（通常需要人工協助一次）。
  - 將登入後的 context 保留在記憶體中，供所有下單共用。
- **下單流程**
  - 開啟或切換到對應 `symbol` 的交易頁。
  - 確保頁面載入完成、交易表單元素存在。
  - 填入 `price`、`qty`，設定 `side`。
  - 點擊送出按鈕，等待回應（成功 / 錯誤提示）。
  - 收集結果訊息返回 `OrderResult`。
- **穩定性考量**
  - 對每個操作加上適當 timeout 與重試策略。
  - 如果發現登入失效，嘗試重新登入（需要額外設計）。
  - 錯誤要明確回報：元素找不到、驗證碼擋住、網路錯誤等。

---

## 七、前端（React）設計

### 1. 技術選型

- React + TypeScript（建議）
- 建構工具：Vite 或 Create React App
- UI 庫：Ant Design / MUI / Chakra UI 擇一
- 狀態管理：React Query + Context（或 Redux Toolkit）

### 2. 建議目錄結構（前端）

```text
frontend/
  src/App.tsx                 # 路由與全局布局
  src/pages/SignalsPage.tsx   # 信號列表與詳情
  src/pages/OrdersPage.tsx    # 訂單歷史 / 目前狀態
  src/components/SignalTable.tsx
  src/components/OrderFormModal.tsx
  src/api/client.ts           # 封裝 REST API 呼叫
  src/hooks/useSignalsWS.ts   # 信號 WebSocket hook
  src/hooks/useOrdersWS.ts    # 訂單 WebSocket hook
```

### 3. 頁面與功能

#### `SignalsPage`

- 顯示 `PENDING` / `ACCEPTED` 信號列表（表格）。
- 每筆信號顯示：
  - 時間、symbol、side、建議價/量、策略名稱、原因、狀態。
- 操作：
  - 「查看詳情」
  - 「接受」：將 `signal.status` 改為 `ACCEPTED`（可加 `PATCH /api/signals/{id}`）。
  - 「下單」：打開 `OrderFormModal`。

#### `OrderFormModal`

- 欄位：
  - `price`（預設 `suggest_price`）
  - `qty`（預設 `suggest_qty`）
  - `order_type`（市價 / 限價）
- 顯示預估成本與風險提示。
- 按下「確認下單」→ 呼叫 `POST /api/orders`。
- 若成功建立訂單，就更新 UI（可重導到 OrdersPage 或在當前頁顯示狀態）。

#### `OrdersPage`

- 顯示所有訂單：
  - 時間、對應信號 ID、symbol、side、price、qty、status、error_message。
- 支援按日期、symbol、status 篩選。

### 4. 即時更新設計

- 在 `App` 初始化時：
  - 啟動 `useSignalsWS`，將新信號 push 到全局 state。
  - 啟動 `useOrdersWS`，對訂單狀態進行即時更新。
- 搭配 React Query 的 `invalidateQueries`，於 WebSocket 事件時同步更新列表。

---

## 八、策略服務（`propw_bot.py`）整合方式

### 1. 配置

- 在 `propw_bot.py` 中透過環境變數或設定檔設定：
  - `API_BASE_URL`（如 `http://localhost:8000`）
  - `API_KEY`（若有權限驗證）

### 2. 發送信號流程

- 當策略觸發信號時：
  - 建構 JSON：
    - `symbol`, `side`, `suggest_price`, `suggest_qty`, `strategy_name`, `reason`
  - 發送 `POST {API_BASE_URL}/api/signals`。
  - 根據回傳結果記錄信號 ID（可選，方便對應）。

### 3. 錯誤處理

- 若 API 無法連線或回傳錯誤：
  - 記錄到本地 log。
  - 視情況選擇是否重試 / 放棄。

---

## 九、安全與權限設計

### 1. 認證 / 授權

- 對外 API（給策略用的 `/api/signals`）：
  - 使用簡單 API Key，放在 Header：`X-API-KEY: <key>`。
  - FastAPI Middleware 驗證 Key 是否正確。
- 管理後台前端：
  - JWT / Session-based 登入。
  - 至少要有「管理員」帳號，控制誰能下單。

### 2. 敏感資訊管理

- 交易所帳號、密碼、2FA 秘鑰不得寫死在程式碼。
- 透過 `.env` 或系統環境變數載入。
- 下單執行器若需手動輸入 2FA，可設計為啟動時人工輸入，後續保留 session。

### 3. 日誌與稽核

- 所有 `signals` 與 `orders` 的變更都記錄：誰操作、何時、原值與新值。
- 針對失敗下單與風控拒絕，記錄詳細原因，方便事後分析。

---

## 十、部署與環境規劃

### 1. 環境區分

- `dev`：開發機，本地環境，使用測試交易所或沙盒帳戶。
- `staging`：接近正式環境，用於整合測試。
- `prod`：正式環境，連正式交易所，只允許受信任使用者操作。

### 2. 部署建議

- 後端：
  - 使用 Docker 部署：一個容器跑 FastAPI，一個容器跑 DB。
  - 下單執行器可與 FastAPI 同機，以便控制本機瀏覽器。
- 前端：
  - 編譯成靜態檔案，部署到 Nginx 或 CDN。
- 運行：
  - 使用 systemd / docker-compose / k8s，確保服務自動重啟與監控。

### 3. 監控與告警

- 監控指標：
  - 下單成功率、平均下單耗時。
  - API 錯誤率、WebSocket 連線狀態。
- 重要錯誤（如下單失敗）透過 Email / Telegram / Slack 通知。

---

## 十一、開發優先順序建議

1. 建立後端 FastAPI 的基本骨架與資料表（Signal、Order）。
2. 實作 `POST /api/signals` 與 `GET /api/signals`，用 Postman 驗證。
3. 實作 React 前端的 `SignalsPage`，先用假資料，再接 API。
4. 實作 `POST /api/orders` + 簡單的「假下單執行器」（只睡幾秒後回成功）。
5. 實作 `OrdersPage` 與 WebSocket 即時更新。
6. 最後接入真實 Playwright 下單邏輯，並在測試環境充分驗證。

