const API_URL = 'https://vision.hossainkhan.com/photos.json';
const AUTOPLAY_INTERVAL = 5000;
const ZEN_INTERVAL = 60000;  // 1 minute per image
const ZEN_FADE_MS  = 2500;   // must match CSS transition on .zen-img

console.log('[HK Vision] App initializing. API_URL:', API_URL);

const state = {
  featuredPhotos: [],
  blogPhotos: [],
  currentPhotos: [],
  slideshowIndex: 0,
  autoplayTimer: null,
  autoplayActive: false,
  touchStartX: 0,
  updateTimer: null,  // tracks pending slideshow image-swap timeout
};

const zenState = {
  active: false,
  index: 0,
  frontIsA: true,  // true = img-a is visible, false = img-b is visible
  timer: null,
  hintTimer: null,
};

// --- Data Fetching ---

async function fetchPhotos() {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const gallery = document.getElementById('gallery');
  const startContainer = document.getElementById('slideshow-start-container');

  console.log('[HK Vision] fetchPhotos: starting request to', API_URL);
  loading.hidden = false;
  error.hidden = true;
  gallery.hidden = true;
  startContainer.hidden = true;

  try {
    const res = await fetch(API_URL);
    console.log('[HK Vision] fetchPhotos: response status', res.status, res.ok ? '(OK)' : '(FAILED)');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    console.log('[HK Vision] fetchPhotos: received data keys:', Object.keys(data));
    state.featuredPhotos = data.featured_photos || [];
    state.blogPhotos = data.blog_photos || [];
    console.log('[HK Vision] fetchPhotos: loaded', state.featuredPhotos.length, 'featured and', state.blogPhotos.length, 'blog photos');
    loading.hidden = true;
    gallery.hidden = false;
    startContainer.hidden = false;
    updateTabCounts();
    switchTab('featured');
  } catch (e) {
    console.error('[HK Vision] fetchPhotos: FAILED -', e.message, e);
    loading.hidden = true;
    error.hidden = false;
  }
}

// --- Tabs ---

function updateTabCounts() {
  document.querySelectorAll('.tab').forEach(function(btn) {
    var section = btn.dataset.section;
    if (section === 'featured') btn.textContent = 'Featured (' + state.featuredPhotos.length + ')';
    else if (section === 'blog') btn.textContent = 'Blog (' + state.blogPhotos.length + ')';
    else if (section === 'all') btn.textContent = 'All (' + (state.featuredPhotos.length + state.blogPhotos.length) + ')';
  });
  console.log('[HK Vision] updateTabCounts: featured=' + state.featuredPhotos.length + ', blog=' + state.blogPhotos.length);
}

function switchTab(section) {
  console.log('[HK Vision] switchTab:', section);
  document.querySelectorAll('.tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.section === section);
  });

  if (section === 'featured') {
    state.currentPhotos = state.featuredPhotos;
  } else if (section === 'blog') {
    state.currentPhotos = state.blogPhotos;
  } else {
    state.currentPhotos = state.featuredPhotos.concat(state.blogPhotos).sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  }

  console.log('[HK Vision] switchTab:', section, '- showing', state.currentPhotos.length, 'photos');
  renderGrid(state.currentPhotos);
}

// --- Grid Rendering ---

function renderGrid(photos) {
  console.log('[HK Vision] renderGrid: rendering', photos.length, 'photos');
  var gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  var frag = document.createDocumentFragment();

  photos.forEach(function(photo, i) {
    var card = document.createElement('div');
    card.className = 'photo-card';
    card.addEventListener('click', function() {
      console.log('[HK Vision] photo card clicked: index', i, '-', photo.title);
      openSlideshow(i);
    });

    var img = document.createElement('img');
    img.src = photo.image_src;
    img.alt = photo.title;
    img.loading = 'lazy';

    var overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = photo.title;

    var subtitle = document.createElement('div');
    subtitle.className = 'card-subtitle';
    subtitle.textContent = photo.subtitle;

    overlay.appendChild(title);
    overlay.appendChild(subtitle);
    card.appendChild(img);
    card.appendChild(overlay);
    frag.appendChild(card);
  });

  gallery.appendChild(frag);
  console.log('[HK Vision] renderGrid: done, cards added to DOM');
}

