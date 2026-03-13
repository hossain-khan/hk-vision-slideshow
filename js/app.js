const API_URL = 'https://vision.hossainkhan.com/photos.json';
const AUTOPLAY_INTERVAL = 5000;

const state = {
  featuredPhotos: [],
  blogPhotos: [],
  currentPhotos: [],
  slideshowIndex: 0,
  autoplayTimer: null,
  autoplayActive: false,
  touchStartX: 0,
};

// --- Data Fetching ---

async function fetchPhotos() {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const gallery = document.getElementById('gallery');
  const startContainer = document.getElementById('slideshow-start-container');

  loading.hidden = false;
  error.hidden = true;
  gallery.hidden = true;
  startContainer.hidden = true;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.featuredPhotos = data.featured_photos || [];
    state.blogPhotos = data.blog_photos || [];
    loading.hidden = true;
    gallery.hidden = false;
    startContainer.hidden = false;
    updateTabCounts();
    switchTab('featured');
  } catch (e) {
    console.error('Failed to load photos:', e);
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
}

function switchTab(section) {
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

  renderGrid(state.currentPhotos);
}

// --- Grid Rendering ---

function renderGrid(photos) {
  var gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  var frag = document.createDocumentFragment();

  photos.forEach(function(photo, i) {
    var card = document.createElement('div');
    card.className = 'photo-card';
    card.addEventListener('click', function() { openSlideshow(i); });

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
}

// --- Slideshow ---

function openSlideshow(index) {
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
  var slideshow = document.getElementById('slideshow');
  stopAutoplay();
  slideshow.classList.remove('visible');
  setTimeout(function() {
    slideshow.hidden = true;
  }, 300);
  document.body.classList.remove('slideshow-open');
}

function updateSlideshow() {
  var photo = state.currentPhotos[state.slideshowIndex];
  if (!photo) return;

  var img = document.getElementById('slideshow-img');
  var titleEl = document.getElementById('slideshow-title');
  var subtitleEl = document.getElementById('slideshow-subtitle');
  var dateEl = document.getElementById('slideshow-date');
  var counterEl = document.getElementById('slideshow-counter');
  var linkEl = document.getElementById('slideshow-link');

  img.classList.add('fading');
  setTimeout(function() {
    img.src = photo.image_src;
    img.alt = photo.title;
    titleEl.textContent = photo.title;
    subtitleEl.textContent = photo.subtitle;
    dateEl.textContent = formatDate(photo.date);
    counterEl.textContent = (state.slideshowIndex + 1) + ' / ' + state.currentPhotos.length;
    linkEl.href = photo.web_uri;
  }, 150);

  img.onload = function() {
    img.classList.remove('fading');
  };

  preloadAdjacent();
}

function navigateSlideshow(dir) {
  var len = state.currentPhotos.length;
  state.slideshowIndex = (state.slideshowIndex + dir + len) % len;
  updateSlideshow();
}

function formatDate(dateStr) {
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function preloadAdjacent() {
  var len = state.currentPhotos.length;
  [-1, 1].forEach(function(offset) {
    var idx = (state.slideshowIndex + offset + len) % len;
    var img = new Image();
    img.src = state.currentPhotos[idx].image_src;
  });
}

// --- Autoplay ---

function toggleAutoplay() {
  var btn = document.getElementById('autoplay-btn');
  if (state.autoplayActive) {
    stopAutoplay();
  } else {
    state.autoplayActive = true;
    btn.classList.add('active');
    btn.textContent = '\u23F8 Pause';
    state.autoplayTimer = setInterval(function() { navigateSlideshow(1); }, AUTOPLAY_INTERVAL);
  }
}

function stopAutoplay() {
  var btn = document.getElementById('autoplay-btn');
  state.autoplayActive = false;
  btn.classList.remove('active');
  btn.textContent = '\u25B6 Auto';
  clearInterval(state.autoplayTimer);
  state.autoplayTimer = null;
}

// --- Event Listeners (set up after DOM ready via defer) ---

// Tabs
document.querySelectorAll('.tab').forEach(function(btn) {
  btn.addEventListener('click', function() { switchTab(btn.dataset.section); });
});

// Start Slideshow button
document.getElementById('start-slideshow-btn').addEventListener('click', function() {
  if (state.currentPhotos.length > 0) {
    openSlideshow(0);
    toggleAutoplay();
  }
});

// Slideshow buttons
document.querySelector('.slideshow-close').addEventListener('click', closeSlideshow);
document.querySelector('.slideshow-prev').addEventListener('click', function() { navigateSlideshow(-1); });
document.querySelector('.slideshow-next').addEventListener('click', function() { navigateSlideshow(1); });
document.getElementById('autoplay-btn').addEventListener('click', toggleAutoplay);
document.getElementById('retry-btn').addEventListener('click', fetchPhotos);

// Close on background click
document.getElementById('slideshow').addEventListener('click', function(e) {
  if (e.target === document.getElementById('slideshow')) closeSlideshow();
});

// Keyboard
document.addEventListener('keydown', function(e) {
  if (document.getElementById('slideshow').hidden) return;
  switch (e.key) {
    case 'Escape': closeSlideshow(); break;
    case 'ArrowLeft': navigateSlideshow(-1); break;
    case 'ArrowRight': navigateSlideshow(1); break;
    case ' ':
      e.preventDefault();
      toggleAutoplay();
      break;
  }
});

// Touch swipe
document.getElementById('slideshow').addEventListener('touchstart', function(e) {
  state.touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.getElementById('slideshow').addEventListener('touchend', function(e) {
  var delta = e.changedTouches[0].screenX - state.touchStartX;
  if (Math.abs(delta) > 50) {
    navigateSlideshow(delta > 0 ? -1 : 1);
  }
}, { passive: true });

// --- Init ---
fetchPhotos();
