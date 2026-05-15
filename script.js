// --- Variáveis Globais e Referências DOM ---
const captureScreen = document.getElementById('capture-screen');
const analysisScreen = document.getElementById('analysis-screen');
const photoInput = document.getElementById('photo-input');
const capturePhotoBtn = document.getElementById('capture-photo-btn');
const backToCaptureBtn = document.getElementById('back-to-capture');
const analysisPhoto = document.getElementById('analysis-photo');
const aiOverlayCanvas = document.getElementById('ai-overlay-canvas');
const manualCanvas = document.getElementById('manual-canvas');
const aiAnalyzingOverlay = document.querySelector('.ai-analyzing-overlay');
const analysisModeBtn = document.querySelector('.mode-pill[data-mode="analysis"]');
const designModeBtn = document.querySelector('.mode-pill[data-mode="design"]');
const designTools = document.getElementById('design-tools');
const analysisResults = document.getElementById('analysis-results');
const valVertical = document.getElementById('val-vertical');
const valHorizontal = document.getElementById('val-horizontal');
const valArco = document.getElementById('val-arco');
const brushToolBtn = document.getElementById('brush-tool');
const eraserToolBtn = document.getElementById('eraser-tool');
const undoBtn = document.getElementById('undo-btn');
const clearBtn = document.getElementById('clear-btn');
const finalizeDesignBtn = document.getElementById('finalize-design-btn');

const aiCtx = aiOverlayCanvas.getContext('2d');
const manualCtx = manualCanvas.getContext('2d');

let detector; // Variável para o modelo Face Mesh
let lastDetectedEyebrowPoints = null; // Armazena os pontos da IA
let currentImageElement = null; // A imagem original que está sendo analisada

// --- Variáveis para Desenho Manual ---
let isDrawing = false;
let currentTool = 'brush'; // 'brush' ou 'eraser'
let history = []; // Array para armazenar os estados do canvas para Undo
let historyPointer = -1;
const MAX_HISTORY_STATES = 20;

// --- Variáveis para Ajustes de Visagismo ---
let arcoAlturaOffset = 0;
let caudaComprimentoOffset = 0;
let espessuraSobrancelhaOffset = 0;

// --- Funções de Utilitário ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function showLoading(show) {
    aiAnalyzingOverlay.style.display = show ? 'flex' : 'none';
}

// --- Funções de IA (MediaPipe Face Mesh) ---
async function initFaceMesh() {
    if (detector) return;
    console.log("Iniciando IA...");
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detectorConfig = {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
    };
    detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
    console.log("IA pronta para análise.");
}

async function analizarFoto(imgElement) {
    showLoading(true);
    await initFaceMesh();

    // Redimensiona os canvases para a imagem exibida
    aiOverlayCanvas.width = imgElement.offsetWidth;
    aiOverlayCanvas.height = imgElement.offsetHeight;
    manualCanvas.width = imgElement.offsetWidth;
    manualCanvas.height = imgElement.offsetHeight;

    const faces = await detector.estimateFaces(imgElement, { flipHorizontal: false });

    showLoading(false);

    if (faces.length > 0) {
        const face = faces[0];
        // Filtrar apenas os pontos das sobrancelhas e outros pontos faciais relevantes
        // (Você precisará ajustar os índices ou nomes conforme a documentação do MediaPipe)
        const allKeypoints = face.keypoints;
        const eyebrowPoints = allKeypoints.filter(kp => 
            kp.name && (kp.name.includes('leftEyebrow') || kp.name.includes('rightEyebrow'))
        );
        // Exemplo de como pegar pontos de olho/nariz (ajuste os nomes/índices)
        const leftEyePoints = allKeypoints.filter(kp => kp.name && kp.name.includes('leftEye'));
        const rightEyePoints = allKeypoints.filter(kp => kp.name && kp.name.includes('rightEye'));
        const noseTipPoint = allKeypoints.find(kp => kp.name && kp.name === 'noseTip');
        const leftEyeOuterCorner = allKeypoints.find(kp => kp.name && kp.name === 'leftEyeOuterCorner');
        const rightEyeOuterCorner = allKeypoints.find(kp => kp.name && kp.name === 'rightEyeOuterCorner');
        const leftEyeInnerCorner = allKeypoints.find(kp => kp.name && kp.name === 'leftEyeInnerCorner');
        const rightEyeInnerCorner = allKeypoints.find(kp => kp.name && kp.name === 'rightEyeInnerCorner');
        const noseBottom = allKeypoints.find(kp => kp.name && kp.name === 'noseBottom');

        // Combinar todos os pontos necessários para análise e design
        lastDetectedEyebrowPoints = [
            ...eyebrowPoints, 
            leftEyeOuterCorner, rightEyeOuterCorner, 
            leftEyeInnerCorner, rightEyeInnerCorner, 
            noseTipPoint, noseBottom
        ].filter(Boolean);
        currentImageElement = imgElement;
        
        console.log("Landmarks detectados:", lastDetectedEyebrowPoints);
        
        // Chamar as funções de visualização e resultados
        switchMode('analysis'); // Garante que estamos no modo análise
        drawAsymmetryLines(lastDetectedEyebrowPoints, currentImageElement);
        displayAsymmetryResults(lastDetectedEyebrowPoints, currentImageElement);
        
        return lastDetectedEyebrowPoints;
    } else {
        alert("Nenhum rosto detectado. Tente uma foto mais clara!");
        showScreen('capture-screen'); // Volta para a tela de captura
        return null;
    }
}