// --- Slideshow ---

function openSlideshow(index) {
  console.log('[HK Vision] openSlideshow: index', index, 'of', state.currentPhotos.length, 'photos');
  var slideshow = document.getElementById('slideshow');
  state.slideshowIndex = index;
  slideshow.hidden = false;
  document.body.classList.add('slideshow-open');
  // Trigger reflow then add visible class for fade-in
  void slideshow.offsetHeight;
  slideshow.classList.add('visible');
  updateSlideshow();
}

function closeSlideshow() {
  console.log('[HK Vision] closeSlideshow');
  var slideshow = document.getElementById('slideshow');
  stopAutoplay();
  if (isFullscreen()) {
    console.log('[HK Vision] closeSlideshow: also exiting fullscreen');
    exitFullscreen();
  }
  slideshow.classList.remove('visible');
  setTimeout(function() {
    slideshow.hidden = true;
    console.log('[HK Vision] closeSlideshow: overlay hidden');
  }, 300);
  document.body.classList.remove('slideshow-open');
}

function updateSlideshow() {
  var photo = state.currentPhotos[state.slideshowIndex];
  if (!photo) {
    console.warn('[HK Vision] updateSlideshow: no photo at index', state.slideshowIndex, '(currentPhotos.length:', state.currentPhotos.length + ')');
    return;
  }

  console.log('[HK Vision] updateSlideshow: index', state.slideshowIndex, '-', photo.title, '| src:', photo.image_src);

  var img = document.getElementById('slideshow-img');
  var titleEl = document.getElementById('slideshow-title');
  var subtitleEl = document.getElementById('slideshow-subtitle');
  var dateEl = document.getElementById('slideshow-date');
  var counterEl = document.getElementById('slideshow-counter');
  var linkEl = document.getElementById('slideshow-link');

  // Cancel any pending image-swap from rapid navigation
  if (state.updateTimer !== null) {
    clearTimeout(state.updateTimer);
    console.log('[HK Vision] updateSlideshow: cancelled pending update timer');
    state.updateTimer = null;
  }

  img.classList.add('fading');

  // Assign onload/onerror INSIDE the timeout, right before changing src, so
  // they are always in sync with the src being set (fixes cached-image edge cases).
  state.updateTimer = setTimeout(function() {
    state.updateTimer = null;
    console.log('[HK Vision] updateSlideshow: setting img.src to', photo.image_src);

    // Sync blurred ambient backdrop
    document.getElementById('slideshow-backdrop').src = photo.image_src;

    img.onload = function() {
      console.log('[HK Vision] slideshow image loaded OK:', photo.image_src);
      img.classList.remove('fading');
    };
    img.onerror = function() {
      console.error('[HK Vision] slideshow image FAILED to load:', photo.image_src);
      img.classList.remove('fading'); // un-stick the fade so the UI doesn't freeze
    };

    img.src = photo.image_src;
    img.alt = photo.title;
    titleEl.textContent = photo.title;
    subtitleEl.textContent = photo.subtitle;
    dateEl.textContent = formatDate(photo.date);
    counterEl.textContent = (state.slideshowIndex + 1) + ' / ' + state.currentPhotos.length;
    linkEl.href = photo.web_uri;
  }, 150);

  preloadAdjacent();
}

function navigateSlideshow(dir) {
  var len = state.currentPhotos.length;
  var prev = state.slideshowIndex;
  state.slideshowIndex = (state.slideshowIndex + dir + len) % len;
  console.log('[HK Vision] navigateSlideshow:', dir > 0 ? 'next' : 'prev', '| index', prev, '->', state.slideshowIndex);
  updateSlideshow();
}

function formatDate(dateStr) {
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    console.warn('[HK Vision] formatDate: could not parse', dateStr, e);
    return dateStr;
  }
}

function preloadAdjacent() {
  if (state.currentPhotos.length <= 1) return;
  var len = state.currentPhotos.length;
  [-1, 1].forEach(function(offset) {
    var idx = (state.slideshowIndex + offset + len) % len;
    var preloadImg = new Image();
    preloadImg.src = state.currentPhotos[idx].image_src;
    console.log('[HK Vision] preloadAdjacent: queuing index', idx, '-', state.currentPhotos[idx].image_src);
  });
}

