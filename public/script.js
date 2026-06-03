// 1. 取得 DOM 節點
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const colorDots = document.querySelectorAll('.color-dot');
const eraserBtn = document.getElementById('tool-eraser');
const pencilBtn = document.getElementById('tool-pencil');

// 2. 初始化繪圖狀態變數
let isPainting = false;
let currentMode = 'pencil'; // 模式：pencil 或 eraser
let currentColor = '#000000'; // 當前畫筆顏色
let currentLineWidth = 5;

// 設定 Canvas 的線條樣式（平滑、圓潤）
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// 3. 繪圖核心滑鼠事件監聽
canvas.addEventListener('mousedown', (e) => {
    isPainting = true;
    ctx.beginPath();
    // 移動到滑鼠點擊的座標位置
    ctx.moveTo(e.offsetX, e.offsetY);
});

canvas.addEventListener('mousemove', (e) => {
    if (!isPainting) return; // 沒按住滑鼠就直接返回
    
    // 根據當前模式切換畫筆顏色
    if (currentMode === 'eraser') {
        ctx.strokeStyle = '#FFFFFF'; // 橡皮擦本質是用白色畫圖
        ctx.lineWidth = 20; // 橡皮擦粗一點
    } else {
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentLineWidth;
    }
    
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke(); // 真正畫出線條
});

canvas.addEventListener('mouseup', () => isPainting = false);
canvas.addEventListener('mouseleave', () => isPainting = false);

// 4. 工具切換邏輯
pencilBtn.addEventListener('click', () => {
    currentMode = 'pencil';
    setActiveTool(pencilBtn);
});

eraserBtn.addEventListener('click', () => {
    currentMode = 'eraser';
    setActiveTool(eraserBtn);
});

function setActiveTool(activeBtn) {
    // 移除所有工具按鈕的 active 樣式
    document.querySelectorAll('.icon-btn').forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

// 5. 調色盤顏色切換
colorDots.forEach(dot => {
    dot.addEventListener('click', (e) => {
        currentColor = e.target.getAttribute('data-color');
        currentMode = 'pencil'; // 點了顏色就自動切換回畫筆模式
        setActiveTool(pencilBtn);
    });
});

// 6. 清除畫布
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// 7. 【關鍵】導出圖片並預備發送給 2號同學
analyzeBtn.addEventListener('click', () => {
    // 將 canvas 畫面轉存為 base64 JPEG 編碼字串
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.9);
    
    // 取得使用者輸入的畫名與靈感
    const artTitle = document.getElementById('artTitle').value;
    const artInspiration = document.getElementById('artInspiration').value;

    console.log("=== 準備送往 2 號後端的資料 ===");
    console.log("畫名:", artTitle);
    console.log("靈感:", artInspiration);
    console.log("圖片 Base64 前 50 字元:", imageBase64.substring(0, 50));

    alert("成功擷取畫布！請打開瀏覽器開發者工具 (F12) 的 Console 查看 Base64 資料。接下來可以跟 2號同學串接 API 了！");
    
    // TODO: 這裡在第二階段將會寫 fetch('/api/analyze', { method: 'POST', ... })
});