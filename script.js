document.addEventListener("DOMContentLoaded", () => {
    
    // 1. 全域網頁區塊宣告
    const pageHome = document.getElementById('page-home');
    const pageCanvas = document.getElementById('page-canvas');
    const pageLoading = document.getElementById('page-loading');
    const pageResult = document.getElementById('page-result');
    const postcardModal = document.getElementById('postcard-modal');

    const startBtn = document.getElementById('start-btn');
    const backHomeBtn = document.getElementById('back-home-btn');
    const submitBtn = document.getElementById('submit-btn');
    const btnRepaint = document.getElementById('btn-repaint');
    const btnGenerateCard = document.getElementById('btn-generate-card');
    const closeImgModalBtn = document.getElementById('close-modal-btn');
    const btnDownloadJpg = document.getElementById('btn-download-jpg');

    // 2. Canvas 初始化
    const canvas = document.getElementById('paintCanvas');
    const ctx = canvas.getContext('2d');
    const resultCanvasClone = document.getElementById('resultCanvasClone');
    const cloneCtx = resultCanvasClone.getContext('2d');
    const postcardCanvasClone = document.getElementById('postcardCanvasClone');
    const postcardCtx = postcardCanvasClone.getContext('2d');

    // 歷史紀錄
    let undoStack = [];
    let redoStack = [];
    const MAX_HISTORY = 20;

    function initCanvasState() {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        undoStack = []; redoStack = [];
        saveHistoryState();
    }
    initCanvasState();

    function saveHistoryState() {
        if (undoStack.length >= MAX_HISTORY) undoStack.shift();
        undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        redoStack = [];
    }

    let isDrawing = false;
    let startX = 0; let startY = 0;
    let snapshot = null;

    // 工具與筆刷款式狀態
    let currentMode = 'pencil'; 
    let currentSize = 5; 
    let eraserSize = 50; // 預設橡皮擦大小
    let currentColor = '#000000'; 
    let currentShape = 'free';
    let currentBrushType = 'classic'; // classic, calligraphy, airbrush, crayon

    // 偵測是否開啟左側橡皮擦控制面板
    const eraserSizePanel = document.getElementById('eraser-size-panel');
    function toggleEraserPanel(show) {
        if (show) {
            eraserSizePanel.classList.remove('hidden');
        } else {
            eraserSizePanel.classList.add('hidden');
        }
    }

    // 畫筆款式與渲染核心
    function drawStyleLine(x1, y1, x2, y2) {
        ctx.strokeStyle = currentColor;
        ctx.fillStyle = currentColor;

        if (currentBrushType === 'classic') {
            ctx.lineWidth = currentSize;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        } 
        else if (currentBrushType === 'calligraphy') {
            // 特色鋼筆：運用多個平行斜角疊加，畫出中式與西式書法感
            ctx.lineWidth = 1;
            let widthTrack = currentSize;
            for (let i = -widthTrack/2; i < widthTrack/2; i += 0.5) {
                ctx.beginPath();
                ctx.moveTo(x1 + i, y1 - i);
                ctx.lineTo(x2 + i, y2 - i);
                ctx.stroke();
            }
        } 
        else if (currentBrushType === 'airbrush') {
            // 藝術噴槍：在滑鼠移動的路徑周圍生成擴散星點
            let density = currentSize * 2;
            for (let i = 0; i < density; i++) {
                let angle = Math.random() * Math.PI * 2;
                let radius = Math.random() * (currentSize * 2);
                let px = x2 + Math.cos(angle) * radius;
                let py = y2 + Math.sin(angle) * radius;
                ctx.fillRect(px, py, 1.5, 1.5);
            }
        } 
        else if (currentBrushType === 'crayon') {
            // 質感蠟筆：利用半透明與稍微晃動的線條疊加，製造粉蠟筆顆粒感
            ctx.lineWidth = currentSize;
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.25; // 造成半透明疊加質感
            for(let i=0; i<3; i++) {
                ctx.beginPath();
                ctx.moveTo(x1 + (Math.random()-0.5)*2, y1 + (Math.random()-0.5)*2);
                ctx.lineTo(x2 + (Math.random()-0.5)*2, y2 + (Math.random()-0.5)*2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0; // 還原透明度
        }
    }

    // 橡皮擦方形擦拭法
    function runEraser(x, y) {
        ctx.fillStyle = "#FFFFFF";
        // 以滑鼠為中心點清除正方形區塊
        ctx.fillRect(x - eraserSize / 2, y - eraserSize / 2, eraserSize, eraserSize);
    }

    // 滴管
    function pickColor(x, y) {
        const imgData = ctx.getImageData(x, y, 1, 1).data;
        currentColor = `#${imgData[0].toString(16).padStart(2,'0')}${imgData[1].toString(16).padStart(2,'0')}${imgData[2].toString(16).padStart(2,'0')}`.toUpperCase();
        colorDots.forEach(d => d.classList.remove('active'));
        currentMode = 'pencil'; clearToolActive(); btnPencil.classList.add('active');
        toggleEraserPanel(false);
    }

    // 填色油漆桶
    function floodFill(startX, startY, fillColorHex) {
        const width = canvas.width; const height = canvas.height;
        const imgDataObj = ctx.getImageData(0, 0, width, height); const data = imgDataObj.data;
        const fillR = parseInt(fillColorHex.slice(1, 3), 16); const fillG = parseInt(fillColorHex.slice(3, 5), 16); const fillB = parseInt(fillColorHex.slice(5, 7), 16);
        const targetPos = (startY * width + startX) * 4;
        const targetR = data[targetPos]; const targetG = data[targetPos + 1]; const targetB = data[targetPos + 2];
        
        if (targetR === fillR && targetG === fillG && targetB === fillB) return;
        const queue = [[startX, startY]];
        while (queue.length > 0) {
            const [cx, cy] = queue.shift(); const pos = (cy * width + cx) * 4;
            if (data[pos] === targetR && data[pos + 1] === targetG && data[pos + 2] === targetB) {
                data[pos] = fillR; data[pos + 1] = fillG; data[pos + 2] = fillB; data[pos + 3] = 255;
                if (cx > 0) queue.push([cx - 1, cy]); if (cx < width - 1) queue.push([cx + 1, cy]);
                if (cy > 0) queue.push([cx, cy - 1]); if (cy < height - 1) queue.push([cx, cy + 1]);
            }
        }
        ctx.putImageData(imgDataObj, 0, 0);
        saveHistoryState(); 
    }

    // 滑鼠監聽
    canvas.addEventListener('mousedown', (e) => {
        startX = e.offsetX; startY = e.offsetY;
        if (currentMode === 'picker') { pickColor(startX, startY); return; }
        if (currentMode === 'bucket') { floodFill(startX, startY, currentColor); return; }
        
        isDrawing = true;
        if (currentMode === 'eraser') {
            runEraser(startX, startY);
        } else {
            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        if (currentMode === 'eraser') {
            runEraser(e.offsetX, e.offsetY);
        } else if (currentShape === 'free') {
            drawStyleLine(startX, startY, e.offsetX, e.offsetY);
            startX = e.offsetX; startY = e.offsetY;
        } else {
            // 形狀繪製
            ctx.putImageData(snapshot, 0, 0);
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = currentSize;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (currentShape === 'line') { ctx.moveTo(startX, startY); ctx.lineTo(e.offsetX, e.offsetY); } 
            else if (currentShape === 'rect') { ctx.rect(startX, startY, e.offsetX - startX, e.offsetY - startY); } 
            else if (currentShape === 'circle') { let radius = Math.sqrt(Math.pow(e.offsetX - startX, 2) + Math.pow(e.offsetY - startY, 2)); ctx.arc(startX, startY, radius, 0, 2 * Math.PI); } 
            else if (currentShape === 'triangle') { ctx.moveTo(startX + (e.offsetX - startX) / 2, startY); ctx.lineTo(e.offsetX, e.offsetY); ctx.lineTo(startX, e.offsetY); ctx.closePath(); }
            ctx.stroke();
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (isDrawing) { isDrawing = false; saveHistoryState(); }
    });
    canvas.addEventListener('mouseout', () => isDrawing = false);

    // 一鍵清空
    document.getElementById('clear-btn').addEventListener('click', () => {
        ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height); saveHistoryState(); 
    });

    // 歷史紀錄按鍵
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    undoBtn.addEventListener('click', () => {
        if (undoStack.length > 1) { 
            const currentState = undoStack.pop(); redoStack.push(currentState); 
            ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
        }
    });
    redoBtn.addEventListener('click', () => {
        if (redoStack.length > 0) { const nextState = redoStack.pop(); undoStack.push(nextState); ctx.putImageData(nextState, 0, 0); }
    });
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoBtn.click(); }
        if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redoBtn.click(); }
    });

    // 頁面跳轉
    startBtn.addEventListener('click', () => { pageHome.classList.add('hidden'); pageCanvas.classList.remove('hidden'); });
    backHomeBtn.addEventListener('click', () => { pageCanvas.classList.add('hidden'); pageHome.classList.remove('hidden'); });

    submitBtn.addEventListener('click', () => {
        const inputTitle = document.getElementById('art-title').value.trim();
        document.getElementById('display-art-title').innerText = inputTitle ? `《${inputTitle}》` : "《無題》";
        pageLoading.classList.remove('hidden');
        cloneCtx.putImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), 0, 0);
        setTimeout(() => {
            pageLoading.classList.add('hidden'); pageCanvas.classList.add('hidden'); pageResult.classList.remove('hidden');
            document.getElementById('res-style').innerText = "現代野獸主義";
            document.getElementById('res-history').innerText = "分析成功！你的作品線條奔放、細節處理極富主觀色彩，這正是20世紀初野獸派大師們追求的藝術解放！";
        }, 1800);
    });

    btnRepaint.addEventListener('click', () => {
        document.getElementById('art-title').value = ""; document.getElementById('art-inspiration').value = "";
        initCanvasState(); pageResult.classList.add('hidden'); pageCanvas.classList.remove('hidden');
    });

    btnGenerateCard.addEventListener('click', () => {
        const inputTitle = document.getElementById('art-title').value.trim();
        document.getElementById('postcard-display-title').innerText = inputTitle ? inputTitle : "無題";
        postcardCtx.putImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), 0, 0);
        postcardModal.classList.remove('hidden');
    });
    closeImgModalBtn.addEventListener('click', () => { postcardModal.classList.add('hidden'); });
    btnDownloadJpg.addEventListener('click', () => {
        html2canvas(document.getElementById('postcard-print-area'), { scale: 2 }).then(canvasImage => {
            const downloadLink = document.createElement('a');
            downloadLink.download = "我的藝術明信片.jpg";
            downloadLink.href = canvasImage.toDataURL('image/jpeg', 0.9);
            downloadLink.click();
        });
    });

    // ==========================================
    // 4. 右側工具箱、筆刷款式與左側橡皮擦連動
    // ==========================================
    const btnPencil = document.getElementById('btn-pencil');
    const btnBucket = document.getElementById('btn-bucket');
    const btnEraser = document.getElementById('btn-eraser');
    const btnPicker = document.getElementById('btn-picker');
    const allTools = [btnPencil, btnBucket, btnEraser, btnPicker];

    function clearToolActive() { allTools.forEach(t => t.classList.remove('active')); }

    btnPencil.addEventListener('click', () => { 
        currentMode = 'pencil'; currentShape = 'free'; clearToolActive(); btnPencil.classList.add('active'); 
        shapeItems.forEach(s => s.classList.remove('active')); document.querySelector('[data-shape="free"]').classList.add('active');
        toggleEraserPanel(false); 
    });
    btnBucket.addEventListener('click', () => { currentMode = 'bucket'; clearToolActive(); btnBucket.classList.add('active'); toggleEraserPanel(false); });
    btnPicker.addEventListener('click', () => { currentMode = 'picker'; clearToolActive(); btnPicker.classList.add('active'); toggleEraserPanel(false); });
    
    // 點擊橡皮擦工具：開啟左側正方形尺寸面板
    btnEraser.addEventListener('click', () => { 
        currentMode = 'eraser'; 
        clearToolActive(); 
        btnEraser.classList.add('active'); 
        toggleEraserPanel(true); // 顯示左邊小畫家經典方塊選單
    });

    // 監聽左側側邊欄 4 種經典方形橡皮擦大小選取
    document.querySelectorAll('.eraser-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.eraser-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            eraserSize = parseInt(opt.getAttribute('data-size')); // 動態改變正方形的擦除面積
        });
    });

    // 筆刷款式切換下拉選單
    const brushToggle = document.getElementById('brush-toggle'); 
    const brushMenu = document.getElementById('brush-menu');
    const currentBrushText = document.getElementById('current-brush-text');
    
    brushToggle.addEventListener('click', (e) => { e.stopPropagation(); brushMenu.classList.toggle('hidden'); });
    
    document.querySelectorAll('.brush-type-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.brush-type-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            currentBrushType = option.getAttribute('data-type');
            currentBrushText.innerHTML = option.innerHTML + ` <i class="fas fa-chevron-down" style="font-size:10px;"></i>`;
            brushMenu.classList.add('hidden');
            
            // 自動切回畫筆狀態
            currentMode = 'pencil'; clearToolActive(); btnPencil.classList.add('active'); toggleEraserPanel(false);
        });
    });
    document.addEventListener('click', () => brushMenu.classList.add('hidden'));

    // 【升級】筆刷粗細滑動拉桿
    const brushSizeInput = document.getElementById('brush-size-input');
    const brushSizeVal = document.getElementById('brush-size-val');
    brushSizeInput.addEventListener('input', (e) => {
        currentSize = parseInt(e.target.value);
        brushSizeVal.innerText = currentSize;
    });

    // 形狀按鈕連動
    const shapeItems = document.querySelectorAll('.shape-item');
    shapeItems.forEach(item => {
        item.addEventListener('click', () => {
            shapeItems.forEach(s => s.classList.remove('active')); item.classList.add('active');
            currentShape = item.getAttribute('data-shape'); currentMode = 'pencil'; clearToolActive(); btnPencil.classList.add('active');
            toggleEraserPanel(false);
        });
    });

    // 色彩盤點擊
    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            colorDots.forEach(d => d.classList.remove('active')); dot.classList.add('active');
            currentColor = dot.getAttribute('data-color');
            if(['eraser', 'picker', 'bucket'].includes(currentMode)) { currentMode = 'pencil'; clearToolActive(); btnPencil.classList.add('active'); toggleEraserPanel(false); }
        });
    });

    // 大調色盤 Windows 編輯色彩按鈕
    const editColorsTrigger = document.getElementById('edit-colors-trigger');
    const nativeColorPicker = document.getElementById('native-color-picker');
    editColorsTrigger.addEventListener('click', () => nativeColorPicker.click());
    nativeColorPicker.addEventListener('input', (e) => {
        colorDots.forEach(d => d.classList.remove('active'));
        currentColor = e.target.value;
        if(['eraser', 'picker', 'bucket'].includes(currentMode)) { currentMode = 'pencil'; clearToolActive(); btnPencil.classList.add('active'); toggleEraserPanel(false); }
    });
});