// --- Autoplay ---

function toggleAutoplay() {
  if (state.autoplayActive) {
    stopAutoplay();
  } else {
    console.log('[HK Vision] toggleAutoplay: starting autoplay, interval', AUTOPLAY_INTERVAL, 'ms');
    var btn = document.getElementById('autoplay-btn');
    state.autoplayActive = true;
    btn.classList.add('active');
    btn.textContent = '\u23F8 Pause';
    state.autoplayTimer = setInterval(function() { navigateSlideshow(1); }, AUTOPLAY_INTERVAL);
  }
}

function stopAutoplay() {
  if (state.autoplayActive) console.log('[HK Vision] stopAutoplay: stopping autoplay');
  var btn = document.getElementById('autoplay-btn');
  state.autoplayActive = false;
  btn.classList.remove('active');
  btn.textContent = '\u25B6 Auto';
  clearInterval(state.autoplayTimer);
  state.autoplayTimer = null;
}

// --- Fullscreen ---

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function requestFullscreen() {
  console.log('[HK Vision] requestFullscreen: requesting');
  var el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(function(e) {
      console.warn('[HK Vision] requestFullscreen failed:', e.message);
    });
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
    console.log('[HK Vision] requestFullscreen: used webkit prefix');
  } else {
    console.warn('[HK Vision] requestFullscreen: Fullscreen API not supported in this browser');
  }
}