// --- Funções de Cálculo e Exibição de Assimetria ---
function displayAsymmetryResults(eyebrowPoints, imageElement) {
    if (!eyebrowPoints || eyebrowPoints.length === 0) {
        valVertical.textContent = '--';
        valHorizontal.textContent = '--';
        valArco.textContent = '--';
        return;
    }

    // Filtrar pontos específicos para cálculo (ajuste os nomes/índices)
    const leftEyebrow = eyebrowPoints.filter(p => p.name && p.name.includes('leftEyebrow'));
    const rightEyebrow = eyebrowPoints.filter(p => p.name && p.name.includes('rightEyebrow'));
    const noseTip = eyebrowPoints.find(p => p.name && p.name === 'noseTip');
    const leftEyeOuter = eyebrowPoints.find(p => p.name && p.name === 'leftEyeOuterCorner');
    const rightEyeOuter = eyebrowPoints.find(p => p.name && p.name === 'rightEyeOuterCorner');

    if (leftEyebrow.length < 3 || rightEyebrow.length < 3 || !noseTip || !leftEyeOuter || !rightEyeOuter) {
        valVertical.textContent = 'N/A';
        valHorizontal.textContent = 'N/A';
        valArco.textContent = 'N/A';
        return;
    }

    // --- Cálculo de Assimetria Vertical (Exemplo: altura do arco) ---
    // Usar o ponto mais alto da sobrancelha (arco)
    const leftArcY = leftEyebrow[Math.floor(leftEyebrow.length * 0.6)].y; // Ponto aproximado do arco
    const rightArcY = rightEyebrow[Math.floor(rightEyebrow.length * 0.6)].y;
    const verticalDiff = Math.abs(leftArcY - rightArcY);
    valVertical.textContent = `${verticalDiff.toFixed(1)}px`;

    // --- Cálculo de Assimetria Horizontal (Exemplo: distância do início ao centro) ---
    // Usar o centro do nariz como referência para o eixo Y
    const centerX = noseTip.x; 
    const leftStartX = leftEyebrow[0].x; // Início da sobrancelha esquerda
    const rightStartX = rightEyebrow[0].x; // Início da sobrancelha direita
    
    const distLeftToCenter = Math.abs(leftStartX - centerX);
    const distRightToCenter = Math.abs(centerX - rightStartX);
    const horizontalDiff = Math.abs(distLeftToCenter - distRightToCenter);
    valHorizontal.textContent = `${horizontalDiff.toFixed(1)}px`;

    // --- Cálculo de Desvio do Arco (Exemplo: curvatura relativa) ---
    // Distância vertical do arco em relação à linha que conecta início e fim
    const leftArcPoint = leftEyebrow[Math.floor(leftEyebrow.length * 0.6)];
    const leftStartPoint = leftEyebrow[0];
    const leftEndPoint = leftEyebrow[leftEyebrow.length - 1];
    
    const rightArcPoint = rightEyebrow[Math.floor(rightEyebrow.length * 0.6)];
    const rightStartPoint = rightEyebrow[0];
    const rightEndPoint = rightEyebrow[rightEyebrow.length - 1];

    // Função auxiliar para calcular a distância de um ponto a uma linha
    function distToLine(p, a, b) {
        const normalLength = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
        if (normalLength === 0) return 0; // Evita divisão por zero
        return Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / normalLength;
    }

    const leftArcDeviation = distToLine(leftArcPoint, leftStartPoint, leftEndPoint);
    const rightArcDeviation = distToLine(rightArcPoint, rightStartPoint, rightEndPoint);
    const arcoDiff = Math.abs(leftArcDeviation - rightArcDeviation);
    valArco.textContent = `${arcoDiff.toFixed(1)}px`;
}

