let dqr = null;
let productqr = null;

const SCANNER_ID_LEFT = "scanner-dqr";
const SCANNER_ID_RIGHT = "scanner-productqr";
const MAX_TEXT_LENGTH = 8; // 表示する文字の最大長

// DOM要素の取得
const resultBox = document.getElementById("result");
const btnStart1 = document.getElementById("start-scan-1");
const btnStart2 = document.getElementById("start-scan-2");

// カメラ/スキャン状態を管理するオブジェクト
const state = {
    current: "ready", // 'ready', 'previewing_1', 'scanning_1', 'previewing_2', 'scanning_2', 'done'
    left: { video: null, canvas: null, stream: null, requestId: null },
    right: { video: null, canvas: null, stream: null, requestId: null },
    aimerSize: 150 // 照準枠のサイズ (ピクセル)
};

// --- ヘルパー関数 ---

/**
 * QRコードの文字情報をスキャナーエリアに表示する
 */
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

/**
 * スキャナーエリアをクリアする (リセット時用)
 */
function clearScannerArea(scannerId) {
    document.getElementById(scannerId).innerHTML = '';
}

/**
 * カメラの起動（プレビュー表示）に必要な要素を設定する
 */
async function setupCamera(scannerId, stateKey) {
    const container = document.getElementById(scannerId);
    container.innerHTML = ''; // 既存のコンテンツをクリア

    const video = document.createElement('video');
    video.style.display = 'block';
    video.setAttribute('playsinline', true);
    video.style.maxWidth = '100%'; 
    container.appendChild(video);
    
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    container.appendChild(canvas);
    
    // 照準枠の作成
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
        await video.play(); // 確実に再生が始まるのを待つ
        
        return { video, canvas, stream };

    } catch (err) {
        console.error("カメラ起動失敗:", err);
        throw new Error("カメラへのアクセスまたは起動に失敗しました。");
    }
}

/**
 * カメラを停止し、ストリームを解放する
 */
function stopCamera(stateKey) {
    const { stream, requestId } = state[stateKey];
    
    if (requestId) {
        cancelAnimationFrame(requestId);
    }
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop()); // カメラリソースを解放
    }
    
    state[stateKey].stream = null;
    state[stateKey].video = null;
    state[stateKey].canvas = null;
    state[stateKey].requestId = null;
    
    clearScannerArea(stateKey === 'left' ? SCANNER_ID_LEFT : SCANNER_ID_RIGHT);
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
 * 1回目のカメラ起動（プレビュー開始）
 */
async function startLeftPreview() {
    try {
        await setupCamera(SCANNER_ID_LEFT, 'left');
        state.current = 'previewing_1';
        tick('left', (qr) => { /* 読み取り時のコールバックは後で設定 */ }); 
        
        // プレビュー開始後はボタンを「読み取り開始」にする
        resultBox.textContent = "枠内にQRコードを合わせ、ボタンを押して読み取り開始。";
        btnStart1.textContent = "QR読み取り開始 (1回目)";
        btnStart1.disabled = false; // ボタンを有効化 (読み取り待機状態へ)

    } catch (e) {
        resultBox.textContent = "エラー: カメラ起動失敗。カメラ権限を確認してください。";
        btnStart1.disabled = false;
        btnStart1.textContent = "📷 1回目カメラ起動リトライ";
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
        stopCamera('left'); 
        
        displayQrText(SCANNER_ID_LEFT, dqr); 
        resultBox.textContent = "1回目QR読み取り完了。2回目読み取り開始ボタンを押してください。";
        
        // UIを2回目用に切り替え
        btnStart1.style.display = "none";
        btnStart2.style.display = "block";
        btnStart2.disabled = false; // 2回目カメラ起動の準備完了
    };
    
    state.left.requestId = requestAnimationFrame(() => tick('left', onReadSuccess));
}


/**
 * 2回目のカメラ起動（プレビュー開始）
 */
async function startRightPreview() {
    stopCamera('left'); // 念のため1回目カメラを停止

    try {
        await setupCamera(SCANNER_ID_RIGHT, 'right');
        state.current = 'previewing_2';
        tick('right', (qr) => { /* 読み取り時のコールバックは後で設定 */ });
        
        resultBox.textContent = "2回目カメラ起動完了。枠内にQRコードを合わせ、ボタンを再度押して読み取り開始。";
        btnStart2.textContent = "QR読み取り開始 (2回目)";
        btnStart2.disabled = false; // ボタンを有効化

    } catch (e) {
        console.error("2回目カメラ起動失敗:", e);
        resultBox.textContent = "エラー: 2回目カメラ起動失敗。リセットします。";
        btnStart2.disabled = false;
        resetApp(); // エラー時はリセット
    }
}

/**
 * 2回目のQRコード読み取りを開始する
 */
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

/**
 * 2つのQRコードをサーバーに送信して照合する
 */
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
    
    stopCamera('left');
    stopCamera('right');

    resultBox.textContent = "QRをスキャンしてください";
    resultBox.className = "";
    
    clearScannerArea(SCANNER_ID_LEFT);
    clearScannerArea(SCANNER_ID_RIGHT);
    
    // UIを初期状態に戻す
    btnStart1.style.display = "block";
    btnStart1.disabled = true; // 起動するまで無効
    btnStart1.textContent = "カメラ起動中...";
    
    btnStart2.style.display = "none";
    btnStart2.disabled = true;
    btnStart2.textContent = "📷 2回目読み取り開始";
    
    state.current = "ready";

    // ページロード後、DOMリセット後に自動で1回目プレビューを開始
    setTimeout(() => {
        startLeftPreview(); 
    }, 100); 
}


// --- イベントリスナーの設定 ---

// 1回目スキャン開始/再開ボタン (読み取り開始機能のみ)
btnStart1.addEventListener("click", () => {
    btnStart1.disabled = true;
    // 状態が 'previewing_1' の場合のみ読み取りを開始
    if (state.current === 'previewing_1') {
        startLeftScan();
    }
    // 'ready' の状態は自動起動されるため、ここでは処理しない
});

// 2回目スキャン開始/再開ボタン
btnStart2.addEventListener("click", () => {
    btnStart2.disabled = true;
    if (state.current === 'previewing_1') {
        // 1回目完了後: カメラ起動（プレビュー開始）
        startRightPreview();
    } else if (state.current === 'previewing_2') {
        // 2回目プレビュー中: 読み取り開始
        startRightScan();
    }
});

// アプリケーションの初回起動
// ページロード時に自動で resetApp -> startLeftPreview が実行される
resetApp();