function exitFullscreen() {
  console.log('[HK Vision] exitFullscreen: exiting');
  if (document.exitFullscreen) {
    document.exitFullscreen().catch(function(e) {
      console.warn('[HK Vision] exitFullscreen failed:', e.message);
    });
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function toggleFullscreen() {
  if (isFullscreen()) {
    exitFullscreen();
  } else {
    requestFullscreen();
  }
}

function updateFullscreenButtons() {
  var full   = isFullscreen();
  var label  = full ? '\u26F6 Exit' : '\u26F6 Full';
  var btn    = document.getElementById('fullscreen-btn');
  var zenBtn = document.getElementById('zen-fullscreen-btn');
  if (btn) {
    btn.textContent = label;
    btn.setAttribute('aria-label', full ? 'Exit fullscreen' : 'Enter fullscreen');
    btn.classList.toggle('active', full);
  }
  if (zenBtn) zenBtn.textContent = label;
  console.log('[HK Vision] fullscreenchange: isFullscreen=' + full);
}

function openZen(startIndex) {
  console.log('[HK Vision] openZen: starting at index', startIndex, 'of', state.currentPhotos.length, 'photos');
  var zen   = document.getElementById('zen');
  var imgA  = document.getElementById('zen-img-a');
  var imgB  = document.getElementById('zen-img-b');
  var hint  = document.querySelector('.zen-hint');

  zenState.active   = true;
  zenState.index    = startIndex;
  zenState.frontIsA = true;

  // Reset both slots
  imgA.src = '';
  imgB.src = '';
  imgA.classList.add('zen-img--active');
  imgB.classList.remove('zen-img--active');

  zen.hidden = false;
  document.body.classList.add('slideshow-open');
  void zen.offsetHeight;  // force reflow before adding visible
  zen.classList.add('visible');

  // Load first image into slot A
  var photo = state.currentPhotos[zenState.index];
  imgA.onload = function() {
    console.log('[HK Vision] openZen: first image loaded OK -', photo.image_src);
  };
  imgA.onerror = function() {
    console.error('[HK Vision] openZen: first image FAILED to load -', photo.image_src);
  };
  imgA.src = photo.image_src;
  imgA.alt = photo.title;
  document.getElementById('zen-backdrop').src = photo.image_src;
  console.log('[HK Vision] openZen: loading first image -', photo.image_src);

  // Show hint then fade it after 3 s
  hint.classList.remove('fade-out');
  zenState.hintTimer = setTimeout(function() {
    hint.classList.add('fade-out');
    console.log('[HK Vision] openZen: hiding hint');
  }, 3000);

  // Start advance timer
  zenState.timer = setInterval(zenAdvance, ZEN_INTERVAL);
  console.log('[HK Vision] openZen: timer started, ZEN_INTERVAL=' + ZEN_INTERVAL + 'ms, ZEN_FADE_MS=' + ZEN_FADE_MS + 'ms');

  // Preload the next image now so it's ready when the timer fires
  if (state.currentPhotos.length > 1) {
    var nextIdx = (zenState.index + 1) % state.currentPhotos.length;
    var preload = new Image();
    preload.src = state.currentPhotos[nextIdx].image_src;
    console.log('[HK Vision] openZen: preloading next image (index ' + nextIdx + ') -', preload.src);
  }
}

function zenAdvance() {
  var len       = state.currentPhotos.length;
  var nextIndex = (zenState.index + 1) % len;
  var photo     = state.currentPhotos[nextIndex];

  console.log('[HK Vision] zenAdvance: cross-fading from index', zenState.index, '->', nextIndex, '-', photo.title);

  var imgA     = document.getElementById('zen-img-a');
  var imgB     = document.getElementById('zen-img-b');
  var frontImg = zenState.frontIsA ? imgA : imgB;
  var backImg  = zenState.frontIsA ? imgB : imgA;

  // Load next photo into the back (hidden) slot, then cross-fade on load
  backImg.onload = function() {
    console.log('[HK Vision] zenAdvance: next image loaded, triggering cross-fade -', photo.image_src);
    backImg.classList.add('zen-img--active');    // fade in
    frontImg.classList.remove('zen-img--active'); // fade out
    zenState.frontIsA = !zenState.frontIsA;
    zenState.index    = nextIndex;
    document.getElementById('zen-backdrop').src = photo.image_src;
    console.log('[HK Vision] zenAdvance: backdrop updated');

    // Preload the one after next while this fade is running
    var afterNext = (nextIndex + 1) % len;
    var preload   = new Image();
    preload.src   = state.currentPhotos[afterNext].image_src;
    console.log('[HK Vision] zenAdvance: preloading index', afterNext, '-', preload.src);
  };
  backImg.onerror = function() {
    console.error('[HK Vision] zenAdvance: image FAILED to load, advancing index anyway -', photo.image_src);
    zenState.index = nextIndex;
  };
  backImg.src = photo.image_src;
  backImg.alt = photo.title;
  console.log('[HK Vision] zenAdvance: loading back-slot image -', photo.image_src);
}

function closeZen() {
  console.log('[HK Vision] closeZen');
  zenState.active = false;
  clearInterval(zenState.timer);
  zenState.timer = null;
  clearTimeout(zenState.hintTimer);
  zenState.hintTimer = null;
  if (isFullscreen()) {
    console.log('[HK Vision] closeZen: also exiting fullscreen');
    exitFullscreen();
  }

  var zen = document.getElementById('zen');
  zen.classList.remove('visible');
  // Wait for overlay fade-out transition before hiding
  setTimeout(function() {
    zen.hidden = true;
    document.getElementById('zen-img-a').src = '';
    document.getElementById('zen-img-b').src = '';
    document.getElementById('zen-backdrop').src = '';
    console.log('[HK Vision] closeZen: overlay hidden and image memory freed');
  }, 650); // slightly longer than CSS 0.6s transition

  document.body.classList.remove('slideshow-open');
}

// --- Event Listeners (set up after DOM ready via defer) ---

console.log('[HK Vision] Attaching event listeners...');

// Tabs
document.querySelectorAll('.tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    console.log('[HK Vision] tab clicked:', btn.dataset.section);
    switchTab(btn.dataset.section);
  });
});

// Start Slideshow button
document.getElementById('start-slideshow-btn').addEventListener('click', function() {
  console.log('[HK Vision] start-slideshow-btn clicked, currentPhotos.length:', state.currentPhotos.length);
  if (state.currentPhotos.length > 0) {
    openSlideshow(0);
    toggleAutoplay();
  } else {
    console.warn('[HK Vision] start-slideshow-btn: no photos loaded yet');
  }
});

