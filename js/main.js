/**
 * Vampire Tales — Main JavaScript
 * Handles: chapter loading, TTS playback, audio controls, navigation
 */

const API_BASE = 'http://localhost:8770';

// State
let currentChapter = 1892;
let paragraphs = [];
let currentParaIndex = 0;
let isPlaying = false;
let audioElement = new Audio();
let nextAudioBlob = null; // Pre-fetched next paragraph audio
let prefetchController = null;

// DOM Elements
const chapterTitle = document.getElementById('chapterTitle');
const chapterText = document.getElementById('chapterText');
const chapterProgressText = document.getElementById('chapterProgressText');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const prevParaBtn = document.getElementById('prevParaBtn');
const nextParaBtn = document.getElementById('nextParaBtn');
const speedSelect = document.getElementById('speedSelect');
const volumeSlider = document.getElementById('volumeSlider');
const progressBarFill = document.getElementById('progressBarFill');
const progressBar = document.getElementById('progressBar');
const prevChapterBtn = document.getElementById('prevChapterBtn');
const nextChapterBtn = document.getElementById('nextChapterBtn');
const navChapterNum = document.getElementById('navChapterNum');
const chapterList = document.getElementById('chapterList');
const readerPanel = document.getElementById('readerPanel');

// ---- Chapter Loading ----