// --- Funções de Desenho no Canvas ---
function drawAsymmetryLines(eyebrowPoints, imageElement) {
    aiCtx.clearRect(0, 0, aiOverlayCanvas.width, aiOverlayCanvas.height);

    if (!eyebrowPoints || eyebrowPoints.length === 0) return;

    const leftEyebrow = eyebrowPoints.filter(p => p.name && p.name.includes('leftEyebrow'));
    const rightEyebrow = eyebrowPoints.filter(p => p.name && p.name.includes('rightEyebrow'));
    const noseTip = eyebrowPoints.find(p => p.name && p.name === 'noseTip');

    if (!noseTip) return;

    // Desenhar a sobrancelha esquerda (referência)
    aiCtx.strokeStyle = 'rgba(0, 200, 0, 0.7)'; // Verde
    aiCtx.lineWidth = 2;
    aiCtx.beginPath();
    if (leftEyebrow.length > 0) {
        aiCtx.moveTo(leftEyebrow[0].x, leftEyebrow[0].y);
        leftEyebrow.forEach(p => aiCtx.lineTo(p.x, p.y));
    }
    aiCtx.stroke();

    // Desenhar a sobrancelha direita (comparada)
    aiCtx.strokeStyle = 'rgba(255, 0, 0, 0.7)'; // Vermelho
    aiCtx.beginPath();
    if (rightEyebrow.length > 0) {
        aiCtx.moveTo(rightEyebrow[0].x, rightEyebrow[0].y);
        rightEyebrow.forEach(p => aiCtx.lineTo(p.x, p.y));
    }
    aiCtx.stroke();

    // Desenhar a "sobrancelha espelhada" (projeção ideal)
    aiCtx.strokeStyle = 'rgba(255, 255, 0, 0.7)'; // Amarelo
    aiCtx.setLineDash([5, 5]); // Linha tracejada
    aiCtx.beginPath();

    const centerX = noseTip.x; // Usar o nariz como eixo central

    if (leftEyebrow.length > 0) {
        const mirroredLeftEyebrow = leftEyebrow.map(p => ({
            x: centerX + (centerX - p.x), // Espelha em relação ao centro do nariz
            y: p.y
        }));
        aiCtx.moveTo(mirroredLeftEyebrow[0].x, mirroredLeftEyebrow[0].y);
        mirroredLeftEyebrow.forEach(p => aiCtx.lineTo(p.x, p.y));
    }
    aiCtx.stroke();
    aiCtx.setLineDash([]); // Volta para linha sólida
}

