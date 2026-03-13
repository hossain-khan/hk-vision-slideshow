const API_URL = 'https://vision.hossainkhan.com/photos.json';
const AUTOPLAY_INTERVAL = 5000;

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
  if (document.getElementById('slideshow').hidden) return;
  switch (e.key) {
    case 'Escape':
      console.log('[HK Vision] keyboard: Escape - closing slideshow');
      closeSlideshow();
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
  }
});

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
