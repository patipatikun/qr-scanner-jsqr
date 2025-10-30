let dqr = null;
let productqr = null;

const SCANNER_ID_LEFT = "scanner-dqr";
const SCANNER_ID_RIGHT = "scanner-productqr";
const MAX_TEXT_LENGTH = 8; 

const resultBox = document.getElementById("result");
const btnStart1 = document.getElementById("start-scan-1");
const btnStart2 = document.getElementById("start-scan-2");

const state = {
    current: "ready", 
    left: { video: null, canvas: null, stream: null, requestId: null },
    right: { video: null, canvas: null, stream: null, requestId: null },
    aimerSize: 150 
};

// --- ヘルパー関数 ---

function displayQrText(scannerId, text) {
    const el = document.getElementById(scannerId);
    let displayText = text;
    
    if (displayText.length > MAX_TEXT_LENGTH) {
        displayText = displayText.substring(0, MAX_TEXT_LENGTH) + '...'; 
    }
    
    el.innerHTML = `<div style="
        font-size: 1.5em; 
        font-weight: bold; 
        color: #333; 
        padding: 20px; 
        text-align: center;
        background: #e0ffe0; 
        border: 2px solid #4CAF50;
        border-radius: 5px;
        margin: auto;
    ">${displayText}</div>`;
}

function clearScannerArea(scannerId) {
    document.getElementById(scannerId).innerHTML = '';
}

async function setupCamera(scannerId, stateKey) {
    const container = document.getElementById(scannerId);
    container.innerHTML = ''; 

    const video = document.createElement('video');
    video.style.display = 'block';
    video.setAttribute('playsinline', true);
    video.style.maxWidth = '100%'; 
    container.appendChild(video);
    
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    container.appendChild(canvas);
    
    const aimer = document.createElement('div');
    aimer.className = 'aimer';
    aimer.style.width = `${state.aimerSize}px`;
    aimer.style.height = `${state.aimerSize}px`;
    container.appendChild(aimer);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });

        state[stateKey].stream = stream;
        state[stateKey].video = video;
        state[stateKey].canvas = canvas;

        video.srcObject = stream;
        await video.play(); 
        
        return { video, canvas, stream };

    } catch (err) {
        console.error("カメラ起動失敗:", err);
        throw new Error("カメラへのアクセスまたは起動に失敗しました。");
    }
}

function stopCamera(stateKey) {
    const { stream, requestId } = state[stateKey];
    
    if (requestId) {
        cancelAnimationFrame(requestId);
    }
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop()); 
    }
    
    state[stateKey].stream = null;
    state[stateKey].video = null;
    state[stateKey].canvas = null;
    state[stateKey].requestId = null;
    
    clearScannerArea(stateKey === 'left' ? SCANNER_ID_LEFT : SCANNER_ID_RIGHT);
}

function tick(stateKey, onReadSuccess) {
    const { video, canvas } = state[stateKey];
    
    if (!video || video.readyState < 2) { 
        state[stateKey].requestId = requestAnimationFrame(() => tick(stateKey, onReadSuccess));
        return;
    }

    const { current } = state;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    if (current === 'scanning_1' && stateKey === 'left' || current === 'scanning_2' && stateKey === 'right') {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (qrCode) {
            onReadSuccess(qrCode.data);
            return;
        }
    }
    
    state[stateKey].requestId = requestAnimationFrame(() => tick(stateKey, onReadSuccess));
}

// --- 制御ロジック ---

async function startLeftPreview() {
    try {
        await setupCamera(SCANNER_ID_LEFT, 'left');
        state.current = 'previewing_1';
        tick('left', (qr) => { /* 読み取り時のコールバックは後で設定 */ }); 
        
        resultBox.textContent = "枠内にQRコードを合わせ、ボタンを押して読み取り開始。";
        btnStart1.textContent = "QR読み取り開始 (1回目)";
        btnStart1.disabled = false; 

    } catch (e) {
        console.error("1回目カメラ起動エラー:", e);
        resultBox.textContent = "エラー: カメラ起動失敗。カメラ権限を確認してください。";
        btnStart1.disabled = false;
        btnStart1.textContent = "📷 1回目カメラ起動リトライ";
    }
}

function startLeftScan() {
    resultBox.textContent = "1回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_1';

    const onReadSuccess = (qr) => {
        dqr = qr;
        stopCamera('left'); 
        
        displayQrText(SCANNER_ID_LEFT, dqr); 
        resultBox.textContent = "1回目QR読み取り完了。2回目読み取り開始ボタンを押してください。";
        
        btnStart1.style.display = "none";
        btnStart2.style.display = "block";
        btnStart2.disabled = false; 
        console.log("1回目読み取り完了。状態: previewing_1"); // 1回目読み取り完了後も次の動作まで previewing_1 の状態を維持する
    };
    
    state.left.requestId = requestAnimationFrame(() => tick('left', onReadSuccess));
}