function drawAIDesignSuggestion(eyebrowPoints, imageElement) {
    aiCtx.clearRect(0, 0, aiOverlayCanvas.width, aiOverlayCanvas.height);

    if (!eyebrowPoints || eyebrowPoints.length === 0) return;

    aiCtx.strokeStyle = 'rgba(201, 169, 110, 0.9)'; // Gold
    aiCtx.lineWidth = 3 + espessuraSobrancelhaOffset; // Aplica offset de espessura
    aiCtx.lineCap = 'round';
    aiCtx.lineJoin = 'round';
    aiCtx.setLineDash([]);

    // Filtrar pontos faciais essenciais para visagismo (ajuste os nomes/índices)
    const leftEyeOuter = eyebrowPoints.find(p => p.name && p.name === 'leftEyeOuterCorner');
    const rightEyeOuter = eyebrowPoints.find(p => p.name && p.name === 'rightEyeOuterCorner');
    const leftEyeInner = eyebrowPoints.find(p => p.name && p.name === 'leftEyeInnerCorner');
    const rightEyeInner = eyebrowPoints.find(p => p.name && p.name === 'rightEyeInnerCorner');
    const noseTip = eyebrowPoints.find(p => p.name && p.name === 'noseTip');
    const noseBottom = eyebrowPoints.find(p => p.name && p.name === 'noseBottom');

    if (!leftEyeOuter || !rightEyeOuter || !leftEyeInner || !rightEyeInner || !noseTip || !noseBottom) {
        console.warn("Pontos faciais essenciais para visagismo não encontrados.");
        return;
    }

    // --- CÁLCULO DO DESIGN IDEAL (COM AJUSTES DE VISAGISMO) ---
    // Estes são cálculos heurísticos. Refine com suas regras de visagismo!

    // Ponto de Início Ideal (alinhado com a aba do nariz e canto interno do olho)
    const idealLeftStart = {
        x: leftEyeInner.x - (leftEyeInner.x - noseBottom.x) * 0.2, // Ajuste fino
        y: leftEyeInner.y + (noseBottom.y - leftEyeInner.y) * 0.1
    };
    const idealRightStart = {
        x: rightEyeInner.x + (noseBottom.x - rightEyeInner.x) * 0.2, // Ajuste fino
        y: rightEyeInner.y + (noseBottom.y - rightEyeInner.y) * 0.1
    };

    // Ponto do Arco Ideal (alinhado com o canto externo da íris ou 2/3 do olho)
    const leftEyeWidth = leftEyeOuter.x - leftEyeInner.x;
    const rightEyeWidth = rightEyeOuter.x - rightEyeInner.x;

    const idealLeftArc = {
        x: leftEyeInner.x + leftEyeWidth * 0.6, // 60% da largura do olho
        y: leftEyeInner.y - (imageElement.height * 0.05) + arcoAlturaOffset // Aplica offset
    };
    const idealRightArc = {
        x: rightEyeInner.x + rightEyeWidth * 0.4, // 40% da largura do olho (espelhado)
        y: rightEyeInner.y - (imageElement.height * 0.05) + arcoAlturaOffset // Aplica offset
    };

    // Ponto Final Ideal (alinhado com a aba do nariz e o canto externo do olho)
    const idealLeftEnd = {
        x: leftEyeOuter.x + (noseBottom.x - leftEyeOuter.x) * 0.5 + caudaComprimentoOffset, // Aplica offset
        y: leftEyeOuter.y + (noseBottom.y - leftEyeOuter.y) * 0.2
    };
    const idealRightEnd = {
        x: rightEyeOuter.x - (rightEyeOuter.x - noseBottom.x) * 0.5 - caudaComprimentoOffset, // Aplica offset (inverte)
        y: rightEyeOuter.y + (rightEyeOuter.y - noseBottom.y) * 0.2
    };

    // --- Desenha a Sugestão de Design para a Sobrancelha Esquerda ---
    aiCtx.beginPath();
    aiCtx.moveTo(idealLeftStart.x, idealLeftStart.y);
    aiCtx.quadraticCurveTo(idealLeftArc.x, idealLeftArc.y, idealLeftEnd.x, idealLeftEnd.y);
    aiCtx.stroke();

    // --- Desenha a Sugestão de Design para a Sobrancelha Direita ---
    aiCtx.beginPath();
    aiCtx.moveTo(idealRightStart.x, idealRightStart.y);
    aiCtx.quadraticCurveTo(idealRightArc.x, idealRightArc.y, idealRightEnd.x, idealRightEnd.y);
    aiCtx.stroke();
}

// --- Funções de Desenho Manual (Pincel/Borracha) ---
function activarPincel() {
    manualCtx.globalCompositeOperation = 'source-over';
    manualCtx.lineWidth = 3; // Padrão do pincel
    brushToolBtn.classList.add('active');
    eraserToolBtn.classList.remove('active');
    currentTool = 'brush';
}

function activarBorracha() {
    manualCtx.globalCompositeOperation = 'destination-out';
    manualCtx.lineWidth = 15; // Borracha mais grossa
    eraserToolBtn.classList.add('active');
    brushToolBtn.classList.remove('active');
    currentTool = 'eraser';
}

function saveCanvasState() {
    if (historyPointer < history.length - 1) {
        history = history.slice(0, historyPointer + 1);
    }
    if (history.length >= MAX_HISTORY_STATES) {
        history.shift();
        historyPointer--;
    }
    history.push(manualCanvas.toDataURL());
    historyPointer++;
    console.log(`Estado salvo. Histórico: ${history.length}, Ponteiro: ${historyPointer}`);
}

