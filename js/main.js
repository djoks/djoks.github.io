(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var canObserve = 'IntersectionObserver' in window;

  function toArray(list) {
    return Array.prototype.slice.call(list);
  }

  function cssNumber(element, property, fallback) {
    var value = parseFloat(getComputedStyle(element).getPropertyValue(property));
    return isNaN(value) ? fallback : value;
  }

  function capturePointer(element, pointerId) {
    try {
      element.setPointerCapture(pointerId);
    } catch (error) {
      // Capture is optional; the drag still works without it.
    }
  }

  // Restarts a CSS animation by removing the class and adding it back after a reflow.
  function restartClass(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  // Moves a nav marker. The first placement happens without a transition so the
  // marker appears in place instead of sliding in from the corner.
  function placeMarker(marker, place) {
    if (!marker.classList.contains('is-visible')) {
      marker.classList.add('is-still');
      place();
      void marker.offsetWidth;
      marker.classList.remove('is-still');
    } else {
      place();
    }
    marker.classList.add('is-visible');
  }

  function magnetize(link, reach) {
    if (!finePointer || reduceMotion) return;
    link.addEventListener('pointermove', function (event) {
      var box = link.getBoundingClientRect();
      var dx = (event.clientX - (box.left + box.width / 2)) / box.width;
      var dy = (event.clientY - (box.top + box.height / 2)) / box.height;
      link.style.transform = 'translate(' + (dx * reach).toFixed(2) + 'px, ' + (dy * reach * 0.7).toFixed(2) + 'px)';
    });
    link.addEventListener('pointerleave', function () { link.style.transform = ''; });
  }

  // Header

  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 16);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    toArray(document.querySelectorAll('.header-social a')).forEach(function (link) { magnetize(link, 8); });
  }

  // Reveal elements as they enter the viewport.

  function initReveal() {
    var items = toArray(document.querySelectorAll('.reveal'));
    if (reduceMotion || !canObserve) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    items.forEach(function (item) { observer.observe(item); });
  }

  // Primary nav: split-flap letters on hover, a magnetic nudge toward the pointer,
  // a bordered frame on the section in view, and a dot that follows the pointer
  // along the frame's lower edge and rests on the active link.

  function splitFlapLabel(link) {
    var text = link.textContent.trim();
    link.setAttribute('aria-label', text);
    link.textContent = '';
    var label = document.createElement('span');
    label.className = 'nav-label';
    label.setAttribute('aria-hidden', 'true');
    ['nav-row nav-row-a', 'nav-row nav-row-b'].forEach(function (rowClass) {
      var row = document.createElement('span');
      row.className = rowClass;
      Array.prototype.forEach.call(text, function (character, index) {
        var span = document.createElement('span');
        span.className = 'nav-ch';
        span.textContent = character;
        span.style.setProperty('--i', index);
        row.appendChild(span);
      });
      label.appendChild(row);
    });
    link.appendChild(label);
  }

  function createNavMarkers(nav) {
    var frame = nav.querySelector('.nav-frame');
    var dot = nav.querySelector('.nav-dot');
    var frameTo = function (link) {
      if (!frame) return;
      if (!link) { frame.classList.remove('is-visible'); return; }
      var padX = cssNumber(nav, '--frame-pad-x', 0);
      var padY = cssNumber(nav, '--frame-pad-y', 0);
      placeMarker(frame, function () {
        frame.style.width = (link.offsetWidth + padX * 2) + 'px';
        frame.style.height = (link.offsetHeight + padY * 2) + 'px';
        frame.style.transform = 'translate(' + (link.offsetLeft - padX) + 'px, ' + (link.offsetTop - padY) + 'px)';
      });
    };
    var dotTo = function (link) {
      if (!dot) return;
      if (!link) { dot.classList.remove('is-visible'); return; }
      var padY = cssNumber(nav, '--frame-pad-y', 0);
      var x = link.offsetLeft + link.offsetWidth / 2 - dot.offsetWidth / 2;
      var y = link.offsetTop + link.offsetHeight + padY - 0.5 - dot.offsetHeight / 2;
      placeMarker(dot, function () { dot.style.transform = 'translate(' + x + 'px, ' + y + 'px)'; });
    };
    var snap = function (activeLink, dotLink) {
      if (frame && activeLink) { frame.classList.remove('is-visible'); frameTo(activeLink); }
      if (dot && dotLink) { dot.classList.remove('is-visible'); dotTo(dotLink); }
    };
    return { frameTo: frameTo, dotTo: dotTo, snap: snap };
  }

  function observeActiveSection(nav, links, markers, state) {
    var sections = links
      .map(function (link) { return document.querySelector(link.getAttribute('href')); })
      .filter(Boolean);
    if (!sections.length || !canObserve) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          if (link.getAttribute('href') === '#' + entry.target.id) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
        var active = nav.querySelector('a[aria-current]');
        markers.frameTo(active);
        if (!state.hovered) markers.dotTo(active);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(function (section) { observer.observe(section); });
    var hero = document.querySelector('.hero');
    if (hero) observer.observe(hero);
  }

  function initNav() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var links = toArray(nav.querySelectorAll('a[href^="#"]'));
    var markers = createNavMarkers(nav);
    var state = { hovered: null };
    var activeLink = function () { return nav.querySelector('a[aria-current]'); };
    links.forEach(function (link) {
      splitFlapLabel(link);
      magnetize(link, 6);
      link.addEventListener('pointerenter', function () { state.hovered = link; markers.dotTo(link); });
      link.addEventListener('focus', function () { markers.dotTo(link); });
    });
    nav.addEventListener('pointerleave', function () { state.hovered = null; markers.dotTo(activeLink()); });
    nav.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!nav.contains(document.activeElement)) markers.dotTo(state.hovered || activeLink());
      }, 0);
    });
    window.addEventListener('resize', function () { markers.snap(activeLink(), state.hovered || activeLink()); });
    observeActiveSection(nav, links, markers, state);
  }

  // Logo strip: scrolls itself in a loop while it is on screen, and also accepts
  // drag, wheel and arrow keys. Any input pauses it; it resumes after a short idle.

  var LOGO_SPEED = 0.03; // pixels per millisecond
  var LOGO_RESUME_MS = 1800;

  function stripLoopWidth(strip) {
    return strip.firstCopy.offsetWidth;
  }

  function stripTileStep(strip) {
    var tile = strip.firstCopy.firstElementChild;
    if (!tile) return 196;
    return tile.offsetWidth + cssNumber(tile, 'margin-right', 0);
  }

  function wrapStripPosition(strip, value) {
    var width = stripLoopWidth(strip);
    if (!width) return value;
    while (value >= width) value -= width;
    while (value < 0) value += width;
    return value;
  }

  function pauseStrip(strip) {
    strip.paused = true;
    clearTimeout(strip.resumeTimer);
  }

  function scheduleStripResume(strip) {
    clearTimeout(strip.resumeTimer);
    strip.resumeTimer = setTimeout(function () {
      var keyboardHeld = strip.lastInput === 'keyboard' && document.activeElement === strip.el;
      if (strip.hovering || strip.dragging || keyboardHeld) return;
      strip.position = strip.el.scrollLeft;
      strip.keyTarget = null;
      strip.paused = false;
    }, LOGO_RESUME_MS);
  }

  function startStripLoop(strip) {
    if (reduceMotion || strip.frameId !== null) return;
    var last = null;
    var tick = function (now) {
      var elapsed = last === null ? 0 : Math.min(now - last, 50);
      last = now;
      if (!strip.paused) {
        strip.position = wrapStripPosition(strip, strip.position + LOGO_SPEED * elapsed);
        strip.el.scrollLeft = strip.position;
      }
      strip.frameId = requestAnimationFrame(tick);
    };
    strip.frameId = requestAnimationFrame(tick);
  }

  function stopStripLoop(strip) {
    if (strip.frameId === null) return;
    cancelAnimationFrame(strip.frameId);
    strip.frameId = null;
  }

  function dragStripTo(strip, drag, clientX) {
    var width = stripLoopWidth(strip);
    var target = drag.startScroll - (clientX - drag.startX);
    if (width && target < 0) { target += width; drag.startScroll += width; }
    else if (width && target >= width) { target -= width; drag.startScroll -= width; }
    strip.el.scrollLeft = target;
  }

  // Captures the pointer only once it really moves, so a plain click still
  // reaches the logo link underneath. A click that ends a drag is swallowed.
  function bindStripDrag(strip) {
    var el = strip.el;
    var drag = null;
    var suppressClick = false;
    el.addEventListener('dragstart', function (event) { event.preventDefault(); });
    el.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      strip.lastInput = 'pointer';
      strip.dragging = true;
      strip.keyTarget = null;
      drag = { startX: event.clientX, startScroll: el.scrollLeft, moved: false };
      pauseStrip(strip);
    });
    el.addEventListener('pointermove', function (event) {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.abs(event.clientX - drag.startX) < 5) return;
        drag.moved = true;
        el.classList.add('is-dragging');
        capturePointer(el, event.pointerId);
      }
      dragStripTo(strip, drag, event.clientX);
    });
    var endDrag = function () {
      if (!drag) return;
      suppressClick = drag.moved;
      drag = null;
      strip.dragging = false;
      if (suppressClick) setTimeout(function () { suppressClick = false; }, 0);
      el.classList.remove('is-dragging');
      scheduleStripResume(strip);
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('click', function (event) {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  // Arrow keys move one tile at a time. Repeated presses add up from the pending
  // target; the target clears when scrolling ends or the loop resumes, so browsers
  // without the scrollend event never reuse a stale position.
  function bindStripKeys(strip) {
    var el = strip.el;
    el.addEventListener('scrollend', function () { strip.keyTarget = null; });
    el.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      strip.lastInput = 'keyboard';
      pauseStrip(strip);
      var width = stripLoopWidth(strip);
      var step = stripTileStep(strip) * (event.key === 'ArrowRight' ? 1 : -1);
      var target = (strip.keyTarget === null ? el.scrollLeft : strip.keyTarget) + step;
      if (width && target < 0) { el.scrollLeft += width; target += width; }
      else if (width && target >= width) { el.scrollLeft -= width; target -= width; }
      strip.keyTarget = target;
      el.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
      scheduleStripResume(strip);
    });
  }

  function initLogoStrip() {
    var el = document.querySelector('.marquee');
    var firstCopy = el && el.querySelector('.marquee-copy');
    if (!el || !firstCopy) return;
    var strip = {
      el: el, firstCopy: firstCopy, position: 0, paused: false, hovering: false, dragging: false,
      lastInput: 'pointer', resumeTimer: null, keyTarget: null, frameId: null
    };
    el.addEventListener('pointerenter', function () { strip.hovering = true; pauseStrip(strip); });
    el.addEventListener('pointerleave', function () { strip.hovering = false; scheduleStripResume(strip); });
    el.addEventListener('wheel', function () {
      strip.keyTarget = null;
      pauseStrip(strip);
      scheduleStripResume(strip);
    }, { passive: true });
    el.addEventListener('focus', function () { pauseStrip(strip); scheduleStripResume(strip); });
    el.addEventListener('blur', function () { scheduleStripResume(strip); });
    bindStripDrag(strip);
    bindStripKeys(strip);
    if (!canObserve) { startStripLoop(strip); return; }
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) startStripLoop(strip);
      else stopStripLoop(strip);
    }).observe(el);
  }

  // Skill tabs: one skill at a time, chosen by click or the arrow keys, with a dot
  // that springs to the selected tab. Auto-advance runs while the section is on
  // screen; the progress line under the selected tab is its timer.

  var SKILL_AUTOPLAY_MS = 6000;

  function skillPanel(tab) {
    return document.getElementById(tab.getAttribute('aria-controls'));
  }

  function placeTabDot(tabs, instant) {
    if (!tabs.dot || !tabs.current) return;
    var y = tabs.current.offsetTop + tabs.current.offsetHeight / 2 - tabs.dot.offsetHeight / 2;
    if (instant) tabs.dot.style.transition = 'none';
    tabs.dot.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
    if (instant) {
      void tabs.dot.offsetWidth;
      tabs.dot.style.transition = '';
    }
  }

  // On narrow screens the tab list scrolls sideways. This keeps the selected tab
  // in view by scrolling the list itself, never the page.
  function revealTab(tabs, tab) {
    var list = tabs.el;
    if (list.scrollWidth <= list.clientWidth) return;
    var pad = parseFloat(getComputedStyle(list).paddingLeft) || 0;
    var left = tab.offsetLeft - pad;
    var right = tab.offsetLeft + tab.offsetWidth + pad - list.clientWidth;
    var target = list.scrollLeft;
    if (left < list.scrollLeft) target = left;
    else if (right > list.scrollLeft) target = right;
    if (target !== list.scrollLeft) list.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function fadeOutPanel(panel) {
    panel.classList.add('is-leaving');
    var done = function () {
      panel.classList.remove('is-leaving');
      panel.removeEventListener('animationend', done);
    };
    panel.addEventListener('animationend', done);
    setTimeout(done, 400);
  }

  function selectSkillTab(tabs, tab, moveFocus) {
    if (tab !== tabs.current) {
      var leaving = skillPanel(tabs.current);
      tabs.current = tab;
      tabs.list.forEach(function (other) {
        var selected = other === tab;
        other.setAttribute('aria-selected', selected ? 'true' : 'false');
        other.tabIndex = selected ? 0 : -1;
        var panel = skillPanel(other);
        if (!panel) return;
        panel.classList.toggle('is-active', selected);
        if (panel !== leaving) panel.classList.remove('is-leaving');
      });
      if (leaving) fadeOutPanel(leaving);
      placeTabDot(tabs, false);
      revealTab(tabs, tab);
    }
    if (moveFocus) tab.focus();
  }

  function stopSkillAutoplay(tabs) {
    if (tabs.wrap) tabs.wrap.classList.remove('is-autoplay', 'is-paused');
  }

  // Only the keys the tab list acts on hand control to the reader; Tab and other
  // keys leave auto-advance alone.
  function bindSkillTabs(tabs) {
    var count = tabs.list.length;
    tabs.list.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        stopSkillAutoplay(tabs);
        selectSkillTab(tabs, tab, false);
      });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = tabs.list[(index + 1) % count];
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = tabs.list[(index - 1 + count) % count];
        else if (event.key === 'Home') next = tabs.list[0];
        else if (event.key === 'End') next = tabs.list[count - 1];
        if (!next) return;
        event.preventDefault();
        stopSkillAutoplay(tabs);
        selectSkillTab(tabs, next, true);
      });
    });
  }

  function startSkillAutoplay(tabs, tablist) {
    var wrap = tabs.wrap;
    if (!wrap || reduceMotion || !canObserve) return;
    var held = { inView: false, pointer: false, focus: false };
    var sync = function () {
      wrap.classList.toggle('is-paused', !held.inView || held.pointer || held.focus || document.hidden);
    };
    wrap.style.setProperty('--autoplay-ms', SKILL_AUTOPLAY_MS + 'ms');
    wrap.classList.add('is-autoplay');
    sync();
    new IntersectionObserver(function (entries) {
      held.inView = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.35 }).observe(wrap);
    wrap.addEventListener('pointerenter', function () { held.pointer = true; sync(); });
    wrap.addEventListener('pointerleave', function () { held.pointer = false; sync(); });
    wrap.addEventListener('focusin', function () { held.focus = true; sync(); });
    wrap.addEventListener('focusout', function () {
      setTimeout(function () { held.focus = wrap.contains(document.activeElement); sync(); }, 0);
    });
    document.addEventListener('visibilitychange', sync);
    tablist.addEventListener('animationend', function (event) {
      if (!event.target.classList.contains('tab-progress') || !wrap.classList.contains('is-autoplay')) return;
      var next = tabs.list[(tabs.list.indexOf(tabs.current) + 1) % tabs.list.length];
      selectSkillTab(tabs, next, false);
    });
  }

  function initSkillTabs() {
    var tablist = document.querySelector('.skills-tablist');
    if (!tablist) return;
    var list = toArray(tablist.querySelectorAll('[role="tab"]'));
    var tabs = {
      el: tablist,
      list: list,
      dot: tablist.querySelector('.tab-dot'),
      wrap: tablist.closest('.skills-tabs'),
      current: list.filter(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })[0] || list[0]
    };
    bindSkillTabs(tabs);
    placeTabDot(tabs, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeTabDot(tabs, true); });
    window.addEventListener('resize', function () { placeTabDot(tabs, true); });
    startSkillAutoplay(tabs, tablist);
  }

  // Testimonials: a 3D ring. The current quote faces the reader; the previous and
  // next quotes sit angled behind it, muted and blurred. Arrows, dots, keys, side
  // clicks, dragging and auto-advance move it. The 3D values come from the
  // --quote-* custom properties in the stylesheet.

  var QUOTE_AUTOPLAY_MS = 7000;

  function quoteOffset(index, current, count) {
    var half = Math.floor(count / 2);
    return ((index - current + count + half) % count) - half;
  }

  // A quote wrapping from one side to the other fades across instead of sweeping
  // behind the quote in front.
  function markWrapping(slide, lastPos, nextPos) {
    var crosses = (lastPos === '-1' && nextPos === '1') || (lastPos === '1' && nextPos === '-1');
    if (!crosses) return;
    restartClass(slide, 'is-wrapping');
    var done = function () { slide.classList.remove('is-wrapping'); };
    slide.addEventListener('animationend', done, { once: true });
    setTimeout(done, 1000);
  }

  function layoutQuotes(ring) {
    var count = ring.slides.length;
    ring.slides.forEach(function (slide, i) {
      var offset = quoteOffset(i, ring.index, count);
      var nextPos = Math.abs(offset) <= 1 ? String(offset) : 'away';
      markWrapping(slide, slide.getAttribute('data-pos'), nextPos);
      slide.setAttribute('data-pos', nextPos);
      slide.classList.toggle('is-active', offset === 0);
      slide.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
    });
    ring.dots.forEach(function (dot, i) {
      if (i === ring.index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function showQuote(ring, target) {
    target = (target + ring.slides.length) % ring.slides.length;
    if (target === ring.index) return;
    ring.index = target;
    layoutQuotes(ring);
  }

  function buildQuoteDots(ring, wrap) {
    return ring.slides.map(function (slide, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'quote-dot';
      dot.setAttribute('aria-label', 'Show testimonial ' + (i + 1));
      wrap.appendChild(dot);
      return dot;
    });
  }

  function startQuoteAutoplay(ring) {
    var held = { stopped: reduceMotion, inView: false, pointer: false };
    var timer = null;
    var schedule = function () {
      clearTimeout(timer);
      if (held.stopped || !held.inView || held.pointer || document.hidden) return;
      timer = setTimeout(function () {
        showQuote(ring, ring.index + 1);
        schedule();
      }, QUOTE_AUTOPLAY_MS);
    };
    ring.track.setAttribute('aria-live', held.stopped ? 'polite' : 'off');
    ring.el.addEventListener('pointerenter', function () { held.pointer = true; schedule(); });
    ring.el.addEventListener('pointerleave', function () { held.pointer = false; schedule(); });
    ring.el.addEventListener('focusin', function () { held.pointer = true; schedule(); });
    ring.el.addEventListener('focusout', function () {
      setTimeout(function () { held.pointer = ring.el.contains(document.activeElement); schedule(); }, 0);
    });
    document.addEventListener('visibilitychange', schedule);
    if (canObserve) {
      new IntersectionObserver(function (entries) {
        held.inView = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.4 }).observe(ring.el);
    }
    return function stop() {
      held.stopped = true;
      clearTimeout(timer);
      ring.track.setAttribute('aria-live', 'polite');
    };
  }

  function bindQuoteControls(ring, controls, takeControl) {
    var go = function (target) { takeControl(); showQuote(ring, target); };
    toArray(controls.querySelectorAll('.quote-nav')).forEach(function (button) {
      var step = parseInt(button.getAttribute('data-step'), 10);
      button.addEventListener('click', function () { go(ring.index + step); });
    });
    ring.dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { go(i); });
    });
    ring.slides.forEach(function (slide, i) {
      slide.addEventListener('click', function () {
        if (slide.getAttribute('data-pos') !== '0') go(i);
      });
    });
    ring.el.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      go(ring.index + (event.key === 'ArrowRight' ? 1 : -1));
    });
  }

  function readQuoteGeometry(ring) {
    return {
      shift: cssNumber(ring.el, '--quote-shift', 104),
      depth: cssNumber(ring.el, '--quote-depth', -420),
      tilt: cssNumber(ring.el, '--quote-tilt', 34),
      opacity: cssNumber(ring.el, '--quote-side-opacity', 0.28),
      blur: cssNumber(ring.el, '--quote-side-blur', 5)
    };
  }

  // Places a slide at a fractional ring position: 0 is the front, -1 and 1 the
  // sides, beyond that it fades out further back.
  function placeQuoteAt(slide, pos, geometry) {
    var dist = Math.abs(pos);
    var near = Math.min(dist, 1);
    var tilt = Math.max(-1, Math.min(1, pos));
    var depth = geometry.depth * near + (dist > 1 ? (geometry.depth * 0.43) * (dist - 1) : 0);
    var opacity = dist <= 1 ? 1 - (1 - geometry.opacity) * near : Math.max(0, geometry.opacity * (2 - dist));
    slide.style.transform = 'translateX(' + (pos * geometry.shift).toFixed(2) + '%) translateZ(' + depth.toFixed(1) + 'px) rotateY(' + (-geometry.tilt * tilt).toFixed(2) + 'deg)';
    slide.style.opacity = opacity.toFixed(3);
    slide.style.filter = 'blur(' + (geometry.blur * near).toFixed(2) + 'px)';
    slide.style.visibility = dist < 2 ? 'visible' : 'hidden';
  }

  function clearQuotePlacement(ring) {
    ring.slides.forEach(function (slide) {
      slide.style.transform = '';
      slide.style.opacity = '';
      slide.style.filter = '';
      slide.style.visibility = '';
    });
  }

  function moveQuoteDrag(ring, drag, clientX) {
    var dx = clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      drag.geometry = readQuoteGeometry(ring);
      ring.track.classList.add('is-dragging');
      capturePointer(ring.track, drag.id);
    }
    var progress = Math.max(-1, Math.min(1, -dx / drag.width));
    ring.slides.forEach(function (slide, i) {
      placeQuoteAt(slide, quoteOffset(i, ring.index, ring.slides.length) - progress, drag.geometry);
    });
  }

  // Grab and drag: the ring follows the pointer, then settles on release. A drag
  // past 15% of the width, or a quick flick, moves one quote.
  function bindQuoteDrag(ring, takeControl) {
    var track = ring.track;
    var drag = null;
    var suppressClick = false;
    track.addEventListener('dragstart', function (event) { event.preventDefault(); });
    track.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      drag = { id: event.pointerId, startX: event.clientX, startTime: performance.now(), width: ring.slides[ring.index].offsetWidth || 600, moved: false };
    });
    track.addEventListener('pointermove', function (event) {
      if (drag && event.pointerId === drag.id) moveQuoteDrag(ring, drag, event.clientX);
    });
    var endDrag = function (event, cancelled) {
      if (!drag || event.pointerId !== drag.id) return;
      var state = drag;
      drag = null;
      if (!state.moved) return;
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      var dx = event.clientX - state.startX;
      var quick = Math.abs(dx) > 30 && performance.now() - state.startTime < 300;
      var far = Math.abs(dx) > Math.min(90, state.width * 0.15);
      track.classList.remove('is-dragging');
      clearQuotePlacement(ring);
      if (cancelled || !(far || quick)) return;
      takeControl();
      showQuote(ring, ring.index + (dx < 0 ? 1 : -1));
    };
    track.addEventListener('pointerup', function (event) { endDrag(event, false); });
    track.addEventListener('pointercancel', function (event) { endDrag(event, true); });
    track.addEventListener('click', function (event) {
      if (!suppressClick) return;
      event.stopPropagation();
      event.preventDefault();
    }, true);
  }

  function initTestimonials() {
    var el = document.querySelector('.quote-carousel');
    if (!el) return;
    var slides = toArray(el.querySelectorAll('.quote-slide'));
    var ring = {
      el: el,
      track: el.querySelector('.quote-track'),
      slides: slides,
      dots: [],
      index: Math.max(0, slides.findIndex(function (slide) { return slide.classList.contains('is-active'); }))
    };
    slides.forEach(function (slide, i) { slide.setAttribute('aria-label', (i + 1) + ' of ' + slides.length); });
    layoutQuotes(ring);
    var controls = el.querySelector('.quote-controls');
    var dotsWrap = el.querySelector('.quote-dots');
    if (slides.length < 2 || !controls || !dotsWrap) return;
    ring.dots = buildQuoteDots(ring, dotsWrap);
    layoutQuotes(ring);
    controls.hidden = false;
    var takeControl = startQuoteAutoplay(ring);
    bindQuoteControls(ring, controls, takeControl);
    bindQuoteDrag(ring, takeControl);
  }

  // Project list: the compact projects stay folded behind a toggle until asked
  // for, then join the list right after the featured projects.

  function expandProjects(rows) {
    var order = 0;
    rows.forEach(function (row) {
      var inView = row.getBoundingClientRect().top < window.innerHeight;
      row.style.setProperty('--i', inView ? order++ : 0);
      restartClass(row, 'is-entering');
    });
  }

  // Keeps the toggle button where the reader sees it while the rows above it fold away.
  function collapseProjects(list, rows, button) {
    var root = document.documentElement;
    var before = button.getBoundingClientRect().top;
    root.style.overflowAnchor = 'none';
    list.classList.add('is-collapsed');
    rows.forEach(function (row) { row.classList.remove('is-entering'); });
    window.scrollBy({ top: button.getBoundingClientRect().top - before, behavior: 'instant' });
    requestAnimationFrame(function () { root.style.overflowAnchor = ''; });
  }

  function initProjectList() {
    var list = document.getElementById('project-list');
    var button = document.querySelector('.list-toggle-button');
    if (!list || !button) return;
    var rows = toArray(list.querySelectorAll('.is-extra'));
    var label = button.querySelector('.toggle-label');
    button.hidden = false;
    button.addEventListener('click', function () {
      var expanding = list.classList.contains('is-collapsed');
      if (expanding) {
        list.classList.remove('is-collapsed');
        expandProjects(rows);
      } else {
        collapseProjects(list, rows, button);
      }
      button.setAttribute('aria-expanded', String(expanding));
      label.textContent = expanding ? 'Fewer Projects' : 'More Projects';
    });
  }

  // Hero mosaic: squares light up along connected, wandering paths on the right
  // of the hero. The newest square on each path is brightest, then each fades.

  var MOSAIC = { pitch: 56, gap: 2, stepMs: 260, minWalkers: 2, maxWalkers: 4, riseMs: 520 };
  var MOSAIC_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function smoothstep(edge0, edge1, x) {
    var t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function mosaicWeight(m, c, r) {
    return m.weights[r * m.cols + c] || 0;
  }

  function mosaicCellX(m, c) { return m.offX + c * MOSAIC.pitch; }
  function mosaicCellY(m, r) { return m.offY + r * MOSAIC.pitch; }

  // Fades the grid out toward the headline on the left and toward the top and bottom edges.
  function computeMosaicWeights(m) {
    m.weights = [];
    for (var r = 0; r < m.rows; r++) {
      for (var c = 0; c < m.cols; c++) {
        var nx = (c + 0.5) / m.cols;
        var ny = (r + 0.5) / m.rows;
        m.weights.push(smoothstep(0.04, 0.9, nx) * smoothstep(0, 0.16, ny) * smoothstep(0, 0.16, 1 - ny));
      }
    }
  }

  function drawMosaicBase(m, dpr) {
    var base = m.base.getContext('2d');
    var cell = MOSAIC.pitch - MOSAIC.gap;
    base.setTransform(dpr, 0, 0, dpr, 0, 0);
    base.clearRect(0, 0, m.w, m.h);
    base.fillStyle = m.white;
    for (var r = 0; r < m.rows; r++) {
      for (var c = 0; c < m.cols; c++) {
        base.globalAlpha = 0.022 * mosaicWeight(m, c, r);
        base.fillRect(mosaicCellX(m, c), mosaicCellY(m, r), cell, cell);
      }
    }
    base.globalAlpha = 1;
  }

  function layoutMosaic(m) {
    var w = m.canvas.clientWidth;
    var h = m.canvas.clientHeight;
    if (!w || !h) { m.cols = 0; return false; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    [m.canvas, m.base].forEach(function (canvas) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    });
    m.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.w = w;
    m.h = h;
    m.cols = Math.floor((w + MOSAIC.gap) / MOSAIC.pitch);
    m.rows = Math.floor((h + MOSAIC.gap) / MOSAIC.pitch);
    m.offX = w - (m.cols * MOSAIC.pitch - MOSAIC.gap);
    m.offY = Math.round((h - (m.rows * MOSAIC.pitch - MOSAIC.gap)) / 2);
    computeMosaicWeights(m);
    drawMosaicBase(m, dpr);
    m.tiles.clear();
    m.walkers = [];
    return true;
  }

  function pickMosaicSeed(m) {
    for (var tries = 0; tries < 40; tries++) {
      var c = Math.floor(Math.random() * m.cols);
      var r = Math.floor(Math.random() * m.rows);
      if (Math.random() < Math.pow(mosaicWeight(m, c, r), 1.4)) return { c: c, r: r };
    }
    return { c: m.cols - 1 - Math.floor(Math.random() * Math.ceil(m.cols / 3)), r: Math.floor(Math.random() * m.rows) };
  }

  function lightMosaicTile(m, c, r, now) {
    m.tiles.set(c + ',' + r, {
      c: c,
      r: r,
      born: now,
      life: 3200 + Math.random() * 2800,
      peak: 0.06 + Math.random() * 0.05,
      accent: Math.random() < 0.025
    });
  }

  function spawnMosaicWalker(m, now, from) {
    var start = from || pickMosaicSeed(m);
    var dir = MOSAIC_DIRECTIONS[Math.floor(Math.random() * MOSAIC_DIRECTIONS.length)];
    m.walkers.push({ c: start.c, r: start.r, dx: dir[0], dy: dir[1], left: 5 + Math.floor(Math.random() * 10) });
    lightMosaicTile(m, start.c, start.r, now);
  }

  // Directions a walker may take: inside the grid, not straight back, and not onto
  // a square that is still bright.
  function openMosaicDirections(m, walker, now) {
    return MOSAIC_DIRECTIONS.filter(function (d) {
      var c = walker.c + d[0];
      var r = walker.r + d[1];
      if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return false;
      if (d[0] === -walker.dx && d[1] === -walker.dy) return false;
      var lit = m.tiles.get(c + ',' + r);
      return !lit || now - lit.born > lit.life * 0.6;
    });
  }

  // Keeps going straight about half the time, otherwise prefers squares further into the mosaic.
  function chooseMosaicDirection(m, walker, options) {
    var straight = options.filter(function (d) { return d[0] === walker.dx && d[1] === walker.dy; })[0];
    if (straight && Math.random() < 0.55) return straight;
    var scores = options.map(function (d) { return 0.15 + mosaicWeight(m, walker.c + d[0], walker.r + d[1]); });
    var total = scores.reduce(function (sum, score) { return sum + score; }, 0);
    var pick = Math.random() * total;
    for (var i = 0; i < options.length; i++) {
      pick -= scores[i];
      if (pick <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  function stepMosaicWalker(m, walker, now) {
    var options = openMosaicDirections(m, walker, now);
    if (!options.length) { walker.left = 0; return; }
    var choice = chooseMosaicDirection(m, walker, options);
    walker.c += choice[0];
    walker.r += choice[1];
    walker.dx = choice[0];
    walker.dy = choice[1];
    walker.left -= 1;
    lightMosaicTile(m, walker.c, walker.r, now);
    if (m.walkers.length < MOSAIC.maxWalkers && Math.random() < 0.07) spawnMosaicWalker(m, now, { c: walker.c, r: walker.r });
  }

  function advanceMosaic(m, now) {
    m.walkers.slice().forEach(function (walker) { stepMosaicWalker(m, walker, now); });
    m.walkers = m.walkers.filter(function (walker) { return walker.left > 0; });
    while (m.walkers.length < MOSAIC.minWalkers) spawnMosaicWalker(m, now);
  }

  // Brightness over a square's life: a quick ease-in, then a slow fade.
  function mosaicEnvelope(age, life) {
    if (age < 0) return 0;
    if (age < MOSAIC.riseMs) return 1 - Math.pow(1 - age / MOSAIC.riseMs, 3);
    var d = (age - MOSAIC.riseMs) / (life - MOSAIC.riseMs);
    return d >= 1 ? 0 : 1 - d * d;
  }

  function drawMosaic(m, now) {
    var ctx = m.ctx;
    var cell = MOSAIC.pitch - MOSAIC.gap;
    ctx.clearRect(0, 0, m.w, m.h);
    ctx.drawImage(m.base, 0, 0, m.w, m.h);
    m.tiles.forEach(function (tile, key) {
      var age = now - tile.born;
      if (age >= tile.life) { m.tiles.delete(key); return; }
      var alpha = mosaicEnvelope(age, tile.life) * tile.peak * mosaicWeight(m, tile.c, tile.r);
      if (alpha <= 0.002) return;
      ctx.globalAlpha = tile.accent ? Math.min(0.22, alpha * 2.2) : alpha;
      ctx.fillStyle = tile.accent ? m.accent : m.white;
      ctx.fillRect(mosaicCellX(m, tile.c), mosaicCellY(m, tile.r), cell, cell);
    });
    ctx.globalAlpha = 1;
  }

  function mosaicTick(m, now) {
    m.frameId = null;
    if (!m.lastStep) m.lastStep = now;
    var steps = 0;
    while (now - m.lastStep >= MOSAIC.stepMs && steps < 4) {
      m.lastStep += MOSAIC.stepMs;
      advanceMosaic(m, m.lastStep);
      steps += 1;
    }
    if (now - m.lastStep > MOSAIC.stepMs * 4) m.lastStep = now;
    drawMosaic(m, now);
    if (m.inView) m.frameId = requestAnimationFrame(function (t) { mosaicTick(m, t); });
  }

  function startMosaic(m) {
    if (m.frameId !== null || !m.cols) return;
    m.lastStep = 0;
    m.frameId = requestAnimationFrame(function (t) { mosaicTick(m, t); });
  }

  function stopMosaic(m) {
    if (m.frameId === null) return;
    cancelAnimationFrame(m.frameId);
    m.frameId = null;
  }

  // Reduced motion: advance the walkers offline and draw one still frame.
  function renderStillMosaic(m) {
    var t = 0;
    for (var i = 0; i < 28; i++) {
      t += MOSAIC.stepMs;
      advanceMosaic(m, t);
    }
    drawMosaic(m, t);
  }

  function resetMosaic(m) {
    stopMosaic(m);
    if (!layoutMosaic(m)) return;
    if (reduceMotion) renderStillMosaic(m);
    else if (m.inView) startMosaic(m);
    m.canvas.classList.add('is-ready');
  }

  function initHeroMosaic() {
    var canvas = document.querySelector('.hero-mosaic');
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) return;
    var root = document.documentElement;
    var m = {
      canvas: canvas, ctx: ctx, base: document.createElement('canvas'), tiles: new Map(), walkers: [], weights: [],
      cols: 0, rows: 0, offX: 0, offY: 0, w: 0, h: 0, lastStep: 0, frameId: null, inView: true,
      accent: getComputedStyle(root).getPropertyValue('--color-accent').trim() || '#f2614f',
      white: getComputedStyle(root).getPropertyValue('--color-white').trim() || '#ffffff'
    };
    var hero = document.querySelector('.hero');
    if (hero && canObserve) {
      new IntersectionObserver(function (entries) {
        m.inView = entries[0].isIntersecting;
        if (reduceMotion || !m.cols) return;
        if (m.inView) startMosaic(m);
        else stopMosaic(m);
      }).observe(hero);
    }
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { resetMosaic(m); }, 200);
    });
    resetMosaic(m);
  }

  function initFooterYear() {
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  initHeader();
  initReveal();
  initNav();
  initLogoStrip();
  initSkillTabs();
  initTestimonials();
  initProjectList();
  initHeroMosaic();
  initFooterYear();
})();
