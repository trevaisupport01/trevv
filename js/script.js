/**
 * TREV AI MASTERCLASS - DYNAMIC REFINED ENGINE
 */

document.addEventListener('DOMContentLoaded', () => {

  // 1. STICKY HEADER & ACTIVE SECTIONS OBSERVER
  const header = document.getElementById('header');
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id], #pricing, #faq, #contact');

  const observerOptions = {
    root: null,
    rootMargin: '-10% 0px -70% 0px', // Strict intersection window
    threshold: 0
  };

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => sectionObserver.observe(section));

  // Optimize header scroll event with passive flag for performance
  const handleHeaderScroll = () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleHeaderScroll, { passive: true });


  // 2. MOBILE ACCESSIBLE MENU TOGGLE
  const menuToggle = document.querySelector('.menu-toggle');
  const primaryNav = document.getElementById('primary-nav');

  if (menuToggle && primaryNav) {
    const navBackdrop = document.createElement('button');
    navBackdrop.type = 'button';
    navBackdrop.className = 'nav-backdrop';
    navBackdrop.setAttribute('aria-label', 'Close navigation menu');
    document.body.appendChild(navBackdrop);

    const toggleMenu = (forceClose = false) => {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      const shouldOpen = forceClose ? false : !isExpanded;

      menuToggle.setAttribute('aria-expanded', shouldOpen);
      primaryNav.classList.toggle('active', shouldOpen);
      menuToggle.classList.toggle('open', shouldOpen);
      navBackdrop.classList.toggle('active', shouldOpen);
      document.body.classList.toggle('nav-open', shouldOpen);

      const bars = menuToggle.querySelectorAll('.bar');
      if (shouldOpen) {
        bars[0].style.transform = 'rotate(45deg) translate(5px, 6px)';
        bars[1].style.opacity = '0';
        bars[2].style.transform = 'rotate(-45deg) translate(5px, -6px)';
      } else {
        bars[0].style.transform = 'none';
        bars[1].style.opacity = '1';
        bars[2].style.transform = 'none';
      }
    };

    menuToggle.addEventListener('click', () => toggleMenu());
    navBackdrop.addEventListener('click', () => toggleMenu(true));
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1180 && primaryNav.classList.contains('active')) toggleMenu(true);
    }, { passive: true });

    // Close menu on navigation link clicks
    navLinks.forEach(link => {
      link.addEventListener('click', () => toggleMenu(true));
    });

    // Close menu when clicking outside the navbar
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target) && primaryNav.classList.contains('active')) {
        toggleMenu(true);
      }
    });

    // Close menu on Escape keypress
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && primaryNav.classList.contains('active')) {
        toggleMenu(true);
      }
    });
  }


  // 3. INTERSECTION OBSERVER - PROGRESSIVE SCROLL REVEALS
  const revealElements = document.querySelectorAll('.scroll-reveal');

  if (revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.05, // Lower threshold triggers easily
      rootMargin: '0px 0px 100px 0px' // Positive margin triggers 100px before entering viewport
    });

    revealElements.forEach(el => revealObserver.observe(el));
  }


  // 4. ANIMATED PERFORMANCE COUNTERS
  const counters = document.querySelectorAll('.counter');

  if (counters.length > 0) {
    const counterObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const counter = entry.target;
          const target = parseInt(counter.getAttribute('data-target'), 10);
          const duration = 1800; // Animation lifecycle (ms)
          const start = performance.now();

          const animate = (timestamp) => {
            const elapsed = timestamp - start;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease-out cubic calculation
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(easeProgress * target);

            counter.textContent = current.toLocaleString();

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              counter.textContent = target.toLocaleString();
            }
          };

          requestAnimationFrame(animate);
          observer.unobserve(counter);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(counter => counterObserver.observe(counter));
  }


  // 5. LIFECYCLE ACCORDION HANDLING (Fluid Heights)
  const accordions = document.querySelectorAll('.accordion-header');

  accordions.forEach(header => {
    header.addEventListener('click', () => {
      const panel = header.nextElementSibling;
      const isExpanded = header.getAttribute('aria-expanded') === 'true';

      header.setAttribute('aria-expanded', !isExpanded);

      if (!isExpanded) {
        panel.removeAttribute('hidden');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        
        // Remove hard pixel limits once transition ends to support layout reflows on resize
        const handleTransitionEnd = (e) => {
          if (e.propertyName === 'max-height') {
            panel.style.maxHeight = 'fit-content';
            panel.removeEventListener('transitionend', handleTransitionEnd);
          }
        };
        panel.addEventListener('transitionend', handleTransitionEnd);

      } else {
        // Prepare collapse by converting fit-content to explicit scrollHeight first
        panel.style.maxHeight = panel.scrollHeight + 'px';
        
        // Force rendering paint pass
        panel.offsetHeight;

        panel.style.maxHeight = '0';
        
        const handleCollapseEnd = (e) => {
          if (e.propertyName === 'max-height') {
            panel.setAttribute('hidden', '');
            panel.removeEventListener('transitionend', handleCollapseEnd);
          }
        };
        panel.addEventListener('transitionend', handleCollapseEnd);
      }
    });
  });


  // 6. TESTIMONIAL CAROUSEL ACCESSIBILITY & FOCUS TRACKING
  const slides = document.querySelectorAll('.testimonial-slider .slide');
  const prevBtn = document.querySelector('.prev-btn');
  const nextBtn = document.querySelector('.next-btn');
  let currentSlideIndex = 0;
  let autoRotateInterval;

  if (slides.length > 0) {
    const updateSlideFocus = (index) => {
      slides.forEach((slide, idx) => {
        if (idx === index) {
          slide.classList.add('active');
          slide.setAttribute('aria-hidden', 'false');
          slide.setAttribute('tabindex', '0');
        } else {
          slide.classList.remove('active');
          slide.setAttribute('aria-hidden', 'true');
          slide.setAttribute('tabindex', '-1');
        }
      });
    };

    const handleNextSlide = () => {
      currentSlideIndex = (currentSlideIndex + 1) % slides.length;
      updateSlideFocus(currentSlideIndex);
    };

    const handlePrevSlide = () => {
      currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
      updateSlideFocus(currentSlideIndex);
    };

    const startAutoRotate = () => {
      stopAutoRotate();
      autoRotateInterval = setInterval(handleNextSlide, 8000);
    };

    const stopAutoRotate = () => {
      if (autoRotateInterval) clearInterval(autoRotateInterval);
    };

    nextBtn.addEventListener('click', () => {
      handleNextSlide();
      startAutoRotate();
    });

    prevBtn.addEventListener('click', () => {
      handlePrevSlide();
      startAutoRotate();
    });

    // Auto rotate setup
    startAutoRotate();
    updateSlideFocus(currentSlideIndex);
  }


  // 7. FIXED WAT EARLY-BIRD + COHORT COUNTDOWN
  const daysEl = document.getElementById('days');
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');
  const countdownTitle = document.getElementById('countdownTitle');
  const countdownDescription = document.getElementById('countdownDescription');
  const countdownGrid = document.getElementById('countdownGrid');
  const countdownExpired = document.getElementById('countdownExpired');
  const EARLY_BIRD_END = new Date('2026-07-28T23:59:59+01:00').getTime();
  const COHORT_START = new Date('2026-08-04T00:00:00+01:00').getTime();

  const setTimerValues = (distance) => {
    const days = Math.floor(distance / 86400000);
    const hours = Math.floor((distance % 86400000) / 3600000);
    const minutes = Math.floor((distance % 3600000) / 60000);
    const seconds = Math.floor((distance % 60000) / 1000);
    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
    if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
  };

  const processTimer = () => {
    if (!countdownGrid) return;
    const now = Date.now();
    if (now <= EARLY_BIRD_END) {
      countdownGrid.hidden = false;
      countdownExpired.hidden = true;
      countdownTitle.textContent = 'Early-Bird Registration Ends In';
      countdownDescription.textContent = 'Register by 28 July at 11:59 PM WAT to secure early-bird pricing.';
      setTimerValues(Math.max(0, EARLY_BIRD_END - now));
    } else if (now < COHORT_START) {
      countdownGrid.hidden = false;
      countdownExpired.hidden = true;
      countdownTitle.textContent = 'The August Cohort Begins In';
      countdownDescription.textContent = 'Registration continues at standard pricing until the cohort begins.';
      setTimerValues(Math.max(0, COHORT_START - now));
    } else {
      countdownGrid.hidden = true;
      countdownExpired.hidden = false;
      countdownTitle.textContent = 'Next Cohort Coming Soon';
      countdownDescription.textContent = 'Join the waitlist to receive the next cohort dates and early enrollment information.';
    }
  };

  if (countdownGrid) {
    window.setInterval(processTimer, 1000);
    processTimer();
  }


  // 8. BACK TO TOP VISIBILITY CONTROLLER
  const backToTopBtn = document.getElementById('backToTop');

  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 800) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    }, { passive: true });

    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }


  // 9. SECURE FORMSPREE SUBMISSIONS
  const waitlistForm = document.getElementById('waitlistForm');
  const waitlistMessage = document.getElementById('waitlistMessage');
  const submitBtn = document.getElementById('waitlistSubmitBtn');

  if (waitlistForm && submitBtn) {
    waitlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('waitlist-name');
      const emailInput = document.getElementById('waitlist-email');
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();

      // Field validation
      if (!name) {
        renderFormFeedback('Please enter your full name.', 'error');
        nameInput.focus();
        return;
      }

      const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailPattern.test(email)) {
        renderFormFeedback('Please enter a valid email address.', 'error');
        emailInput.focus();
        return;
      }

      // Safe lock: Disable interface elements during submission
      submitBtn.disabled = true;
      nameInput.disabled = true;
      emailInput.disabled = true;

      const originalBtnHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>';

      renderFormFeedback('Securing your seat...', 'success');

      // POST to Google Forms.
      // ⚠️ REPLACE these 3 placeholders once your form is created:
      //   GOOGLE_FORM_ACTION_URL — from "Get pre-filled link" on your form, minus the params
      //   ENTRY_NAME / ENTRY_EMAIL — the entry.XXXXXXXXX IDs for the Name/Email fields
      const GOOGLE_FORM_ACTION_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd-66R2tZl5XCabrYUMcbpU6MNNLZlyZ_FhSpVEIuMAxbJ5Yw/formResponse';
      const ENTRY_NAME = 'entry.1733220929';
      const ENTRY_EMAIL = 'entry.605517944';

      try {
        const formData = new URLSearchParams();
        formData.append(ENTRY_NAME, name);
        formData.append(ENTRY_EMAIL, email);

        // Google Forms doesn't allow reading the response cross-origin,
        // so we submit with no-cors and treat "no network error" as success.
        await fetch(GOOGLE_FORM_ACTION_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });

        renderFormFeedback(`Welcome, ${name}! You are on the waitlist. Check your email shortly.`, 'success');
        waitlistForm.reset();
      } catch (err) {
        renderFormFeedback('Network error. Please check your connection and try again.', 'error');
      } finally {
        // Restore controls
        submitBtn.disabled = false;
        nameInput.disabled = false;
        emailInput.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    });
  }

  const renderFormFeedback = (messageText, statusType) => {
    if (waitlistMessage) {
      waitlistMessage.textContent = messageText;
      waitlistMessage.className = `form-message ${statusType}`;
    }
  };


  // 10. DECORATIVE MOTION PREFERENCES
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  // Let the footer version of the logo play only when it becomes visible.
  const footerLogos = document.querySelectorAll('.footer-logo');
  if (footerLogos.length > 0 && !prefersReducedMotion) {
    const footerLogoObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('logo-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });
    footerLogos.forEach((logo) => footerLogoObserver.observe(logo));
  }


  // 11. HERO AI DATA-FLOW FIELD + DESKTOP CURSOR ATTRACTION
  const heroScatter = document.querySelector('.hero-scatter');

  if (heroScatter && !prefersReducedMotion) {
    const dots = Array.from(heroScatter.querySelectorAll('circle'));
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let heroVisible = true;
    let animationFrame = null;
    let animationStart = performance.now();
    let pointer = null;

    const seeded = (index, salt) => {
      const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };

    const dotData = dots.map((dot, index) => {
      const active = mobile ? index % 2 === 0 : true;
      const layer = index % 3;
      const isGold = (dot.getAttribute('fill') || dot.getAttribute('stroke') || '').includes('accent');
      dot.classList.toggle('data-flow-dot', active);
      dot.classList.toggle('data-packet-dot', active && isGold && index % 4 === 0);
      return {
        dot, active, layer, isPacket: isGold && index % 4 === 0,
        cx: parseFloat(dot.getAttribute('cx') || '0'), cy: parseFloat(dot.getAttribute('cy') || '0'),
        phase: seeded(index, 1) * Math.PI * 2,
        amplitude: 16 + layer * 12 + seeded(index, 2) * 10,
        speed: (0.00011 + layer * 0.000055) * (isGold && index % 4 === 0 ? 1.75 : 1)
      };
    });

    const pointerToViewBox = (event) => {
      const rect = heroScatter.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return { x: (event.clientX - rect.left) * (1600 / rect.width), y: (event.clientY - rect.top) * (700 / rect.height) };
    };

    if (pointerFine) {
      heroScatter.closest('.hero-section')?.addEventListener('pointermove', (event) => { pointer = pointerToViewBox(event); }, { passive: true });
      heroScatter.closest('.hero-section')?.addEventListener('pointerleave', () => { pointer = null; }, { passive: true });
    }

    const animateDataFlow = (timestamp) => {
      if (!heroVisible) { animationFrame = null; return; }
      const elapsed = timestamp - animationStart;
      dotData.forEach((item) => {
        if (!item.active) return;
        const wave = Math.sin(item.phase + elapsed * item.speed);
        const flowX = wave * item.amplitude;
        const flowY = wave * item.amplitude * 0.48;
        let attractX = 0, attractY = 0;
        if (pointer && pointerFine) {
          const currentX = item.cx + flowX, currentY = item.cy + flowY;
          const dx = pointer.x - currentX, dy = pointer.y - currentY;
          const distance = Math.hypot(dx, dy);
          const radius = 190;
          if (distance > 0 && distance < radius) {
            const strength = (1 - distance / radius) * 10;
            attractX = (dx / distance) * strength;
            attractY = (dy / distance) * strength;
          }
        }
        item.dot.style.transform = `translate3d(${(flowX + attractX).toFixed(2)}px, ${(flowY + attractY).toFixed(2)}px, 0)`;
      });
      animationFrame = requestAnimationFrame(animateDataFlow);
    };

    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        heroVisible = entry.isIntersecting;
        heroScatter.classList.toggle('flow-active', heroVisible);
        if (heroVisible && !animationFrame) {
          animationStart = performance.now();
          animationFrame = requestAnimationFrame(animateDataFlow);
        }
      });
    }, { threshold: 0.05 });
    visibilityObserver.observe(heroScatter.closest('.hero-section'));
    animationFrame = requestAnimationFrame(animateDataFlow);
  }


  // 12. 3D CURSOR TILT FOR POINTER DEVICES
  const tiltCards = document.querySelectorAll(
    '.pricing-card, .bento-item, .why-card, .bonus-card, .instructor-card-ui'
  );
  const supportsHoverTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (tiltCards.length > 0 && supportsHoverTilt && !prefersReducedMotion) {
    const maxTilt = 6;

    tiltCards.forEach((card) => {
      card.addEventListener('mousemove', (event) => {
        const rect = card.getBoundingClientRect();
        const horizontal = (event.clientX - rect.left) / rect.width - 0.5;
        const vertical = (event.clientY - rect.top) / rect.height - 0.5;
        const rotateY = horizontal * maxTilt * 2;
        const rotateX = -vertical * maxTilt * 2;
        const featuredScale = card.classList.contains('featured') ? ' scale(1.03)' : '';

        card.style.willChange = 'transform';
        card.style.transition = 'transform 0.12s ease-out';
        card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)${featuredScale}`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.transform = '';
        window.setTimeout(() => { card.style.willChange = ''; }, 500);
      });
    });
  }

});
