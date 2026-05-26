const ADMIN_STORAGE_KEY = "hotel-admin-key";
const API_BASE = String(window.HOTEL_API_BASE || "").replace(/\/+$/, "");

document.addEventListener("DOMContentLoaded", () => {
  const savedKey = localStorage.getItem(ADMIN_STORAGE_KEY);
  document.getElementById("admin-key-form").addEventListener("submit", handleAdminLogin);
  document.getElementById("menu-form").addEventListener("submit", handleMenuSubmit);
  document.getElementById("menu-cancel-btn").addEventListener("click", resetMenuForm);
  document.getElementById("test-email-btn").addEventListener("click", handleTestEmail);
  document.getElementById("admin-menu-list").addEventListener("click", handleMenuListClick);
  document.getElementById("booking-list").addEventListener("click", handleBookingListClick);
  document.getElementById("inquiry-list").addEventListener("click", handleInquiryListClick);

  if (savedKey) {
    document.getElementById("admin-key").value = savedKey;
    openDashboard(savedKey);
  }
});

async function handleAdminLogin(event) {
  event.preventDefault();
  const key = document.getElementById("admin-key").value.trim();
  if (!key) {
    setStatus("admin-status", "Enter the admin key.");
    return;
  }

  await openDashboard(key);
}

async function openDashboard(key) {
  setStatus("admin-status", "Checking access...");

  try {
    await fetchAdminJson("/api/bookings", key);
    localStorage.setItem(ADMIN_STORAGE_KEY, key);
    document.getElementById("login-section").hidden = true;
    document.getElementById("dashboard-section").hidden = false;
    await refreshDashboard();
  } catch (error) {
    setStatus("admin-status", error.message || "Could not open dashboard.");
  }
}

async function refreshDashboard() {
  const key = getAdminKey();
  const [menuItems, bookings, inquiries] = await Promise.all([
    fetchJson("/api/menu-items"),
    fetchAdminJson("/api/bookings", key),
    fetchAdminJson("/api/inquiries", key)
  ]);

  renderMenu(menuItems);
  renderBookings(bookings);
  renderInquiries(inquiries);
}

async function handleTestEmail() {
  setStatus("email-test-status", "Sending test email...");

  try {
    const result = await fetchAdminJson("/api/test-email", getAdminKey(), {
      method: "POST"
    });

    setStatus("email-test-status", result.message);
  } catch (error) {
    setStatus("email-test-status", error.message || "Could not send test email.");
  }
}

async function handleMenuSubmit(event) {
  event.preventDefault();

  const menuId = document.getElementById("menu-id").value;
  const payload = {
    name: document.getElementById("menu-name").value.trim(),
    category: document.getElementById("menu-category").value,
    price: Number(document.getElementById("menu-price").value),
    description: document.getElementById("menu-description").value.trim()
  };

  setStatus("menu-form-status", menuId ? "Updating item..." : "Adding item...");

  try {
    await fetchAdminJson(menuId ? `/api/menu-items/${encodeURIComponent(menuId)}` : "/api/menu-items", getAdminKey(), {
      method: menuId ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });

    resetMenuForm();
    setStatus("menu-form-status", menuId ? "Menu item updated." : "Menu item added.");
    await refreshDashboard();
  } catch (error) {
    setStatus("menu-form-status", error.message || "Could not save menu item.");
  }
}

async function handleMenuListClick(event) {
  const editButton = event.target.closest("[data-edit-menu-id]");
  if (editButton) {
    startMenuEdit(editButton.dataset);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-menu-id]");
  if (!deleteButton) {
    return;
  }

  if (!confirm("Delete this menu item?")) {
    return;
  }

  await fetchAdminJson(`/api/menu-items/${encodeURIComponent(deleteButton.dataset.deleteMenuId)}`, getAdminKey(), {
    method: "DELETE"
  });
  await refreshDashboard();
}

async function handleBookingListClick(event) {
  const button = event.target.closest("[data-delete-booking-id]");
  if (!button) {
    return;
  }

  if (!confirm("Delete this booking? Keep it until the booking is handled or no longer needed.")) {
    return;
  }

  await fetchAdminJson(`/api/bookings/${encodeURIComponent(button.dataset.deleteBookingId)}`, getAdminKey(), {
    method: "DELETE"
  });
  await refreshDashboard();
}