// Zen View button
document.getElementById('start-zen-btn').addEventListener('click', function() {
  console.log('[HK Vision] start-zen-btn clicked, currentPhotos.length:', state.currentPhotos.length);
  if (state.currentPhotos.length > 0) {
    openZen(0);
  } else {
    console.warn('[HK Vision] start-zen-btn: no photos loaded yet');
  }
});

// Slideshow buttons
document.querySelector('.slideshow-close').addEventListener('click', function() {
  console.log('[HK Vision] close button clicked');
  closeSlideshow();
});
document.querySelector('.slideshow-prev').addEventListener('click', function() { navigateSlideshow(-1); });
document.querySelector('.slideshow-next').addEventListener('click', function() { navigateSlideshow(1); });
document.getElementById('autoplay-btn').addEventListener('click', toggleAutoplay);
document.getElementById('retry-btn').addEventListener('click', function() {
  console.log('[HK Vision] retry button clicked');
  fetchPhotos();
});

// Close on background click
document.getElementById('slideshow').addEventListener('click', function(e) {
  if (e.target === document.getElementById('slideshow')) {
    console.log('[HK Vision] slideshow backdrop clicked - closing');
    closeSlideshow();
  }
});

// Keyboard
document.addEventListener('keydown', function(e) {
  // Zen view takes priority
  if (zenState.active) {
    switch (e.key) {
      case 'Escape':
        // If we're in fullscreen, browser exits fullscreen on Esc automatically;
        // don't also close the zen overlay so user can keep watching windowed.
        if (!isFullscreen()) {
          console.log('[HK Vision] keyboard: Escape - closing zen view');
          closeZen();
        }
        break;
      case 'ArrowRight':
        console.log('[HK Vision] keyboard: ArrowRight - zen skip to next');
        clearInterval(zenState.timer);
        zenAdvance();
        zenState.timer = setInterval(zenAdvance, ZEN_INTERVAL);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        console.log('[HK Vision] keyboard: F - toggle fullscreen (zen)');
        toggleFullscreen();
        break;
    }
    return;
  }

  if (document.getElementById('slideshow').hidden) return;
  switch (e.key) {
    case 'Escape':
      // First Esc exits fullscreen (browser handles it); second Esc closes slideshow.
      if (!isFullscreen()) {
        console.log('[HK Vision] keyboard: Escape - closing slideshow');
        closeSlideshow();
      }
      break;
    case 'ArrowLeft':
      console.log('[HK Vision] keyboard: ArrowLeft');
      navigateSlideshow(-1);
      break;
    case 'ArrowRight':
      console.log('[HK Vision] keyboard: ArrowRight');
      navigateSlideshow(1);
      break;
    case ' ':
      e.preventDefault();
      console.log('[HK Vision] keyboard: Space - toggle autoplay');
      toggleAutoplay();
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      console.log('[HK Vision] keyboard: F - toggle fullscreen');
      toggleFullscreen();
      break;
  }
});

// Zen overlay: click anywhere to close (zen-fullscreen-btn stops propagation)
document.getElementById('zen').addEventListener('click', function() {
  console.log('[HK Vision] zen overlay clicked - closing');
  closeZen();
});

// Fullscreen buttons
document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
document.getElementById('zen-fullscreen-btn').addEventListener('click', function(e) {
  e.stopPropagation(); // prevent click bubbling to zen overlay (which closes zen)
  toggleFullscreen();
});

// Update button labels when fullscreen state changes (e.g. browser Esc key)
document.addEventListener('fullscreenchange', updateFullscreenButtons);
document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);

// Touch swipe
document.getElementById('slideshow').addEventListener('touchstart', function(e) {
  state.touchStartX = e.changedTouches[0].screenX;
  console.log('[HK Vision] touch start x:', state.touchStartX);
}, { passive: true });

document.getElementById('slideshow').addEventListener('touchend', function(e) {
  var delta = e.changedTouches[0].screenX - state.touchStartX;
  console.log('[HK Vision] touch end, delta:', delta);
  if (Math.abs(delta) > 50) {
    console.log('[HK Vision] swipe', delta > 0 ? 'right → prev' : 'left → next');
    navigateSlideshow(delta > 0 ? -1 : 1);
  }
}, { passive: true });

console.log('[HK Vision] Event listeners attached. Starting data fetch...');

// --- Init ---
fetchPhotos();
