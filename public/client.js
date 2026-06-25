const EPHEMERAL_ID = 'sl-' + Array.from(crypto.getRandomValues(new Uint8Array(5))).map(b => b.toString(16).padStart(2, '0')).join('');
let peer = null, conn = null, html5QrCode = null, activeTransfers = {};

function initPeer() {
    peer = new Peer(EPHEMERAL_ID, {
        debug: 1,
        config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
        document.getElementById('my-id-text').textContent = id;
        const joinUrl = 'https://lordvamp9.github.io/Airdrop-local/' + '?join=' + id;
        new QRCode(document.getElementById('qr-code'), { text: joinUrl, width: 180, height: 180, colorDark: "#075985", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });

        const urlParams = new URLSearchParams(window.location.search);
        const joinId = urlParams.get('join');
        if (joinId && joinId !== id) {
            document.getElementById('auto-connecting-status').style.display = 'block';
            document.getElementById('lobby-default').style.display = 'none';
            setTimeout(() => connectToPeer(joinId), 500);
        }
    });

    peer.on('connection', (c) => setupConnection(c));
}

async function toggleJoin(enable) {
    const def = document.getElementById('lobby-default'), join = document.getElementById('lobby-join');
    if (enable) {
        def.style.display = 'none'; 
        join.style.display = 'block';
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, (id) => { toggleJoin(false); connectToPeer(id); });
    } else {
        def.style.display = 'block'; 
        join.style.display = 'none';
        if (html5QrCode) await html5QrCode.stop();
        html5QrCode = null;
    }
}

function connectToPeer(id) { 
    setupConnection(peer.connect(id, { secure: true })); 
}

function setupConnection(connection) {
    conn = connection;
    conn.on('open', () => { 
        document.getElementById('section-lobby').classList.remove('active'); 
        document.getElementById('section-dashboard').classList.add('active'); 
    });
    conn.on('data', (data) => handleIncoming(data));
    conn.on('close', () => location.reload());
}

async function handleIncoming(data) {
    if (data.type === 'metadata') {
        createFileItem(data.id, data.name, data.size, 'incoming');
    }
    else if (data.type === 'chunk') {
        const t = activeTransfers[data.id]; 
        if (!t) return;
        
        if (t.useFsAccess && t.fileWriter) {
            await t.fileWriter.write(data.buffer);
        } else {
            t.chunks.push(new Blob([data.buffer]));
        }
        
        t.received += data.buffer.byteLength;
        updateItemProgress(data.id, (t.received / t.total) * 100);
        
        if (t.received >= t.total) {
            finalizeTransfer(data.id);
        }
    } 
    else if (data.type === 'signal') {
        if (data.action === 'accept') startSending(data.id);
        if (data.action === 'reject') removeItem(data.id);
    }
}

function createFileItem(id, name, size, mode) {
    document.getElementById('no-files-msg').style.display = 'none';
    const q = document.getElementById('file-queue'), i = document.createElement('div');
    i.className = 'file-item'; i.id = `file-${id}`;
    
    let actionsHtml = '';
    if (mode === 'incoming') {
        actionsHtml = `
            <button class="action-btn btn-accept" onclick="window.respondTransfer('${id}', 'accept')">Accept</button>
            <button class="action-btn btn-cancel" onclick="window.respondTransfer('${id}', 'reject')">×</button>
        `;
    } else {
        actionsHtml = `<div style="font-size: 10px; font-weight: 700; color: #64748b;">PENDING</div>`;
    }

    i.innerHTML = `
        <div class="file-info" style="width: 100%; display: flex; align-items: center; gap: 15px;">
            <div class="file-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                </svg>
            </div>
            <div style="flex: 1; overflow: hidden;">
                <div class="file-name" style="font-weight: 600; font-size: 14px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${name}</div>
                <div class="file-size" style="font-size: 12px; color: #64748b;">${formatBytes(size)} • ${mode === 'incoming' ? 'Waiting' : 'Ready'}</div>
                <div class="progress-bar-small">
                    <div class="progress-fill-small" id="fill-${id}"></div>
                </div>
            </div>
            <div class="action-btns" id="actions-${id}">${actionsHtml}</div>
        </div>
    `;
    q.prepend(i); 
    activeTransfers[id] = { name, total: size, received: 0, chunks: [], mode };
}

