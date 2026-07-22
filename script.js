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
    const toggleMenu = (forceClose = false) => {
      const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      const shouldOpen = forceClose ? false : !isExpanded;

      menuToggle.setAttribute('aria-expanded', shouldOpen);
      primaryNav.classList.toggle('active', shouldOpen);
      menuToggle.classList.toggle('open', shouldOpen);

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


  // 7. TIMEZONE-AWARE COUNTDOWN SYSTEM
  const daysEl = document.getElementById('days');
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');

  // Dynamic future target timeline (exactly 14 days from active system load date)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 14);

  const processTimer = () => {
    const now = new Date().getTime();
    const distance = targetDate.getTime() - now;

    if (distance < 0) {
      const zeros = '00';
      if (daysEl) daysEl.innerText = zeros;
      if (hoursEl) hoursEl.innerText = zeros;
      if (minutesEl) minutesEl.innerText = zeros;
      if (secondsEl) secondsEl.innerText = zeros;
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    if (daysEl) daysEl.innerText = days.toString().padStart(2, '0');
    if (hoursEl) hoursEl.innerText = hours.toString().padStart(2, '0');
    if (minutesEl) minutesEl.innerText = minutes.toString().padStart(2, '0');
    if (secondsEl) secondsEl.innerText = seconds.toString().padStart(2, '0');
  };

  setInterval(processTimer, 1000);
  processTimer();


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


  // 10. REDUCED MOTION PREFERENCE CHECK
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  // 11. HERO PARALLAX SCROLL (dot-scatter drifts slower than the page)
  const heroScatter = document.querySelector('.hero-scatter');

  if (heroScatter && !prefersReducedMotion) {
    let parallaxTicking = false;

    const updateParallax = () => {
      const offset = window.scrollY * 0.15;
      heroScatter.style.transform = `translate3d(0, ${offset}px, 0)`;
      parallaxTicking = false;
    };

    window.addEventListener('scroll', () => {
      if (!parallaxTicking) {
        requestAnimationFrame(updateParallax);
        parallaxTicking = true;
      }
    }, { passive: true });
  }


  // 12. 3D CURSOR-TILT ON FEATURE / PRICING CARDS
  const tiltCards = document.querySelectorAll('.pricing-card, .bento-item, .why-card, .bonus-card');
  const supportsHoverTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (tiltCards.length > 0 && supportsHoverTilt && !prefersReducedMotion) {
    const maxTilt = 7; // degrees

    tiltCards.forEach(card => {
      const baseScale = card.classList.contains('featured') ? ' scale(1.03)' : '';

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        const rotateY = px * maxTilt * 2;
        const rotateX = -py * maxTilt * 2;

        card.style.transition = 'transform 0.1s ease-out';
        card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)${baseScale}`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.transform = '';
      });
    });
  }

});
