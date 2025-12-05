import asyncio
import os
import sys
import random
import json
from playwright.async_api import async_playwright
from backend.services.price_interceptor import price_interceptor
from backend.services.fill_checker import fill_checker
from backend.services.notifier import notifier

# Ensure Proactor event loop on Windows so subprocess exec works for Playwright
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

class PropwBot:
    def __init__(self, user_data_dir="user_data", headless=False):
        self.user_data_dir = user_data_dir
        self.headless = headless
        self.playwright = None
        self.browser_context = None
        self.page = None
        self.url = "https://www.propw.com/zh_TW/futures/usdt/btcusdcp"
        self.is_running = False

    async def _human_delay(self, min_ms=500, max_ms=1500):
        """Random delay to simulate human pause."""
        delay = random.randint(min_ms, max_ms) / 1000.0
        await asyncio.sleep(delay)

    async def _human_type(self, element, text):
        """Types text with random delays between keystrokes."""
        await element.click()
        # Clear existing text if any (simulating backspace)
        await element.press("Control+A")
        await asyncio.sleep(random.uniform(0.1, 0.3))
        await element.press("Backspace")
        await asyncio.sleep(random.uniform(0.1, 0.3))
        
        for char in text:
            await element.type(char, delay=random.randint(50, 150))
            # Occasional longer pause
            if random.random() < 0.1:
                await asyncio.sleep(random.uniform(0.1, 0.4))

    async def _human_click(self, element):
        """Moves mouse to element with some randomness before clicking."""
        box = await element.bounding_box()
        if box:
            # Target a random point within the element, not dead center
            target_x = box["x"] + box["width"] * random.uniform(0.2, 0.8)
            target_y = box["y"] + box["height"] * random.uniform(0.2, 0.8)
            
            # Move mouse to target
            await self.page.mouse.move(target_x, target_y, steps=random.randint(5, 15))
            await asyncio.sleep(random.uniform(0.1, 0.3))
            
            await self.page.mouse.down()
            await asyncio.sleep(random.uniform(0.05, 0.15))
            await self.page.mouse.up()
        else:
            # Fallback: force click with shorter timeout (5s instead of 30s)
            await element.click(force=True, timeout=5000)

    async def start(self):
        """Starts the browser and navigates to the trading page."""
        # Check if browser is actually alive
        if self.is_running and self.page and not self.page.is_closed():
            try:
                # Bring to front hack: focus the page
                await self.page.bring_to_front()
                return
            except Exception:
                print("Browser appears disconnected, restarting...")
                self.is_running = False

        if self.playwright:
            await self.playwright.stop()
        
        self.playwright = await async_playwright().start()
        
        if not os.path.exists(self.user_data_dir):
            os.makedirs(self.user_data_dir)

        print(f"Launching browser with stealth mode...")
        
        # 最真實的 User Agent (Windows Chrome 最新版)
        user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
        
        self.browser_context = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=self.user_data_dir,
            headless=self.headless,
            
            # 視窗設定 - 使用常見的桌面解析度
            viewport={"width": 800, "height": 600},
            screen={"width": 800, "height": 600},
            device_scale_factor=1,
            
            # User Agent
            user_agent=user_agent,
            
            # 語系設定 (台灣正體中文)
            locale="zh-TW",
            timezone_id="Asia/Taipei",
            
            # 權限
            permissions=["geolocation", "notifications"],
            geolocation={"latitude": 25.0330, "longitude": 121.5654},  # 台北
            
            # 隱藏自動化特徵的關鍵參數
            args=[
                # 視窗設定
                "--start-maximized",
                "--window-position=0,0",
                
                # === 核心反偵測 ===
                "--disable-blink-features=AutomationControlled",  # 移除 navigator.webdriver
                
                # === 效能優化 ===
                "--disable-dev-shm-usage",  # 避免共享記憶體問題
                "--disable-gpu",  # 停用 GPU (某些環境需要)
                
                # === 隱私 & 安全 ===
                "--disable-web-security",  # 停用 CORS (謹慎使用)
                "--disable-features=IsolateOrigins,site-per-process",
                
                # === 減少指紋識別 ===
                "--disable-extensions",  # 停用擴充功能
                "--disable-plugins",  # 停用插件
                "--disable-images",  # 停用圖片載入 (可選，提升速度)
                
                # === 通知 & 彈窗 ===
                "--disable-notifications",
                "--disable-popup-blocking",
                
                # === 其他 ===
                "--no-first-run",  # 跳過首次執行畫面
                "--no-default-browser-check",
                "--password-store=basic",
                "--use-mock-keychain",
                
                # === 語言 ===
                "--lang=zh-TW",
            ],
            
            # 忽略 HTTPS 錯誤 (某些網站需要)
            # 顏色方案
            color_scheme="dark",
        )
        
        self.page = self.browser_context.pages[0]
        
        # === WebSocket 攔截與價格監聽 ===
        def handle_websocket(ws):
            """處理 WebSocket 連接"""
            # 只攔截市場數據 WebSocket
            if 'ws.futurescw.com' in ws.url:
                print(f"🔌 發現市場數據 WebSocket: {ws.url}")
                
                def on_message(payload):
                    """處理 WebSocket 消息"""
                    try:
                        # 傳遞給價格攔截器
                        price_interceptor.handle_websocket_message(payload)
                    except Exception:
                        pass
                
                ws.on('framereceived', on_message)
                
        self.page.on('websocket', handle_websocket)
        
        # 將價格更新連接到成交檢測器和前端通知
        def on_price_update(price):
            # 1. 更新成交檢測器
            fill_checker.update_price(price)
            
            # 2. 通知前端
            asyncio.create_task(notifier.broadcast({
                "type": "price_update",
                "data": {"price": str(price)}
            }))
            
        price_interceptor.add_listener(on_price_update)
        print("✅ WebSocket 價格攔截器已啟動")
        
        # === JavaScript 注入 - 隱藏 WebDriver 痕跡 ===
        await self.page.add_init_script("""
            // 覆蓋 Chrome 物件
            window.chrome = {
                runtime: {}
            };
            
            // 覆蓋 Permissions API
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // 覆蓋 Plugin 陣列
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // 覆蓋 Languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-TW', 'zh', 'en-US', 'en']
            });
        """)
        
        print(f"Navigating to {self.url}...")
        await self.page.goto(self.url)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            print("Timeout waiting for networkidle, proceeding...")
            
        self.is_running = True
        print("✅ Stealth mode activated")

    async def check_login(self):
        """Checks if the user is logged in."""
        if not self.page:
            return False
        try:
            # 1. Check URL: If we are still on a login or verification page, we are NOT logged in.
            current_url = self.page.url
            if "login" in current_url or "verification" in current_url:
                return False

            # 2. Check for "Login" button text (登錄)
            # If "登錄" button is visible, we are NOT logged in.
            try:
                login_btn = await self.page.wait_for_selector("//button[.//span[text()='登錄']]", timeout=2000)
                if login_btn and await login_btn.is_visible():
                    return False
            except:
                pass
            
            # 3. (Optional) Check for positive indicator like "Deposit" (充值) or User Icon
            # For now, the absence of Login button + not on login URL is a good enough proxy
            
            # Auto-check: If logged in but not on trading page, redirect back
            # This handles the case where login success redirects to Dashboard
            if "futures" not in current_url and "propw.com" in current_url:
                print(f"Logged in but on wrong page ({current_url}). Redirecting to trading page...")
                await self.page.goto(self.url)
                await self.page.wait_for_load_state("domcontentloaded")
                
            return True
        except Exception as e:
            print(f"Error checking login status: {e}")
            return False

    async def get_current_price(self):
        """Scrapes the current price from the UI."""
        if not self.page:
            return None
        try:
            # Try to get price from the Market Buy section which usually shows the current price or similar
            # Selector: //div[contains(text(),'市價做多')]/following-sibling::div[1]
            element = await self.page.query_selector("//div[contains(text(),'市價做多')]/following-sibling::div[1]")
            if element:
                text = await element.inner_text()
                # Clean up text (remove commas, etc)
                return text.replace(",", "").strip()
            
            return None
        except Exception as e:
            print(f"Error getting price: {e}")
            return None

    async def goto_login_page(self):
        """Opens the login modal for manual entry."""
        if not self.page:
            await self.start()

        # Bring browser to front
        try:
            await self.page.bring_to_front()
        except:
            pass
            
        # Ensure we are on the trading page
        try:
            if "propw.com" not in self.page.url:
                print(f"Navigating to {self.url}")
                await self.page.goto(self.url)
                await self.page.wait_for_load_state("domcontentloaded")
        except Exception:
            pass

        # Click Login button
        print("Clicking Login button for manual entry...")
        login_selectors = [
            "//button[.//span[text()='登錄']]",
            "//button[contains(text(),'登錄')]",
            "//button[@type='button' and .//span[contains(text(),'登錄')]]",
        ]
        
        found = False
        for sel in login_selectors:
            try:
                btn = await self.page.wait_for_selector(sel, state="visible", timeout=3000)
                if btn:
                    await self._human_click(btn)
                    found = True
                    break
            except Exception:
                continue
        
        if found:
            return {"status": "SUCCESS", "message": "Login modal opened"}
        
        # If no button found, maybe already logged in?
        if await self.check_login():
             return {"status": "SUCCESS", "message": "Already logged in"}
             
        return {"status": "WARNING", "message": "Login button not found (please check browser manually)"}

    async def login(self, email: str, password: str):
        """Open login modal, submit credentials, and wait until logged in."""
        if not self.page:
            raise Exception("Bot not started")

        # If already logged in, short-circuit
        if await self.check_login():
            return {"status": "SUCCESS", "message": "Already logged in"}

        try:
            # Ensure we are on the trading page
            try:
                if self.url not in self.page.url:
                    await self.page.goto(self.url)
                    await self.page.wait_for_load_state("domcontentloaded")
            except Exception:
                pass

            # Open login modal
            login_btn = None
            login_selectors = [
                "//button[.//span[text()='登錄']]",
                "//button[contains(text(),'登錄')]",
                "//button[@type='button' and .//span[contains(text(),'登錄')]]",
            ]
            for sel in login_selectors:
                try:
                    btn = await self.page.wait_for_selector(sel, state="visible", timeout=3000)
                    if btn:
                        login_btn = btn
                        break
                except Exception:
                    continue

            if login_btn:
                try:
                    await self._human_click(login_btn)
                    await self._human_delay(300, 700)
                except Exception as click_error:
                    # 如果點擊失敗（按鈕被禁用或不存在），重新檢查登入狀態
                    print(f"Login button click failed: {click_error}")
                    print("Re-checking login status...")
                    if await self.check_login():
                        return {"status": "SUCCESS", "message": "Already logged in (button disabled)"}
                    raise click_error
            else:
                # 登入按鈕不存在，可能已經登入
                print("Login button not found, checking if already logged in...")
                if await self.check_login():
                    return {"status": "SUCCESS", "message": "Already logged in (no login button)"}
                print("Not logged in but no login button found. Looking for inputs directly...")

            # Email input
            print("Waiting for email input...")
            email_input = None
            email_selectors = [
                "//input[@placeholder='郵箱/手機號碼']",
                "//div[contains(@class, 'dialog')]//input[@type='text']",
                "//input[@type='text']",
            ]
            for sel in email_selectors:
                try:
                    candidate = await self.page.wait_for_selector(sel, timeout=3000)
                    if candidate:
                        email_input = candidate
                        break
                except Exception:
                    continue

            if not email_input:
                raise Exception("Email input not found (login modal may not be open)")

            await email_input.fill(email)

            # Password input
            pwd_input = None
            pwd_selectors = [
                "//input[@placeholder='請輸入密碼']",
                "//div[contains(@class, 'dialog')]//input[@type='password']",
                "//input[@type='password']",
            ]
            for sel in pwd_selectors:
                try:
                    candidate = await self.page.wait_for_selector(sel, timeout=3000)
                    if candidate:
                        pwd_input = candidate
                        break
                except Exception:
                    continue

            if not pwd_input:
                raise Exception("Password input not found")

            await pwd_input.fill(password)

            # Submit form
            print("Submitting login form...")
            submit_btn = None
            submit_selectors = [
                "//button[@type='submit']",
                "//div[contains(@class, 'dialog')]//button[contains(text(), '登錄')]",
                "//button[contains(text(), '登錄') or .//span[contains(text(), '登錄')]]",
            ]
            for sel in submit_selectors:
                try:
                    btn = await self.page.wait_for_selector(sel, state="visible", timeout=2000)
                    if btn:
                        submit_btn = btn
                        break
                except Exception:
                    continue

            if not submit_btn:
                raise Exception("Submit button not found")

            await submit_btn.click(force=True)
            print("Clicked submit button (forced).")

            # Wait for login to complete
            print("Waiting for login completion (Max 300s)...")
            for i in range(100):  # 100 * 3s = 300s
                if await self.check_login():
                    print("Login detected!")

                    # Ensure we are on the trading page
                    if self.url not in self.page.url:
                        print(f"Redirecting to trading page: {self.url}")
                        await self.page.goto(self.url)
                        await self.page.wait_for_load_state("networkidle")

                    return {"status": "SUCCESS", "message": "Login successful"}

                print(f"Waiting for login... ({i+1}/100)")
                await asyncio.sleep(3)

            return {"status": "FAILED", "message": "Login timed out (Check credentials or CAPTCHA)"}

        except Exception as e:
            print(f"Order error: {e}")
            # Take a screenshot for debugging
            try:
                if self.page:
                    screenshot_path = os.path.join(os.getcwd(), "order_error.png")
                    await self.page.screenshot(path=screenshot_path)
                    print(f"Screenshot saved to {screenshot_path}")
            except Exception as se:
                print(f"Failed to take screenshot: {se}")
            return {"status": "ERROR", "message": str(e)}

    async def place_order(self, side: str, amount: float, order_type: str = "MARKET", price: float = None):
        """Places a market or limit order."""
        if not self.page:
            raise Exception("Bot not started")
        
        if not await self.check_login():
             raise Exception("User not logged in. Please log in manually in the browser window.")

        print(f"Placing {order_type} {side} order for {amount} (Price: {price})...")
        
        try:
            # 1. Select Order Type Tab (Market or Limit)
            if order_type.upper() == "MARKET":
                tab_text = "市價委託"
            else:
                tab_text = "限價委託"

            tab = await self.page.wait_for_selector(f"//div[contains(text(),'{tab_text}')]", timeout=5000)
            if tab:
                await self._human_click(tab)
            else:
                raise Exception(f"{tab_text} tab not found")
            
            # Short wait for tab switch
            await self._human_delay(500, 1000)

            # 2. Define Target Button Text and Column Strategy
            # Scan results show:
            # Buy Side (Left): Input #1 (Price), Input #2 (Qty), "可做多" text
            # Sell Side (Right): Input #3 (Price), Input #4 (Qty), "可做空" text
            
            # We need to target the correct column based on side.
            # Buy = Left Column (Index 0, 1)
            # Sell = Right Column (Index 2, 3)
            
            is_buy = side.upper() == "BUY"
            
            # 3. Fill Price (Only for Limit Orders)
            # 價格輸入框：使用倒數第二個可見輸入框
            if order_type.upper() == "LIMIT":
                if not price:
                    raise Exception("Price is required for limit orders")
                
                inputs = await self.page.query_selector_all("input[type='text']")
                visible_inputs = [inp for inp in inputs if await inp.is_visible()]
                
                # Price input: 倒數第二個 (second to last)
                if len(visible_inputs) >= 2:
                    price_input = visible_inputs[-2]  # 倒數第二個
                    await self._human_type(price_input, str(price))
                    print(f"Price input filled: {price} (Index {len(visible_inputs)-2})")
                else:
                    raise Exception(f"Price input not found (可見輸入框: {len(visible_inputs)})")
                
                await self._human_delay(300, 800)

            # 4. Fill Amount
            # 數量輸入框：使用最後一個可見輸入框
            
            inputs = await self.page.query_selector_all("input[type='text']")
            visible_inputs = [inp for inp in inputs if await inp.is_visible()]
            
            # Quantity input: 最後一個 (last)
            if len(visible_inputs) >= 1:
                amount_input = visible_inputs[-1]  # 最後一個
                await self._human_type(amount_input, str(amount))
                print(f"Amount input filled: {amount} (Index {len(visible_inputs)-1})")
            else:
                raise Exception(f"Amount input not found (可見輸入框: {len(visible_inputs)})")
            
            await self._human_delay(300, 800)
            
            # 5. Click the Action Button
            # Based on super scan: Buttons shared between Market/Limit modes
            # '買入/做多' and '賣出/做空' buttons confirmed working
            
            button_text = "買入/做多" if is_buy else "賣出/做空"
            print(f"Searching for '{button_text}' button...")
            
            # Primary: exact text match
            button_selector = f"//button[contains(text(),'{button_text}')]"
            
            try:
                target_btn = await self.page.wait_for_selector(button_selector, timeout=5000)
                if target_btn and await target_btn.is_visible():
                    print(f"✅ Found '{button_text}'")
                    await self._human_click(target_btn)
                    print(f"✅ Clicked '{button_text}'")
                else:
                    raise Exception(f"Button not visible")
            except Exception as e:
                # Fallback: class-based
                print(f"Trying fallback selector...")
                fallback_class = "tw-bg-updownGreen" if is_buy else "tw-bg-updownRed"
                fallback_selector = f"//button[contains(@class, '{fallback_class}')]"
                
                target_btn = await self.page.wait_for_selector(fallback_selector, timeout=3000)
                if target_btn:
                    print(f"✅ Found via class: {fallback_class}")
                    await self._human_click(target_btn)
            await asyncio.sleep(2)  # Small pause after click to allow UI to process

            return {"status": "SUBMITTED", "message": "Order submitted via UI"}

        except Exception as e:
            print(f"Order error: {e}")
            # Take a screenshot for debugging
            try:
                if self.page:
                    screenshot_path = os.path.join(os.getcwd(), "order_error.png")
                    await self.page.screenshot(path=screenshot_path)
                    print(f"Screenshot saved to {screenshot_path}")
            except Exception as se:
                print(f"Failed to take screenshot: {se}")
            return {"status": "ERROR", "message": str(e)}

    async def close(self):
        """Properly close browser and save session."""
        print("Closing bot...")
        self.is_running = False
        
        try:
            # Close browser context (this saves cookies and session)
            if self.browser_context:
                await self.browser_context.close()
                print("Browser context closed.")
        except Exception as e:
            print(f"Error closing browser context: {e}")
        
        try:
            # Stop playwright instance
            if self.playwright:
                await self.playwright.stop()
                print("Playwright stopped.")
        except Exception as e:
            print(f"Error stopping playwright: {e}")
        
        # Small delay to ensure everything is flushed to disk
        await asyncio.sleep(0.5)
