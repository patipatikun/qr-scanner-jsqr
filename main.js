let dqr = null;
let productqr = null;

const SCANNER_ID_LEFT = "scanner-dqr";
const SCANNER_ID_RIGHT = "scanner-productqr";
const MAX_TEXT_LENGTH = 8; 

const resultBox = document.getElementById("result");
const btnStart1 = document.getElementById("start-scan-1");
const btnStart2 = document.getElementById("start-scan-2");

const state = {
    // 状態管理をシンプル化: 'ready', 'scanning_1', 'scanning_2', 'done'
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
    
    // 映像要素を非表示にする
    const stateKey = scannerId === SCANNER_ID_LEFT ? 'left' : 'right';
    if(state[stateKey].video) {
        state[stateKey].video.style.display = 'none';
    }
    
    // 待機メッセージを削除 (HTML要素にしたため)
    const waitMessage = document.getElementById('wait-message-2');
    if (waitMessage) {
        waitMessage.remove(); 
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
 * 両方とも表示 (isHidden=false) で起動する
 */
async function setupCamera(scannerId, stateKey, isHidden = false) {
    const container = document.getElementById(scannerId);
    
    // 既存のコンテンツをクリア
    container.innerHTML = ''; 
    
    const video = document.createElement('video');
    video.style.display = 'block'; // 常に表示
    video.setAttribute('playsinline', true);
    video.style.maxWidth = '100%'; 
    
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    
    // 要素をDOMに追加
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

/**
 * プレビューティック（requestAnimationFrame）を停止する
 */
function stopTick(stateKey) {
    const { requestId } = state[stateKey];
    if (requestId) {
        cancelAnimationFrame(requestId);
    }
    state[stateKey].requestId = null;
}

/**
 * 全てのカメラストリームを停止し、リソースを解放する (リセット時のみ)
 */
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
    // stateKeyとcurrentをチェックして、対応するスキャナーのみ解析を行う
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

/**
 * 両方のカメラを同時に起動し、プレビューを開始する
 */
async function startBothCams() {
    try {
        // ✅ 1回目と2回目カメラを両方セットアップ (表示)
        await setupCamera(SCANNER_ID_LEFT, 'left');
        await setupCamera(SCANNER_ID_RIGHT, 'right'); 
        
        state.current = 'ready'; // 起動完了、読み取り待ち
        
        // 両方のカメラのプレビューtickを開始（解析はしない）
        tick('left', (qr) => { /* コールバックはstartLeftScanで上書きされる */ }); 
        tick('right', (qr) => { /* コールバックはstartRightScanで上書きされる */ });
        
        resultBox.textContent = "QRコードを合わせ、1回目読み取り開始ボタンを押してください。";
        btnStart1.textContent = "QR読み取り開始 (1回目)";
        btnStart1.disabled = false;
        
        // 2回目ボタンは1回目完了まで非表示
        btnStart2.style.display = "none";

    } catch (e) {
        console.error("両カメラ起動エラー:", e);
        resultBox.textContent = "エラー: カメラの起動に失敗しました。権限を確認してください。";
        btnStart1.disabled = false;
        btnStart1.textContent = "📷 リトライ";
        btnStart2.style.display = "none";
    }
}

/**
 * 1回目のQRコード読み取りを開始する
 */
function startLeftScan() {
    resultBox.textContent = "1回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_1'; // 1回目カメラの解析を有効化

    const onReadSuccess = (qr) => {
        dqr = qr;
        stopTick('left'); // 1回目の解析を停止
        
        displayQrText(SCANNER_ID_LEFT, dqr); 
        resultBox.textContent = "1回目QR読み取り完了。2回目読み取り開始ボタンを押してください。";
        
        // UIを2回目用に切り替え
        btnStart1.style.display = "none";
        btnStart2.style.display = "block";
        state.current = 'ready'; // 読み取り待ちの状態に戻す
        btnStart2.disabled = false; 
    };
    
    // 既存のtickを停止し、新しいコールバックを持つtickを開始
    stopTick('left'); 
    state.left.requestId = requestAnimationFrame(() => tick('left', onReadSuccess));
}


/**
 * 2回目のQRコード読み取りを開始する
 */
function startRightScan() {
    resultBox.textContent = "2回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_2'; // 2回目カメラの解析を有効化

    const onReadSuccess = (qr) => {
        productqr = qr;
        stopTick('right'); // 2回目の解析を停止

        displayQrText(SCANNER_ID_RIGHT, productqr);
        checkMatch();
    };
    
    // 既存のtickを停止し、新しいコールバックを持つtickを開始
    stopTick('right');
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

/**
 * アプリケーションの状態を初期状態にリセットする
 */
function resetApp() {
    dqr = null;
    productqr = null;
    
    stopAllCameras(); // すべてのカメラリソースを解放

    resultBox.textContent = "QRをスキャンしてください";
    resultBox.className = "";
    
    // UIを初期状態に戻す
    btnStart1.style.display = "block";
    btnStart1.disabled = true; 
    btnStart1.textContent = "カメラ起動中...";
    
    btnStart2.style.display = "none";
    btnStart2.disabled = true;
    btnStart2.textContent = "📷 2回目読み取り開始";
    
    state.current = "ready";

    // ページロード後、DOMリセット後に自動で両カメラの起動を開始
    setTimeout(() => {
        startBothCams(); 
    }, 100); 
}


// --- イベントリスナーの設定 ---

// 1回目スキャン開始ボタン
btnStart1.addEventListener("click", () => {
    btnStart1.disabled = true;
    if (state.current === 'ready') {
        startLeftScan(); // 読み取り開始
    }
});

// 2回目スキャン開始ボタン
btnStart2.addEventListener("click", () => {
    btnStart2.disabled = true;
    if (state.current === 'ready') {
        startRightScan(); // 読み取り開始
    } else {
        btnStart2.disabled = false;
    }
});

// アプリケーションの初回起動
resetApp();