async function startRightPreview() {
    // 1. 確実に1回目のカメラリソースを停止・解放する (再度の保証)
    stopCamera('left'); 
    console.log("1回目カメラ停止完了。2回目カメラ起動中...");

    try {
        // 2. 2回目カメラのセットアップ開始
        await setupCamera(SCANNER_ID_RIGHT, 'right');
        
        // 3. 状態の更新とプレビュー開始
        state.current = 'previewing_2';
        tick('right', (qr) => { /* 読み取り時のコールバックは後で設定 */ });
        
        // 4. 成功時のUI更新
        resultBox.textContent = "2回目カメラ起動完了。枠内にQRコードを合わせ、ボタンを再度押して読み取り開始。";
        btnStart2.textContent = "QR読み取り開始 (2回目)";
        btnStart2.disabled = false; 
        console.log("2回目カメラ起動成功。状態: previewing_2");

    } catch (e) {
        // 5. 失敗時のエラー処理
        console.error("重大エラー: 2回目カメラ起動失敗。", e);
        resultBox.textContent = "重大エラー: 2回目カメラ起動失敗。リセットします。";
        btnStart2.disabled = false;
        resetApp(); 
    }
}

function startRightScan() {
    resultBox.textContent = "2回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_2';

    const onReadSuccess = (qr) => {
        productqr = qr;
        stopCamera('right');

        displayQrText(SCANNER_ID_RIGHT, productqr);
        checkMatch();
    };
    
    state.right.requestId = requestAnimationFrame(() => tick('right', onReadSuccess));
}

function checkMatch() {
    btnStart2.disabled = true; 
    resultBox.textContent = "照合中...";
    resultBox.className = "";

    if (dqr && productqr) {
        fetch("https://script.google.com/macros/s/AKfycbzAfRJoFs9hy0-jw8GcY0egwmjA9dlE6WSXCVdMOiJcs44DnBPHpGmFaEw6FD_ZyVE-LA/exec", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `dp=${encodeURIComponent(dqr)}&productQr=${encodeURIComponent(productqr)}`
        })
        .then(res => res.text())
        .then(result => {
            resultBox.textContent = result;
            resultBox.className = result.includes("OK") ? "ok" : "ng";
            setTimeout(resetApp, 3000); 
        })
        .catch(err => {
            console.error("Fetchエラー:", err);
            resultBox.textContent = "エラー: サーバーとの通信に失敗しました。リセットします。";
            resultBox.className = "ng";
            setTimeout(resetApp, 3000); 
        });
    }
}

function resetApp() {
    dqr = null;
    productqr = null;
    
    stopCamera('left');
    stopCamera('right');

    resultBox.textContent = "QRをスキャンしてください";
    resultBox.className = "";
    
    clearScannerArea(SCANNER_ID_LEFT);
    clearScannerArea(SCANNER_ID_RIGHT);
    
    btnStart1.style.display = "block";
    btnStart1.disabled = true; 
    btnStart1.textContent = "カメラ起動中...";
    
    btnStart2.style.display = "none";
    btnStart2.disabled = true;
    btnStart2.textContent = "📷 2回目読み取り開始";
    
    state.current = "ready";

    setTimeout(() => {
        startLeftPreview(); 
    }, 100); 
}


// --- イベントリスナーの設定 ---

btnStart1.addEventListener("click", () => {
    btnStart1.disabled = true;
    if (state.current === 'previewing_1') {
        console.log("1回目ボタンクリック: 読み取り開始");
        startLeftScan();
    }
});

btnStart2.addEventListener("click", () => {
    btnStart2.disabled = true;
    
    if (state.current === 'previewing_1') {
        // 1回目完了後: カメラ起動（プレビュー開始）
        console.log("2回目ボタンクリック: 状態: previewing_1 -> 2回目カメラ起動を試行");
        startRightPreview();
    } else if (state.current === 'previewing_2') {
        // 2回目プレビュー中: 読み取り開始
        console.log("2回目ボタンクリック: 状態: previewing_2 -> 2回目読み取りを開始");
        startRightScan();
    } else {
        console.error("エラー: 2回目ボタンが想定外の状態 (" + state.current + ") で押されました。");
        btnStart2.disabled = false;
    }
});

resetApp();
