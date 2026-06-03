// ==========================================
// 1. 頁面切換主控神經網
// ==========================================
const pageWelcome = document.getElementById('page-welcome');
const pageMain = document.getElementById('page-main');
const pageLoading = document.getElementById('page-loading');
const subTools = document.getElementById('sub-tools');
const subResults = document.getElementById('sub-results');

// 點擊首頁「現在就開始」
document.getElementById('startBtn').addEventListener('click', () => {
    pageWelcome.classList.add('hidden');
    pageMain.classList.remove('hidden');
});

// ==========================================
// 2. 核心畫布塗鴉功能控制（小畫家靈魂）
// ==========================================
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
let isPainting = false;
let currentMode = 'pencil'; // 模式：pencil 或 eraser
let currentColor = '#000000'; // 當前線條色彩

// 初始化設定筆觸平滑度
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// 監聽畫布點按事件
canvas.addEventListener('mousedown', (e) => {
    isPainting = true;
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
});

canvas.addEventListener('mousemove', (e) => {
    if (!isPainting) return;
    
    // 設定畫筆屬性（橡皮擦模式下為白色加粗，普通模式下為當前色）
    ctx.strokeStyle = (currentMode === 'eraser') ? '#FFFFFF' : currentColor;
    ctx.lineWidth = (currentMode === 'eraser') ? 25 : 5;
    
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
});

canvas.addEventListener('mouseup', () => isPainting = false);
canvas.addEventListener('mouseleave', () => isPainting = false);

// 清空畫布
document.getElementById('clearBtn').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// ==========================================
// 3. 工具切換與色彩選取器
// ==========================================
const toolPencil = document.getElementById('tool-pencil');
const toolEraser = document.getElementById('tool-eraser');

toolPencil.addEventListener('click', () => {
    currentMode = 'pencil';
    setActiveTool(toolPencil);
});

toolEraser.addEventListener('click', () => {
    currentMode = 'eraser';
    setActiveTool(toolEraser);
});

function setActiveTool(activeBtn) {
    document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
}

// 固定 17 色調色盤點擊監聽
document.querySelectorAll('.color-dot:not(.rainbow-icon)').forEach(dot => {
    dot.addEventListener('click', (e) => {
        currentColor = e.target.getAttribute('data-color');
        currentMode = 'pencil';
        setActiveTool(toolPencil);
    });
});

// 🌈 彩虹進階自訂調色盤控制邏輯
const colorPicker = document.getElementById('colorPicker');
colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value; // 自動抓取調色盤自訂 RGB 的十六進位值
    currentMode = 'pencil';
    setActiveTool(toolPencil);
});

// ==========================================
// 4. 真正串接 2 號同學的後端 API（來真的連線）
// ==========================================
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    // A. 將畫布導出為真實 Base64 格式的圖片編碼
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.9);
    
    // B. 彈出 3 號同學指定的 Loading 連結動畫
    pageLoading.classList.remove('hidden');

    try {
        // C. 發送實時網路 POST 請求給 2 號同學寫好的後端大腦 API
        // ⚠️ 貼心提醒：請根據 2號同學指定的後端路由名稱修改 '/api/analyze' 網址
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                image: imageBase64 
            })
        });

        // D. 讀取回傳的 JSON 真實分析數據
        const result = await response.json();
        
        // E. 關閉 Loading 畫面，切換右側欄位
        pageLoading.classList.add('hidden');
        subTools.classList.add('hidden');
        subResults.classList.remove('hidden');

        // F. 動態將真實數據渲染到畫面上
        renderGeminiData(result);

    } catch (error) {
        console.error("連線合體失敗:", error);
        pageLoading.classList.add('hidden');
        alert("連線失敗！請確認 2 號同學此時有沒有在本機啟動後端伺服器 (Node.js/Express)！");
    }
});

// ==========================================
// 5. 資料動態渲染引擎
// ==========================================
function renderGeminiData(data) {
    const container = document.getElementById('dynamic-json-content');
    
    // ⚠️ 欄位名稱對齊：下面的 data.style, data.artist 等，請根據 2號同學最終定義的 JSON 欄位進行微調
    container.innerHTML = `
        <div class="result-container">
            <h2 class="result-main-title">風格分析</h2>
            
            <div class="result-scroll-box">
                <div style="margin-bottom: 15px; border-bottom: 2px dashed #666; padding-bottom: 10px;">
                    <h3 style="color: #7D0A0A; font-size: 20px;">流派：${data.style || '印象派風格'}</h3>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <p style="font-weight: bold; color: #111;">🖼️ 推薦代表作家：</p>
                    <p style="font-size: 15px; padding-left: 5px;">${data.artist || '文森·梵谷 (Vincent van Gogh)'}</p>
                </div>

                <div style="margin-bottom: 12px;">
                    <p style="font-weight: bold; color: #111;">📌 經典代表作品：</p>
                    <p style="font-size: 15px; padding-left: 5px;">${data.masterpiece || '《星夜》(The Starry Night)'}</p>
                </div>

                <div style="margin-bottom: 15px;">
                    <p style="font-weight: bold; color: #111;">📖 藝術歷史科普：</p>
                    <p style="font-size: 13px; line-height: 1.6; text-align: justify;">
                        ${data.description || '您的作品線條與構圖隱隱透露出一種奔放的力量，正如19世紀末印象派與表現主義大師，不再拘泥於真實物體的刻畫，而是轉向心靈感官對光影與情緒的極致宣洩...'}
                    </p>
                </div>
            </div>

            <div class="action-section" style="margin-top: 15px;">
                <button id="postcardBtn" class="btn primary" onclick="alert('明信片產生中！')">產生明信片</button>
                <button id="resetBtn" class="btn secondary" onclick="location.reload()">重新畫一幅</button>
            </div>
        </div>
    `;
}
