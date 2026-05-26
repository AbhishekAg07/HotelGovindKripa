let activeFilter = "all";
const FALLBACK_MENU_ITEMS = [
  {
    id: "menu-1",
    name: "Paneer Butter Masala",
    category: "veg",
    description: "Rich tomato gravy with soft paneer cubes and warm spices.",
    price: 260
  },
  {
    id: "menu-2",
    name: "Dal Tadka",
    category: "veg",
    description: "Slow-cooked lentils finished with garlic, cumin, and ghee.",
    price: 180
  },
  {
    id: "menu-3",
    name: "Chicken Curry",
    category: "nonveg",
    description: "Classic home-style curry with tender chicken and bold masala.",
    price: 320
  },
  {
    id: "menu-4",
    name: "Chicken Biryani",
    category: "nonveg",
    description: "Fragrant basmati rice layered with spices and slow-cooked Chicken.",
    price: 340
  }
];

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-loaded");
  initializeBookingDates();
  initializeRevealAnimations();
  bindPageActions();
  loadMenuItems();
});

function initializeRevealAnimations() {
  const revealItems = document.querySelectorAll([
    ".hero-copy > *",
    ".hero-panel",
    ".info-strip > div",
    ".section-head",
    ".filters",
    ".zomato-card",
    ".room-card",
    ".location-card",
    ".map-card",
    ".contact-card",
    ".contact-form"
  ].join(","));

  revealItems.forEach((item, index) => {
    item.classList.add("reveal");
    item.style.setProperty("--reveal-delay", `${Math.min(index % 5, 4) * 90}ms`);
  });

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.16,
    rootMargin: "0px 0px -8% 0px"
  });

  revealItems.forEach((item) => observer.observe(item));
}

function bindPageActions() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.scrollTarget).scrollIntoView({ behavior: "smooth" });
    });
  });

  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", () => filterMenu(button.dataset.filter, button));
  });

  document.querySelectorAll("[data-book-room]").forEach((button) => {
    button.addEventListener("click", () => selectRoomAndScroll(button.dataset.bookRoom));
  });

  document.getElementById("booking-form").addEventListener("submit", submitBooking);
  document.getElementById("inquiry-form").addEventListener("submit", submitInquiry);
}

function selectRoomAndScroll(roomType) {
  const roomSelect = document.getElementById("roomType");
  roomSelect.value = roomType;
  document.getElementById("booking-form").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    document.getElementById("checkin").focus();
  }, 450);
}

function filterMenu(type, button) {
  activeFilter = type;

  const buttons = document.querySelectorAll(".filter-btn");
  buttons.forEach((btn) => btn.classList.remove("active"));
  if (button) {
    button.classList.add("active");
  }

  renderFilteredMenu();
}

async function loadMenuItems() {
  const status = document.getElementById("menu-status");
  status.textContent = "Loading menu...";

  try {
    const response = await fetch(`${API_BASE}/api/menu-items`);
    if (!response.ok) {
      throw new Error("Menu API is not responding.");
    }
    const items = await response.json();
    setMenuItems(items);
    status.textContent = items.length ? "" : "No menu items added yet.";
  } catch (error) {
    setMenuItems(FALLBACK_MENU_ITEMS);
    status.textContent = "Showing sample menu items. Please call us for the latest dishes.";
  }
}

function setMenuItems(items) {
  const grid = document.getElementById("menu-grid");
  grid.dataset.items = JSON.stringify(items);
  renderFilteredMenu();
}

function renderFilteredMenu() {
  const grid = document.getElementById("menu-grid");
  const items = JSON.parse(grid.dataset.items || "[]");
  const filteredItems = activeFilter === "all"
    ? items
    : items.filter((item) => item.category === activeFilter);

  grid.innerHTML = filteredItems.map((item) => `
    <article class="card dish-card ${item.category}">
      <span class="tag">${item.category === "veg" ? "Veg" : "Non-Veg"}</span>
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <strong>Rs ${Number(item.price).toFixed(0)}</strong>
    </article>
  `).join("");

  grid.querySelectorAll(".dish-card").forEach((card, index) => {
    card.classList.add("reveal", "is-visible");
    card.style.setProperty("--reveal-delay", `${Math.min(index, 4) * 80}ms`);
  });

  if (!filteredItems.length) {
    grid.innerHTML = '<article class="card empty-card">No items available in this category right now.</article>';
  }
}

