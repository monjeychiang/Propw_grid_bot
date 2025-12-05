export default function DocsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-text-primary">使用說明</h1>
                <p className="text-text-secondary mt-1 text-sm">
                    這裡簡單說明 Propw BOT 的網格策略原理、畫面指標，以及常見問題。
                </p>
            </div>

            <section className="glass-panel rounded-lg p-6 space-y-3">
                <h2 className="text-lg font-semibold text-text-primary">1）什麼是網格策略？</h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                    網格策略會在一個價格區間內，按照固定間距自動掛出多筆買單與賣單。
                    價格在區間內震盪時，系統會在低價買入、高價賣出，賺取來回波動的差價。
                </p>
                <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                    <li>「價格區間」：你設定的下限價格與上限價格。</li>
                    <li>「網格數量」：區間會被切成幾格，格數越多，掛單越密。</li>
                    <li>「每格投入金額」：每一筆掛單預計使用多少資金。</li>
                </ul>
            </section>

            <section className="glass-panel rounded-lg p-6 space-y-3">
                <h2 className="text-lg font-semibold text-text-primary">2）畫面上的指標代表什麼？</h2>
                <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                    <li>
                        策略狀態：
                        <span className="ml-1 text-text-primary">
                            已建立 / 運行中 / 已暫停 / 已停止
                        </span>
                    </li>
                    <li>累計損益：從啟動策略以來，所有成交的總損益。</li>
                    <li>成交次數：已經完成多少筆買賣。</li>
                    <li>價格區間：策略目前設定的上下限價格。</li>
                    <li>單格價格間距：每一格價格相差多少（含百分比）。</li>
                    <li>訂單紀錄：每一筆掛單的方向、價格、數量與狀態。</li>
                    <li>策略統計：總報酬率、勝率、最大獲利／虧損等。</li>
                </ul>
            </section>

            <section className="glass-panel rounded-lg p-6 space-y-3">
                <h2 className="text-lg font-semibold text-text-primary">3）常見問題</h2>
                <div className="space-y-2 text-sm text-text-secondary leading-relaxed">
                    <div>
                        <p className="font-semibold text-text-primary">
                            Q：為什麼有時候停止策略會需要重試？
                        </p>
                        <p>
                            A：當 BOT 正在大量建立或更新掛單時，後端資料庫在短時間內會比較忙碌。
                            這時候立刻按「停止」可能會收到「系統忙碌中，請稍後再試」的提示，等待幾秒再按一次即可。
                        </p>
                    </div>
                    <div>
                        <p className="font-semibold text-text-primary">
                            Q：停止策略後，交易所上的掛單會自動全部取消嗎？
                        </p>
                        <p>
                            A：目前系統會停止策略內部的自動掛單與補單，但不會強制幫你在交易所取消所有歷史掛單。
                            建議停止後到 Propw 或交易所檢查，如有不需要的掛單或持倉，請手動處理。
                        </p>
                    </div>
                    <div>
                        <p className="font-semibold text-text-primary">
                            Q：為什麼有時候看不到即時價格？
                        </p>
                        <p>
                            A：價格是透過 WebSocket 即時更新，如果網路不穩定或後端暫時沒有回報，畫面會停留在上一筆價格。
                            這是刻意設計，避免價格突然變成空白。
                        </p>
                    </div>
                    <div>
                        <p className="font-semibold text-text-primary">
                            Q：下單前的「二次確認」沒有關閉會怎樣？
                        </p>
                        <p>
                            A：需要先在交易所把「下單二次確認」或安全彈窗關掉，否則自動掛單會被擋下來造成下單失敗。
                            建議登入後先到交易所設定確認已關閉，再啟動策略。
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