async function handleInquiryListClick(event) {
  const button = event.target.closest("[data-delete-inquiry-id]");
  if (!button) {
    return;
  }

  if (!confirm("Delete this inquiry? Keep it until the customer has been answered.")) {
    return;
  }

  await fetchAdminJson(`/api/inquiries/${encodeURIComponent(button.dataset.deleteInquiryId)}`, getAdminKey(), {
    method: "DELETE"
  });
  await refreshDashboard();
}

function startMenuEdit(item) {
  document.getElementById("menu-id").value = item.editMenuId;
  document.getElementById("menu-name").value = item.name;
  document.getElementById("menu-category").value = item.category;
  document.getElementById("menu-price").value = item.price;
  document.getElementById("menu-description").value = item.description;
  document.getElementById("menu-form-title").textContent = "Edit Menu Item";
  document.getElementById("menu-submit-btn").textContent = "Update Item";
  document.getElementById("menu-cancel-btn").hidden = false;
  setStatus("menu-form-status", "");
  document.getElementById("menu-form").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetMenuForm() {
  document.getElementById("menu-form").reset();
  document.getElementById("menu-id").value = "";
  document.getElementById("menu-form-title").textContent = "Add Menu Item";
  document.getElementById("menu-submit-btn").textContent = "Add Item";
  document.getElementById("menu-cancel-btn").hidden = true;
}

function renderMenu(items) {
  const list = document.getElementById("admin-menu-list");
  if (!items.length) {
    list.innerHTML = '<p class="empty-admin-state">No menu items yet.</p>';
    return;
  }

  list.innerHTML = items.map((item) => `
    <article class="admin-list-item">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.category === "veg" ? "Veg" : "Non-Veg"} | Rs ${Number(item.price).toFixed(0)}</span>
        <span class="admin-date-meta">Created: ${escapeHtml(formatDateTime(item.createdAt))}</span>
        <p>${escapeHtml(item.description)}</p>
      </div>
      <div class="admin-item-actions">
        <button type="button" class="secondary-btn compact-btn"
          data-edit-menu-id="${escapeHtml(item.id)}"
          data-name="${escapeHtml(item.name)}"
          data-category="${escapeHtml(item.category)}"
          data-price="${Number(item.price)}"
          data-description="${escapeHtml(item.description)}">Edit</button>
        <button type="button" class="danger-btn" data-delete-menu-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderBookings(bookings) {
  const list = document.getElementById("booking-list");
  if (!bookings.length) {
    list.innerHTML = '<p class="empty-admin-state">No bookings yet.</p>';
    return;
  }

  list.innerHTML = bookings.map((booking) => `
    <article class="admin-list-item">
      <div>
        <strong>${escapeHtml(booking.name)}</strong>
        <span>${escapeHtml(booking.phone)} | ${escapeHtml(booking.roomType)}</span>
        <span class="admin-date-meta">Received: ${escapeHtml(formatDateTime(booking.createdAt))}</span>
        <p>${escapeHtml(booking.checkin)} to ${escapeHtml(booking.checkout)} | ${escapeHtml(booking.guests)} guest(s)</p>
      </div>
      <button type="button" class="danger-btn" data-delete-booking-id="${escapeHtml(booking.id)}">Delete</button>
    </article>
  `).join("");
}

function renderInquiries(inquiries) {
  const list = document.getElementById("inquiry-list");
  if (!inquiries.length) {
    list.innerHTML = '<p class="empty-admin-state">No inquiries yet.</p>';
    return;
  }

  list.innerHTML = inquiries.map((inquiry) => `
    <article class="admin-list-item">
      <div>
        <strong>${escapeHtml(inquiry.name)}</strong>
        <span>${escapeHtml(inquiry.phone)} | ${escapeHtml(inquiry.email)}</span>
        <span class="admin-date-meta">Received: ${escapeHtml(formatDateTime(inquiry.createdAt))}</span>
        <p>${escapeHtml(inquiry.message)}</p>
      </div>
      <button type="button" class="danger-btn" data-delete-inquiry-id="${escapeHtml(inquiry.id)}">Delete</button>
    </article>
  `).join("");
}

async function fetchJson(route, options = {}) {
  const response = await fetch(`${API_BASE}${route}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Request failed.");
  }

  return result;
}

function fetchAdminJson(route, key, options = {}) {
  return fetchJson(route, {
    ...options,
    headers: {
      "x-admin-key": key,
      ...(options.headers || {})
    }
  });
}

function getAdminKey() {
  return localStorage.getItem(ADMIN_STORAGE_KEY) || "";
}

function setStatus(id, message) {
  document.getElementById(id).textContent = message;
}

function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(date);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
