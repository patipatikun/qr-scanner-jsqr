let dqr = null;
let productqr = null;

const SCANNER_ID_LEFT = "scanner-dqr";
const SCANNER_ID_RIGHT = "scanner-productqr";
const MAX_TEXT_LENGTH = 8; 

const resultBox = document.getElementById("result");
const btnStart1 = document.getElementById("start-scan-1");
const btnStart2 = document.getElementById("start-scan-2");

const state = {
    current: "ready", // 'ready', 'scanning_1', 'scanning_2', 'done'
    left: { video: null, canvas: null, stream: null, requestId: null },
    right: { video: null, canvas: null, stream: null, requestId: null },
    aimerSize: 200 // ✅ エイマーのサイズを200pxに設定 (読み取り範囲)
};

// --- ヘルパー関数 ---

function displayQrText(scannerId, text) {
    const el = document.getElementById(scannerId);
    let displayText = text;
    
    if (displayText.length > MAX_TEXT_LENGTH) {
        displayText = displayText.substring(0, MAX_TEXT_LENGTH) + '...'; 
    }
    
    // 映像要素とエイマーを非表示にする
    const stateKey = scannerId === SCANNER_ID_LEFT ? 'left' : 'right';
    if(state[stateKey].video) {
        state[stateKey].video.style.display = 'none';
    }
    
    const aimer = el.querySelector('.aimer');
    if (aimer) aimer.style.display = 'none';
    
    // 待機メッセージの削除（念のため）
    if (scannerId === SCANNER_ID_RIGHT) {
        const waitMessage = document.getElementById('wait-message-2');
        if (waitMessage) {
            waitMessage.remove(); 
        }
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
    const el = document.getElementById(scannerId);
    el.innerHTML = '';
}

/**
 * カメラの起動（ビデオ/キャンバス要素の作成とストリームの取得）
 */
async function setupCamera(scannerId, stateKey) {
    const container = document.getElementById(scannerId);
    
    // 1回目エリアは既存のコンテンツをクリア（待機メッセージはないため）
    if (scannerId === SCANNER_ID_LEFT) {
        container.innerHTML = ''; 
    }
    
    const video = document.createElement('video');
    video.style.display = 'block'; 
    video.setAttribute('playsinline', true);
    video.style.maxWidth = '100%'; 
    
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    
    // 要素をDOMに追加 (2回目エリアの場合、待機メッセージの下に来る)
    container.appendChild(video);
    container.appendChild(canvas);

    // 照準枠の作成と追加
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
        
    } catch (err) {
        console.error("カメラ起動失敗:", err);
        throw new Error("カメラへのアクセスまたは起動に失敗しました。");
    }
}

function stopTick(stateKey) {
    const { requestId } = state[stateKey];
    if (requestId) {
        cancelAnimationFrame(requestId);
    }
    state[stateKey].requestId = null;
}

function stopAllCameras() {
    ['left', 'right'].forEach(stateKey => {
        stopTick(stateKey);
        const { stream } = state[stateKey];
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        state[stateKey] = { video: null, canvas: null, stream: null, requestId: null };
        clearScannerArea(stateKey === 'left' ? SCANNER_ID_LEFT : SCANNER_ID_RIGHT);
    });
}


/**
 * 読み取りとプレビューのメインループ
 * 解析範囲を中央のエイマーサイズに制限します。
 */
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
    
    // 読み取りモードの場合のみ解析を実行
    if (current === 'scanning_1' && stateKey === 'left' || current === 'scanning_2' && stateKey === 'right') {
        
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        // --- 🎯 読み取りエリアのトリミング計算 ---
        const aimerSize = state.aimerSize; 
        
        // 映像の中央から aimerSize x aimerSize の領域を切り出す座標
        const cropX = (videoWidth - aimerSize) / 2;
        const cropY = (videoHeight - aimerSize) / 2;
        
        // 一時キャンバスを作成し、トリミングされた画像を描画
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = aimerSize;
        tempCanvas.height = aimerSize;
        const tempContext = tempCanvas.getContext('2d');
        
        // 元の映像から、中央の領域を切り取り、tempCanvasに描画
        tempContext.drawImage(video, 
                              cropX, cropY, aimerSize, aimerSize, // 元画像の切り取り範囲
                              0, 0, aimerSize, aimerSize); // 描画先の範囲

        // 切り取られた領域の ImageData のみを取得し、jsQRに渡す
        const imageData = tempContext.getImageData(0, 0, aimerSize, aimerSize);
        
        // QRコード解析は、トリミング後のサイズ(aimerSize)で行う
        const qrCode = jsQR(imageData.data, aimerSize, aimerSize, {
            inversionAttempts: "dontInvert",
        });
        
        // ------------------------------------------

        if (qrCode) {
            onReadSuccess(qrCode.data);
            return;
        }
    }
    
    state[stateKey].requestId = requestAnimationFrame(() => tick(stateKey, onReadSuccess));
}