window.respondTransfer = async function(id, action) {
    const t = activeTransfers[id]; 
    if (!t) return;
    
    if (action === 'accept') { 
        document.getElementById(`actions-${id}`).innerHTML = '<div style="font-size: 10px; font-weight: 700; color: var(--accent);">DOWNLOADING</div>'; 
        
        try {
            if ('showSaveFilePicker' in window) {
                const fileStream = await window.showSaveFilePicker({ suggestedName: t.name });
                t.fileWriter = await fileStream.createWritable();
                t.useFsAccess = true;
            } else {
                t.useFsAccess = false;
            }
            conn.send({ type: 'signal', action: 'accept', id: id }); 
        } catch (e) {
            console.error(e);
            conn.send({ type: 'signal', action: 'reject', id: id }); 
            removeItem(id); 
        }
    } else { 
        conn.send({ type: 'signal', action: 'reject', id: id }); 
        removeItem(id); 
    }
}

async function handleFileSelect(input) {
    for (const file of input.files) {
        const id = Math.random().toString(36).substr(2, 9);
        createFileItem(id, file.name, file.size, 'outgoing');
        activeTransfers[id].fileObject = file;
        conn.send({ type: 'metadata', id, name: file.name, size: file.size });
    }
    input.value = '';
}

async function startSending(id) {
    const t = activeTransfers[id], file = t.fileObject;
    // Chunk size 256KB for better large file performance
    const chunkSize = 256 * 1024; 
    document.getElementById(`actions-${id}`).innerHTML = '<div style="font-size: 10px; font-weight: 700; color: var(--accent);">SENDING</div>';
    
    for (let o = 0; o < file.size; o += chunkSize) {
        const c = file.slice(o, o + chunkSize);
        conn.send({ type: 'chunk', id, buffer: await c.arrayBuffer() });
        updateItemProgress(id, Math.min((o / file.size) * 100, 100));
        // Small delay to prevent overwhelming the WebRTC buffer
        if (o % (chunkSize * 10) === 0) await new Promise(r => setTimeout(r, 10));
    }
    updateItemProgress(id, 100);
    document.getElementById(`actions-${id}`).innerHTML = '<div style="font-size: 10px; font-weight: 700; color: var(--success);">SENT</div>';
}

function updateItemProgress(id, pct) { 
    const f = document.getElementById(`fill-${id}`); 
    if (f) f.style.width = pct + '%'; 
}

async function finalizeTransfer(id) {
    const t = activeTransfers[id];
    
    if (t.useFsAccess && t.fileWriter) {
        await t.fileWriter.close();
    } else {
        const b = new Blob(t.chunks); 
        const u = URL.createObjectURL(b); 
        const a = document.createElement('a');
        a.href = u; 
        a.download = t.name; 
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
    }
    
    document.getElementById(`actions-${id}`).innerHTML = '<div style="font-size: 10px; font-weight: 700; color: var(--success);">SAVED</div>';
}

function removeItem(id) { 
    const e = document.getElementById(`file-${id}`); 
    if (e) e.remove(); 
    delete activeTransfers[id]; 
    if (Object.keys(activeTransfers).length === 0) {
        document.getElementById('no-files-msg').style.display = 'block'; 
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
}

document.addEventListener('DOMContentLoaded', () => {
    initPeer();
    
    document.getElementById('btn-join-scan').addEventListener('click', () => toggleJoin(true));
    document.getElementById('btn-cancel-scan').addEventListener('click', () => toggleJoin(false));
    document.getElementById('file-input').addEventListener('change', function() { handleFileSelect(this) });
});