function undoLastAction() {
    if (historyPointer > 0) {
        historyPointer--;
        const img = new Image();
        img.src = history[historyPointer];
        img.onload = () => {
            manualCtx.clearRect(0, 0, manualCanvas.width, manualCanvas.height);
            manualCtx.drawImage(img, 0, 0, manualCanvas.width, manualCanvas.height);
            console.log(`Undo. Histórico: ${history.length}, Ponteiro: ${historyPointer}`);
        };
    } else if (historyPointer === 0) { // Se for o primeiro estado, limpa tudo
        manualCtx.clearRect(0, 0, manualCanvas.width, manualCanvas.height);
        history = [];
        historyPointer = -1;
        console.log("Não há mais ações para desfazer. Canvas limpo.");
    } else {
        console.log("Não há ações para desfazer.");
    }
}

function clearManualDrawing() {
    if (confirm("Tem certeza que deseja limpar todo o desenho manual?")) {
        manualCtx.clearRect(0, 0, manualCanvas.width, manualCanvas.height);
        history = [];
        historyPointer = -1;
        console.log("Desenho manual limpo. Histórico resetado.");
    }
}

// --- Funções de Alternância de Modo ---
let currentMode = 'analysis'; // Estado inicial

function switchMode(mode) {
    if (currentMode === mode) return;

    analysisModeBtn.classList.remove('active');
    designModeBtn.classList.remove('active');
    document.querySelector(`.mode-pill[data-mode="${mode}"]`).classList.add('active');

    currentMode = mode;

    if (mode === 'analysis') {
        aiOverlayCanvas.style.display = 'block';
        manualCanvas.style.display = 'none';
        designTools.style.display = 'none';
        analysisResults.style.display = 'grid';

        if (lastDetectedEyebrowPoints && currentImageElement) {
            drawAsymmetryLines(lastDetectedEyebrowPoints, currentImageElement);
            displayAsymmetryResults(lastDetectedEyebrowPoints, currentImageElement);
        }
    } else if (mode === 'design') {
        aiOverlayCanvas.style.display = 'block'; // Mantém a sugestão da IA visível
        manualCanvas.style.display = 'block';
        designTools.style.display = 'flex';
        analysisResults.style.display = 'none';

        // Limpa os resultados textuais
        valVertical.textContent = '--';
        valHorizontal.textContent = '--';
        valArco.textContent = '--';

        // Garante que os sliders estejam com os valores iniciais (0) e redesenha
        document.getElementById('arco-altura').value = 0;
        document.getElementById('cauda-comprimento').value = 0;
        document.getElementById('espessura-sobrancelha').value = 0;
        updateDesignParameters(); // Chama para inicializar os offsets e desenhar
        activarPincel(); // Ativa o pincel por padrão no modo design
    }
}

// --- Funções de Ajustes de Visagismo ---
function updateDesignParameters() {
    arcoAlturaOffset = parseInt(document.getElementById('arco-altura').value);
    caudaComprimentoOffset = parseInt(document.getElementById('cauda-comprimento').value);
    espessuraSobrancelhaOffset = parseInt(document.getElementById('espessura-sobrancelha').value);

    document.getElementById('arco-altura-val').textContent = arcoAlturaOffset;
    document.getElementById('cauda-comprimento-val').textContent = caudaComprimentoOffset;
    document.getElementById('espessura-sobrancelha-val').textContent = espessuraSobrancelhaOffset;

    if (lastDetectedEyebrowPoints && currentImageElement) {
        drawAIDesignSuggestion(lastDetectedEyebrowPoints, currentImageElement);
    }
}

// --- Funções de Finalização e Exportação ---
function combineCanvasesAndImage() {
    const finalCanvas = document.createElement('canvas');
    // Usa a resolução original da foto para o canvas final
    finalCanvas.width = analysisPhoto.naturalWidth;
    finalCanvas.height = analysisPhoto.naturalHeight;
    const finalCtx = finalCanvas.getContext('2d');

    // 1. Desenha a foto original como base
    finalCtx.drawImage(analysisPhoto, 0, 0, finalCanvas.width, finalCanvas.height);

    // 2. Desenha o ai-overlay-canvas (sugestão da IA ou linhas de assimetria)
    // É importante desenhar na resolução original da foto, não na resolução da tela.
    const scaleX = finalCanvas.width / aiOverlayCanvas.width;
    const scaleY = finalCanvas.height / aiOverlayCanvas.height;

    finalCtx.save();
    finalCtx.scale(scaleX, scaleY);
    finalCtx.drawImage(aiOverlayCanvas, 0, 0);
    finalCtx.restore();

    // 3. Desenha o manual-canvas (desenhos da designer)
    finalCtx.save();
    finalCtx.scale(scaleX, scaleY);
    finalCtx.drawImage(manualCanvas, 0, 0);
    finalCtx.restore();

    return finalCanvas;
}

