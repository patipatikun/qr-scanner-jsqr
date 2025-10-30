let dqr = null;
let productqr = null;

const SCANNER_ID_LEFT = "scanner-dqr";
const SCANNER_ID_RIGHT = "scanner-productqr";
const MAX_TEXT_LENGTH = 8; 

const resultBox = document.getElementById("result");
const btnStart1 = document.getElementById("start-scan-1");
const btnStart2 = document.getElementById("start-scan-2");

const state = {
    current: "ready", // 'ready', 'previewing_1', 'scanning_1', 'previewing_2', 'scanning_2', 'done'
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
    
    // 2回目スキャンエリアに結果を表示する場合、待機中の表示を消すCSSを一時的に適用
    if(scannerId === SCANNER_ID_RIGHT) {
        el.style.setProperty('content', 'none', 'after');
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
    
    // 2回目エリアの場合、待機中の表示を戻す
    if(scannerId === SCANNER_ID_RIGHT) {
        el.style.setProperty('content', '"1回目スキャン完了後に表示"', 'after');
    }
}

/**
 * カメラの起動（ビデオ/キャンバス要素の作成とストリームの取得）
 * @param {boolean} isHidden - trueの場合、ビデオ要素を非表示にして裏側で待機させる
 */
async function setupCamera(scannerId, stateKey, isHidden = false) {
    const container = document.getElementById(scannerId);
    // 既存のコンテンツはクリアせず、ビデオとキャンバスを作成・ストリームを設定する
    
    const video = document.createElement('video');
    video.style.display = isHidden ? 'none' : 'block'; // 初期表示/非表示を決定
    video.setAttribute('playsinline', true);
    video.style.maxWidth = '100%'; 
    
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    
    // 要素をDOMに追加
    container.appendChild(video);
    container.appendChild(canvas);

    // 照準枠の作成と追加 (1回目のみ。2回目はCSSで待機表示)
    if (!isHidden) {
        const aimer = document.createElement('div');
        aimer.className = 'aimer';
        aimer.style.width = `${state.aimerSize}px`;
        aimer.style.height = `${state.aimerSize}px`;
        container.appendChild(aimer);
    }


    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });

        state[stateKey].stream = stream;
        state[stateKey].video = video;
        state[stateKey].canvas = canvas;

        video.srcObject = stream;
        await video.play(); 
        
        // 裏側起動の場合、プレビューティックは開始しない。

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
 * 両方のカメラを同時に起動し、1回目のプレビューを開始する
 */
async function startBothCams() {
    try {
        // 1. 1回目カメラをセットアップ (表示)
        await setupCamera(SCANNER_ID_LEFT, 'left', false);
        
        // 2. 2回目カメラをセットアップ (非表示/裏側で待機)
        await setupCamera(SCANNER_ID_RIGHT, 'right', true); 
        
        state.current = 'previewing_1';
        // 1回目のプレビューtickを開始（解析はしない）
        tick('left', (qr) => { /* 読み取り時のコールバックは後で設定 */ }); 
        
        resultBox.textContent = "枠内にQRコードを合わせ、ボタンを押して読み取り開始。";
        btnStart1.textContent = "QR読み取り開始 (1回目)";
        btnStart1.disabled = false; 

    } catch (e) {
        console.error("両カメラ起動エラー:", e);
        resultBox.textContent = "エラー: カメラの起動に失敗しました。権限を確認してください。";
        btnStart1.disabled = false;
        btnStart1.textContent = "📷 リトライ";
    }
}

/**
 * 1回目のQRコード読み取りを開始する
 */
function startLeftScan() {
    resultBox.textContent = "1回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_1';

    const onReadSuccess = (qr) => {
        dqr = qr;
        stopTick('left'); // 1回目の解析を停止
        
        displayQrText(SCANNER_ID_LEFT, dqr); 
        resultBox.textContent = "1回目QR読み取り完了。2回目読み取り開始ボタンを押してください。";
        
        // UIを2回目用に切り替え
        btnStart1.style.display = "none";
        btnStart2.style.display = "block";
        state.current = 'previewing_1'; // 状態を維持し、2回目ボタン待ち
        btnStart2.disabled = false; 
    };
    
    state.left.requestId = requestAnimationFrame(() => tick('left', onReadSuccess));
}


/**
 * 2回目カメラへの切り替えとプレビュー開始
 */
async function startRightPreview() {
    // 1. 1回目カメラ（左側）の表示を停止
    stopTick('left'); 
    state.left.video.style.display = 'none';
    
    // 2. 2回目カメラ（右側）の表示を有効化
    const rightContainer = document.getElementById(SCANNER_ID_RIGHT);
    // 待機中表示を非表示にするためにCSSを上書き
    rightContainer.style.setProperty('content', 'none', 'after'); 
    
    // 映像要素をコンテナに再配置し、表示を有効化
    rightContainer.innerHTML = '';
    rightContainer.appendChild(state.right.video);
    rightContainer.appendChild(state.right.canvas);
    
    const aimer = document.createElement('div'); // 新しいエイマーを作成
    aimer.className = 'aimer';
    aimer.style.width = `${state.aimerSize}px`;
    aimer.style.height = `${state.aimerSize}px`;
    rightContainer.appendChild(aimer);
    
    state.right.video.style.display = 'block'; 

    // 3. 状態の更新と2回目のプレビューtickを開始
    state.current = 'previewing_2';
    tick('right', (qr) => { /* 読み取り時のコールバックは後で設定 */ });
    
    resultBox.textContent = "2回目カメラ起動完了。枠内にQRコードを合わせ、ボタンを再度押して読み取り開始。";
    btnStart2.textContent = "QR読み取り開始 (2回目)";
    btnStart2.disabled = false; 
}


/**
 * 2回目のQRコード読み取りを開始する
 */
function startRightScan() {
    resultBox.textContent = "2回目読み取り中...枠を動かさないでください。";
    state.current = 'scanning_2';

    const onReadSuccess = (qr) => {
        productqr = qr;
        stopTick('right'); // 2回目の解析を停止

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
    btnStart1.disabled = true; // 起動するまで無効
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

// 1回目スキャン開始ボタン (読み取り開始機能のみ)
btnStart1.addEventListener("click", () => {
    btnStart1.disabled = true;
    if (state.current === 'previewing_1') {
        startLeftScan();
    }
});

// 2回目スキャン開始/再開ボタン
btnStart2.addEventListener("click", () => {
    btnStart2.disabled = true;
    if (state.current === 'previewing_1') {
        // 1回目完了後: 2回目カメラへの切り替えとプレビュー開始
        startRightPreview();
    } else if (state.current === 'previewing_2') {
        // 2回目プレビュー中: 読み取り開始
        startRightScan();
    } else {
        btnStart2.disabled = false;
    }
});

// アプリケーションの初回起動
resetApp();