// --- 制御ロジック ---

async function startBothCams() {
    try {
        await setupCamera(SCANNER_ID_LEFT, 'left');
        await setupCamera(SCANNER_ID_RIGHT, 'right'); 
        
        state.current = 'ready'; 
        
        tick('left', (qr) => { /* コールバックはstartLeftScanで上書きされる */ }); 
        tick('right', (qr) => { /* コールバックはstartRightScanで上書きされる */ });
        
        resultBox.textContent = "QRコードを合わせ、1回目読み取り開始ボタンを押してください。";
        btnStart1.textContent = "QR読み取り開始 (1回目)";
        btnStart1.disabled = false;
        
        btnStart2.style.display = "block"; 
        btnStart2.disabled = true; 
        btnStart2.textContent = "📷 2回目読み取り開始";

        // 2回目エリアのカメラ映像を初期状態で非表示にする (待機メッセージが見えるように)
        if (state.right.video) state.right.video.style.display = 'none';
        const rightAimer = document.getElementById(SCANNER_ID_RIGHT).querySelector('.aimer');
        if (rightAimer) rightAimer.style.display = 'none';


    } catch (e) {
        console.error("両カメラ起動エラー:", e);
        resultBox.textContent = "エラー: カメラの起動に失敗しました。権限を確認してください。";
        btnStart1.disabled = false;
        btnStart1.textContent = "📷 リトライ";
        btnStart2.style.display = "none";
    }
}

function startLeftScan() {
    resultBox.textContent = "1回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_1'; 

    const onReadSuccess = (qr) => {
        dqr = qr;
        stopTick('left'); 
        
        displayQrText(SCANNER_ID_LEFT, dqr); 
        
        // ✅ 2回目エリアの待機メッセージを削除し、カメラ映像を表示させる
        const waitMessage = document.getElementById('wait-message-2');
        if (waitMessage) {
             waitMessage.remove(); 
        }
        
        // 2回目カメラの映像とエイマーを有効化
        if (state.right.video) state.right.video.style.display = 'block';
        const rightAimer = document.getElementById(SCANNER_ID_RIGHT).querySelector('.aimer');
        if (rightAimer) rightAimer.style.display = 'block';

        resultBox.textContent = "1回目QR読み取り完了。2回目読み取り開始ボタンを押してください。";
        
        btnStart1.style.display = "none";
        btnStart2.style.display = "block";
        state.current = 'ready'; 
        btnStart2.disabled = false; 
    };
    
    stopTick('left'); 
    state.left.requestId = requestAnimationFrame(() => tick('left', onReadSuccess));
}


function startRightScan() {
    resultBox.textContent = "2回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_2'; 

    const onReadSuccess = (qr) => {
        productqr = qr;
        stopTick('right'); 

        displayQrText(SCANNER_ID_RIGHT, productqr);
        checkMatch();
    };
    
    stopTick('right');
    state.right.requestId = requestAnimationFrame(() => tick('right', onReadSuccess));
}

function checkMatch() {
    btnStart2.disabled = true; 
    resultBox.textContent = "照合中...";
    resultBox.className = "";

    if (dqr && productqr) {
        fetch("https://script.google.com/macros/s/AKfycbx-o6W-5wRmFMXPrabkRzzNSDoXJ1o9SX4LoMtEAY__8nlzknpcGLyHQz40y3cbN9nZSQ/exec", {
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
    
    stopAllCameras(); 

    resultBox.textContent = "QRをスキャンしてください";
    resultBox.className = "";
    
    btnStart1.style.display = "block";
    btnStart1.disabled = true; 
    btnStart1.textContent = "カメラ起動中...";
    
    btnStart2.style.display = "none"; 
    btnStart2.disabled = true;
    btnStart2.textContent = "📷 2回目読み取り開始";
    
    state.current = "ready";

    setTimeout(() => {
        startBothCams(); 
    }, 100); 
}


// --- イベントリスナーの設定 ---

btnStart1.addEventListener("click", () => {
    btnStart1.disabled = true;
    if (state.current === 'ready') {
        startLeftScan(); 
    }
});

btnStart2.addEventListener("click", () => {
    btnStart2.disabled = true;
    if (state.current === 'ready') {
        startRightScan(); 
    } else {
        btnStart2.disabled = false;
    }
});

// アプリケーションの初回起動
resetApp();