function exportCombinedImage() {
    const combinedCanvas = combineCanvasesAndImage();

    const link = document.createElement('a');
    link.download = 'brow_harmony_design.png';
    link.href = combinedCanvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert("Design finalizado e salvo na sua galeria!");
}

// --- Event Listeners ---
// Captura de foto
capturePhotoBtn.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            analysisPhoto.src = e.target.result;
            analysisPhoto.onload = () => {
                showScreen('analysis-screen');
                analizarFoto(analysisPhoto);
            };
        };
        reader.readAsDataURL(file);
    }
});

// Voltar para captura
backToCaptureBtn.addEventListener('click', () => {
    showScreen('capture-screen');
    // Limpa canvases e reseta estados ao voltar
    aiCtx.clearRect(0, 0, aiOverlayCanvas.width, aiOverlayCanvas.height);
    manualCtx.clearRect(0, 0, manualCanvas.width, manualCanvas.height);
    lastDetectedEyebrowPoints = null;
    currentImageElement = null;
    history = [];
    historyPointer = -1;
});

// Alternar modos
analysisModeBtn.addEventListener('click', () => switchMode('analysis'));
designModeBtn.addEventListener('click', () => switchMode('design'));

// Ferramentas de desenho
brushToolBtn.addEventListener('click', activarPincel);
eraserToolBtn.addEventListener('click', activarBorracha);
undoBtn.addEventListener('click', undoLastAction);
clearBtn.addEventListener('click', clearManualDrawing);

// Sliders de visagismo
document.getElementById('arco-altura').addEventListener('input', updateDesignParameters);
document.getElementById('cauda-comprimento').addEventListener('input', updateDesignParameters);
document.getElementById('espessura-sobrancelha').addEventListener('input', updateDesignParameters);

// Finalizar design
finalizeDesignBtn.addEventListener('click', exportCombinedImage);

// --- Lógica de Desenho Manual (Mouse/Touch) ---
let lastX = 0;
let lastY = 0;

function draw(e) {
    if (!isDrawing) return;
    manualCtx.beginPath();
    manualCtx.moveTo(lastX, lastY);
    manualCtx.lineTo(e.offsetX, e.offsetY);
    manualCtx.stroke();
    [lastX, lastY] = [e.offsetX, e.offsetY];
}

manualCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
});

manualCanvas.addEventListener('mousemove', draw);
manualCanvas.addEventListener('mouseup', () => {
    isDrawing = false;
    saveCanvasState(); // Salva o estado após o traço ser concluído
});
manualCanvas.addEventListener('mouseout', () => {
    if (isDrawing) { // Se o mouse sair enquanto desenha, finalize o traço
        isDrawing = false;
        saveCanvasState();
    }
});

// Suporte a Touch (para mobile)
manualCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Previne o scroll da página
    isDrawing = true;
    const touch = e.touches[0];
    const rect = manualCanvas.getBoundingClientRect();
    [lastX, lastY] = [touch.clientX - rect.left, touch.clientY - rect.top];
});

manualCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Previne o scroll da página
    if (!isDrawing) return;
    const touch = e.touches[0];
    const rect = manualCanvas.getBoundingClientRect();
    manualCtx.beginPath();
    manualCtx.moveTo(lastX, lastY);
    manualCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    manualCtx.stroke();
    [lastX, lastY] = [touch.clientX - rect.left, touch.clientY - rect.top];
});

manualCanvas.addEventListener('touchend', () => {
    isDrawing = false;
    saveCanvasState();
});
manualCanvas.addEventListener('touchcancel', () => {
    if (isDrawing) {
        isDrawing = false;
        saveCanvasState();
    }
});

// --- Inicialização ---
// Ativa o pincel por padrão ao carregar a tela (se for o modo design)
activarPincel();