async function loadChapter(chapterNumber) {
    chapterText.innerHTML = '<div class="loading">Loading chapter</div>';
    chapterTitle.textContent = 'Loading...';

    try {
        const res = await fetch(`${API_BASE}/chapter?number=${chapterNumber}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        currentChapter = chapterNumber;
        paragraphs = data.content;
        currentParaIndex = 0;

        // Update title
        chapterTitle.textContent = data.title;

        // Render paragraphs
        chapterText.innerHTML = '';
        paragraphs.forEach((text, i) => {
            const p = document.createElement('p');
            p.textContent = text;
            p.dataset.index = i;
            if (i === 0) p.classList.add('reading-active');
            p.addEventListener('click', () => jumpToParagraph(i));
            chapterText.appendChild(p);
        });

        // Update navigation
        navChapterNum.textContent = `Chapter Number (${chapterNumber})`;
        prevChapterBtn.disabled = !data.prevChapter;
        nextChapterBtn.disabled = !data.nextChapter;
        prevChapterBtn.dataset.chapter = data.prevChapter || '';
        nextChapterBtn.dataset.chapter = data.nextChapter || '';

        // Update sidebar
        updateSidebarActive(chapterNumber);

        // Update progress
        updateProgressText();

        // Stop any current playback
        stopPlayback();

    } catch (err) {
        chapterText.innerHTML = `<div class="loading" style="color: var(--primary);">Error: ${err.message}</div>`;
        console.error('Failed to load chapter:', err);
    }
}

function updateSidebarActive(chapterNumber) {
    document.querySelectorAll('.chapter-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.dataset.chapter) === chapterNumber);
    });
}

function updateProgressText() {
    chapterProgressText.textContent = `Chapter ${currentChapter} — Paragraph ${currentParaIndex + 1}/${paragraphs.length}`;
    // Update progress bar
    const pct = paragraphs.length > 0 ? ((currentParaIndex + 1) / paragraphs.length) * 100 : 0;
    progressBarFill.style.width = `${pct}%`;
}

// ---- TTS Playback ----

async function fetchTTSAudio(text) {
    const voice = 'onyx';
    const speed = speedSelect.value;
    const url = `${API_BASE}/tts?text=${encodeURIComponent(text)}&voice=${voice}&speed=${speed}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('TTS request failed');
    return await res.blob();
}

async function playCurrentParagraph() {
    if (currentParaIndex >= paragraphs.length) {
        stopPlayback();
        return;
    }

    isPlaying = true;
    updatePlayPauseUI();
    highlightParagraph(currentParaIndex);
    updateProgressText();

    try {
        let audioBlob;

        // Use pre-fetched audio if available
        if (nextAudioBlob && currentParaIndex > 0) {
            audioBlob = nextAudioBlob;
            nextAudioBlob = null;
        } else {
            audioBlob = await fetchTTSAudio(paragraphs[currentParaIndex]);
        }

        // Play audio
        const audioUrl = URL.createObjectURL(audioBlob);
        audioElement.src = audioUrl;
        audioElement.volume = volumeSlider.value / 100;
        await audioElement.play();

        // Pre-fetch next paragraph
        prefetchNext();

    } catch (err) {
        console.error('Playback error:', err);
        stopPlayback();
    }
}

function prefetchNext() {
    if (currentParaIndex + 1 < paragraphs.length) {
        // Cancel any existing prefetch
        if (prefetchController) prefetchController.abort();
        prefetchController = new AbortController();

        fetchTTSAudio(paragraphs[currentParaIndex + 1])
            .then(blob => { nextAudioBlob = blob; })
            .catch(() => { nextAudioBlob = null; });
    }
}

audioElement.addEventListener('ended', () => {
    if (!isPlaying) return;
    currentParaIndex++;
    if (currentParaIndex < paragraphs.length) {
        playCurrentParagraph();
    } else {
        stopPlayback();
    }
});

function stopPlayback() {
    isPlaying = false;
    audioElement.pause();
    audioElement.currentTime = 0;
    updatePlayPauseUI();
}

function togglePlayPause() {
    if (isPlaying) {
        if (audioElement.paused) {
            audioElement.play();
        } else {
            audioElement.pause();
        }
        isPlaying = !audioElement.paused;
        updatePlayPauseUI();
    } else {
        playCurrentParagraph();
    }
}

function updatePlayPauseUI() {
    if (isPlaying && !audioElement.paused) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

// ---- Paragraph Navigation ----

function highlightParagraph(index) {
    document.querySelectorAll('.chapter-text p').forEach((p, i) => {
        p.classList.toggle('reading-active', i === index);
    });

    // Scroll to active paragraph
    const activeP = document.querySelector('.chapter-text p.reading-active');
    if (activeP) {
        activeP.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function jumpToParagraph(index) {
    currentParaIndex = index;
    highlightParagraph(index);
    updateProgressText();

    if (isPlaying) {
        nextAudioBlob = null;
        audioElement.pause();
        playCurrentParagraph();
    }
}

function skipPrevParagraph() {
    if (currentParaIndex > 0) {
        jumpToParagraph(currentParaIndex - 1);
    }
}

function skipNextParagraph() {
    if (currentParaIndex < paragraphs.length - 1) {
        jumpToParagraph(currentParaIndex + 1);
    }
}

// ---- Chapter Navigation ----

function goToPrevChapter() {
    const prev = prevChapterBtn.dataset.chapter;
    if (prev) loadChapter(parseInt(prev));
}

function goToNextChapter() {
    const next = nextChapterBtn.dataset.chapter;
    if (next) loadChapter(parseInt(next));
}

// ---- Event Listeners ----

playPauseBtn.addEventListener('click', togglePlayPause);
prevParaBtn.addEventListener('click', skipPrevParagraph);
nextParaBtn.addEventListener('click', skipNextParagraph);
prevChapterBtn.addEventListener('click', goToPrevChapter);
nextChapterBtn.addEventListener('click', goToNextChapter);

volumeSlider.addEventListener('input', () => {
    audioElement.volume = volumeSlider.value / 100;
});

speedSelect.addEventListener('change', () => {
    // Speed change requires re-generating TTS, so invalidate cache
    nextAudioBlob = null;
});

// Sidebar chapter clicks
chapterList.addEventListener('click', (e) => {
    const item = e.target.closest('.chapter-item');
    if (item) {
        loadChapter(parseInt(item.dataset.chapter));
    }
});

// Progress bar click to seek paragraph
progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const targetIndex = Math.floor(pct * paragraphs.length);
    if (targetIndex >= 0 && targetIndex < paragraphs.length) {
        jumpToParagraph(targetIndex);
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch(e.key) {
        case ' ':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'ArrowLeft':
            if (e.shiftKey) goToPrevChapter();
            else skipPrevParagraph();
            break;
        case 'ArrowRight':
            if (e.shiftKey) goToNextChapter();
            else skipNextParagraph();
            break;
    }
});

// Chapter search
const chapterSearch = document.getElementById('chapterSearch');
chapterSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const num = parseInt(chapterSearch.value);
        if (!isNaN(num) && num > 0) {
            loadChapter(num);
            chapterSearch.value = '';
            chapterSearch.blur();
        }
    }
});

// ---- Initialize ----
// Don't auto-load — the static HTML already shows chapter content
// loadChapter(1892);