async function submitBooking(event) {
  event.preventDefault();

  const booking = {
    name: document.getElementById("bookingName").value.trim(),
    phone: document.getElementById("bookingPhone").value.trim(),
    checkin: document.getElementById("checkin").value,
    checkout: document.getElementById("checkout").value,
    guests: document.getElementById("guests").value,
    roomType: document.getElementById("roomType").value
  };

  const status = document.getElementById("booking-status");
  const bookingValidation = validateBookingForm(booking);
  if (!bookingValidation.valid) {
    status.textContent = bookingValidation.message;
    return false;
  }

  status.textContent = "Saving your booking...";

  try {
    const result = await postFormData("/api/bookings", booking, "hotel-bookings");

    document.getElementById("booking-form").reset();
    status.textContent = result.message;
  } catch (error) {
    status.textContent = error.message || "Could not send booking right now. Please try again.";
  }

  return false;
}

async function submitInquiry(event) {
  event.preventDefault();

  const inquiry = {
    name: document.getElementById("name").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    email: document.getElementById("email").value.trim(),
    message: document.getElementById("message").value.trim()
  };

  const status = document.getElementById("inquiry-status");
  const inquiryValidation = validateInquiryForm(inquiry);
  if (!inquiryValidation.valid) {
    status.textContent = inquiryValidation.message;
    return false;
  }

  status.textContent = "Saving your inquiry...";

  try {
    const result = await postFormData("/api/inquiries", inquiry, "hotel-inquiries");

    document.querySelector(".contact-form").reset();
    status.textContent = result.message;
  } catch (error) {
    status.textContent = error.message || "Could not send inquiry right now. Please try again.";
  }

  return false;
}

async function postFormData(route, payload, storageKey) {
  try {
    const response = await fetch(`${API_BASE}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "Request failed.");
    }

    return result;
  } catch (error) {
    if (!isNetworkFailure(error)) {
      throw error;
    }

    saveSubmissionLocally(storageKey, payload);
    throw new Error("Server is offline right now. Please try again in a moment.");
  }
}

function isNetworkFailure(error) {
  return error instanceof TypeError || /fetch/i.test(String(error.message || ""));
}

function saveSubmissionLocally(storageKey, payload) {
  const savedItems = JSON.parse(localStorage.getItem(storageKey) || "[]");
  savedItems.push({
    id: `${storageKey}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...payload
  });
  localStorage.setItem(storageKey, JSON.stringify(savedItems));
}

function initializeBookingDates() {
  const today = getTodayDateString();
  const checkin = document.getElementById("checkin");
  const checkout = document.getElementById("checkout");

  checkin.min = today;
  checkout.min = today;

  checkin.addEventListener("change", () => {
    const nextDate = getNextDateString(checkin.value || today);
    checkout.min = nextDate;
    if (checkout.value && checkout.value <= checkin.value) {
      checkout.value = "";
    }
  });
}

function validateBookingForm(booking) {
  if (!/^\d{10}$/.test(booking.phone)) {
    return { valid: false, message: "Please enter a valid 10-digit phone number." };
  }

  const today = getTodayDateString();
  if (booking.checkin < today) {
    return { valid: false, message: "Check-in date cannot be before today." };
  }

  if (booking.checkout <= booking.checkin) {
    return { valid: false, message: "Check-out date must be after check-in date." };
  }

  return { valid: true };
}

function validateInquiryForm(inquiry) {
  if (!/^\d{10}$/.test(inquiry.phone)) {
    return { valid: false, message: "Please enter a valid 10-digit phone number." };
  }

  return { valid: true };
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextDateString(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const API_BASE = String(window.HOTEL_API_BASE || "").replace(/\/+$/, "");
