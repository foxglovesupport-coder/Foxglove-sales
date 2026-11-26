import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let allUsers = [];
let recoveryMode = false;

const managerRoles = ["superadmin", "admin"];
const pages = ["loginPage", "resetPage", "dashboardPage"];
const sections = [
  "overviewSection",
  "usersSection",
  "formsSection",
  "builderSection",
  "assignmentSection",
  "submissionsSection",
  "reportsSection",
  "roiSection",
  "futureSection",
  "accountSection",
  "auditSection",
  "myReportSection",
];

const menuItems = [
  {
    id: "overview",
    label: "Dashboard",
    roles: ["superadmin", "admin", "user"],
  },
  { id: "users", label: "User Management", roles: managerRoles },
  { id: "builder", label: "Form Builder", roles: managerRoles },
  { id: "assign", label: "Form Assignment", roles: managerRoles },
  { id: "forms", label: "My Forms", roles: ["superadmin", "admin", "user"] },
  { id: "myReport", label: "My Reports & ROI", roles: ["user"] },
  { id: "reports", label: "Reports", roles: managerRoles },
  { id: "roi", label: "Product & ROI", roles: managerRoles },
  { id: "submissions", label: "Submissions", roles: managerRoles },
  { id: "audit", label: "Audit Logs", roles: managerRoles },
  {
    id: "account",
    label: "My Account",
    roles: ["superadmin", "admin", "user"],
  },
];

const futureModules = {
  assign: {
    title: "Form Assignment",
    description:
      "Assign forms and record-level permissions in the upcoming phase.",
  },
  reports: {
    title: "Reports",
    description:
      "Reports will be built after forms, assignments and data entry are working.",
  },
};

// ========================================
// HELPERS
// ========================================

function showPage(pageId) {
  pages.forEach((id) => {
    $(id)?.classList.toggle("hidden", id !== pageId);
  });
}

function showMessage(id, message, type = "error") {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.className = `message ${type}`;
}

function clearMessage(id) {
  const el = $(id);
  if (!el) return;
  el.textContent = "";
  el.className = "message hidden";
}

function friendlyError(error) {
  const message = error?.message || "Unknown error";
  const code = error?.code || "";

  if (code === "invalid_credentials") {
    return "Email या Password गलत है।";
  }
  if (code === "email_not_confirmed") {
    return "Email verify नहीं हुआ है। Inbox check करें।";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return "बहुत अधिक requests हुई हैं। थोड़ी देर बाद कोशिश करें।";
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Supabase connection failed. Internet और Project URL check करें।";
  }
  return `Operation failed: ${message}${code ? ` (${code})` : ""}`;
}

function setLoading(button, loading, label) {
  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : label;
}

function isManager() {
  return (
    currentProfile?.status === "active" &&
    managerRoles.includes(currentProfile?.role)
  );
}

function displayRole(role) {
  return (
    {
      superadmin: "Superadmin",
      admin: "Admin",
      user: "User",
    }[role] || "User"
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAuditDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function makeButton(text, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", handler);
  return button;
}

function makeInput(id, type, required = false) {
  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  input.required = required;
  if (type === "password") input.minLength = 12;
  return input;
}

function appendField(form, labelText, input) {
  const label = document.createElement("label");
  label.htmlFor = input.id;
  label.textContent = labelText;
  form.append(label, input);
}

async function invokeFunction(name, payload) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error("Session expired. Please login again.");
  }

  const { data, error } = await supabase.functions.invoke(name, {
    body: payload,
  });

  if (error) {
    let message = error.message;

    if (error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      message = body?.error || message;
    }

    throw new Error(message);
  }

  if (!data?.success) {
    throw new Error(data?.error || "Operation failed.");
  }

  return data;
}

// ========================================
// AUTHENTICATION
// ========================================

async function loadProfile(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, designation, role, status")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  if (!data) throw new Error("User profile not found.");

  if (data.status !== "active") {
    throw new Error(
      "ACCOUNT_ARCHIVED: आपका account inactive है। Administrator से संपर्क करें।",
    );
  }

  currentUser = user;
  currentProfile = data;

  renderAccount();
  renderNavigation();
  showPage("dashboardPage");
  await navigate("overview");
}

async function handleSession() {
  if (recoveryMode) return;

  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      currentUser = null;
      currentProfile = null;
      showPage("loginPage");
      return;
    }

    await loadProfile(data.user);
  } catch (error) {
    currentUser = null;
    currentProfile = null;
    await supabase.auth.signOut({ scope: "local" });
    showPage("loginPage");
    showMessage("loginMessage", friendlyError(error));
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("loginMessage");

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const button = $("loginBtn");

  setLoading(button, true, "Sign In");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error("Login unsuccessful.");

    if ($("rememberMe").checked) {
      localStorage.setItem("foxglove_email", email);
    } else {
      localStorage.removeItem("foxglove_email");
    }

    await loadProfile(data.user);
    $("loginPassword").value = "";
  } catch (error) {
    await supabase.auth.signOut({ scope: "local" });
    showPage("loginPage");
    showMessage("loginMessage", friendlyError(error));
  } finally {
    setLoading(button, false, "Sign In");
  }
});

$("togglePassword").addEventListener("click", () => {
  const input = $("loginPassword");
  const visible = input.type === "password";

  input.type = visible ? "text" : "password";
  $("togglePassword").textContent = visible ? "Hide" : "Show";
  $("togglePassword").setAttribute(
    "aria-label",
    visible ? "Hide password" : "Show password",
  );
});

$("logoutBtn").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    showMessage("appMessage", friendlyError(error));
    return;
  }

  currentUser = null;
  currentProfile = null;
  allUsers = [];
  showPage("loginPage");
  clearMessage("loginMessage");
});

// ========================================
// PASSWORD RESET
// ========================================

$("forgotPasswordBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();

  if (!email) {
    showMessage("loginMessage", "पहले Email Address डालें।");
    return;
  }

  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    showMessage("loginMessage", friendlyError(error));
  } else {
    showMessage(
      "loginMessage",
      "अगर account मौजूद है, तो password reset instructions भेज दी गई हैं। Inbox और Spam check करें।",
      "success",
    );
  }
});

$("resetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("resetMessage");

  const password = $("newPassword").value;
  const confirm = $("confirmPassword").value;

  if (password !== confirm) {
    showMessage("resetMessage", "दोनों passwords match नहीं कर रहे।");
    return;
  }

  if (password.length < 12) {
    showMessage("resetMessage", "Password कम-से-कम 12 characters का रखें।");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    showMessage("resetMessage", friendlyError(error));
    return;
  }

  recoveryMode = false;
  await supabase.auth.signOut();

  showMessage(
    "loginMessage",
    "Password successfully updated. अब नए password से login करें।",
    "success",
  );

  showPage("loginPage");
  window.history.replaceState({}, document.title, window.location.pathname);
});

// ========================================
// MY ACCOUNT
// ========================================

function renderAccount() {
  if (!currentProfile) return;

  const name = currentProfile.full_name || "User";
  const role = displayRole(currentProfile.role);

  $("welcomeText").textContent = `Welcome, ${name}`;
  $("accountName").textContent = name;
  $("accountRole").textContent = role;
  $("profileName").textContent = name;
  $("profileEmail").textContent = currentProfile.email;
  $("profileRole").textContent = role;
  $("profileStatus").textContent = currentProfile.status;
}

$("changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage("appMessage");

  const password = $("accountPassword").value;

  if (password.length < 12) {
    showMessage("appMessage", "Password कम-से-कम 12 characters का होना चाहिए।");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    showMessage("appMessage", friendlyError(error));
    return;
  }

  $("accountPassword").value = "";
  showMessage("appMessage", "Password successfully updated.", "success");
});

// ========================================
// SIDEBAR NAVIGATION
// ========================================

function renderNavigation() {
  const nav = $("sidebarNav");
  nav.replaceChildren();

  const allowedItems = menuItems.filter((item) =>
    item.roles.includes(currentProfile.role),
  );

  allowedItems.forEach((item) => {
    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.page = item.id;
    button.textContent = item.label;

    button.addEventListener("click", () => {
      navigate(item.id);
      $("sidebar").classList.remove("open");
    });

    nav.appendChild(button);
  });
}

async function navigate(page) {
  const allowed = menuItems.some(
    (item) => item.id === page && item.roles.includes(currentProfile?.role),
  );

  if (!allowed) {
    showMessage("appMessage", "आपको इस section की permission नहीं है।");
    return;
  }

  clearMessage("appMessage");

  sections.forEach((id) => {
    $(id)?.classList.add("hidden");
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  if (page === "myReport") {
    $("myReportSection").classList.remove("hidden");
    await mySalesLoad();
    return;
  }

  if (page === "roi") {
    $("roiSection").classList.remove("hidden");
    await foxRoiLoad();
    return;
  }

  if (page === "overview") {
    $("overviewSection").classList.remove("hidden");
    await loadDashboard();
  } else if (page === "users") {
    $("usersSection").classList.remove("hidden");
    await loadUsers();
  } else if (page === "builder") {
    if (!$("builderSection")) setupFormBuilderUI();
    $("builderSection").classList.remove("hidden");
    await loadBuilderForms();
  } else if (page === "audit") {
    if (!$("auditSection")) {
      showMessage("appMessage", "Audit Logs section missing in index.html.");
      return;
    }

    $("auditSection").classList.remove("hidden");
    await loadAuditLogs();
  } else if (page === "assign") {
    $("assignmentSection").classList.remove("hidden");
    await p6LoadAssignments();
  } else if (page === "reports") {
    $("reportsSection").classList.remove("hidden");
    await p8LoadReports();
  } else if (page === "submissions") {
    $("submissionsSection").classList.remove("hidden");
    await p6LoadSubmissions();
  } else if (page === "forms") {
    $("formsSection").classList.remove("hidden");
    await p6LoadMyForms();
  } else if (page === "account") {
    $("accountSection").classList.remove("hidden");
  } else {
    const module = futureModules[page];

    $("futureTitle").textContent = module?.title || page;
    $("futureDescription").textContent = module?.description || "Coming soon.";

    $("futureSection").classList.remove("hidden");
  }
}

$("menuToggle").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

// ========================================
// DASHBOARD STATISTICS
// ========================================

function createStatCard(label, value, icon) {
  const card = document.createElement("div");
  card.className = "stat-card";

  const symbol = document.createElement("div");
  symbol.className = "stat-icon";
  symbol.textContent = icon;

  const number = document.createElement("h2");
  number.textContent = value;

  const title = document.createElement("p");
  title.textContent = label;

  card.append(symbol, number, title);
  return card;
}

async function loadDashboard() {
  const grid = $("statsGrid");
  grid.replaceChildren();

  if (!isManager()) {
    grid.appendChild(createStatCard("Account Status", "Active", "👤"));

    $("dashboardSubtitle").textContent = "Your personal account dashboard";

    $("overviewInfo").textContent =
      "Assigned forms and your activity summary will appear here when those modules are ready.";

    return;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, status");

    if (error) throw error;

    const profiles = data || [];

    const stats = [
      ["Total Accounts", profiles.length, "👥"],
      [
        "Superadmins",
        profiles.filter((p) => p.role === "superadmin").length,
        "🛡️",
      ],
      ["Admins", profiles.filter((p) => p.role === "admin").length, "🔑"],
      ["Users", profiles.filter((p) => p.role === "user").length, "👤"],
      [
        "Active Accounts",
        profiles.filter((p) => p.status === "active").length,
        "✅",
      ],
      [
        "Archived Accounts",
        profiles.filter((p) => p.status === "archived").length,
        "📦",
      ],
    ];

    stats.forEach(([label, value, icon]) => {
      grid.appendChild(createStatCard(label, value, icon));
    });

    $("dashboardSubtitle").textContent =
      "Live account statistics from Supabase";

    $("overviewInfo").textContent =
      "Live account and form statistics. Open Reports for date filters, employee performance and CSV export.";
    await p8DashboardStats(grid);
  } catch (error) {
    showMessage("appMessage", friendlyError(error));
  }
}

// ========================================
// USER MANAGEMENT
// ========================================

async function loadUsers() {
  if (!isManager()) return;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, designation, role, status, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    allUsers = data || [];
    filterUsers();
  } catch (error) {
    showMessage("appMessage", friendlyError(error));
  }
}

function renderUsers(users) {
  const tbody = $("usersTableBody");
  tbody.replaceChildren();

  if (!users.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No users found.";
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  users.forEach((user) => {
    const row = document.createElement("tr");

    const values = [
      user.full_name || "—",
      user.email || "—",
      user.designation || "—",
      displayRole(user.role),
      user.status || "—",
      formatDate(user.created_at),
    ];

    values.forEach((value, index) => {
      const cell = document.createElement("td");

      if (index === 4) {
        const badge = document.createElement("span");
        badge.className = `status-pill ${
          user.status === "active" ? "active" : "archived"
        }`;
        badge.textContent = value;
        cell.appendChild(badge);
      } else {
        cell.textContent = value;
      }

      row.appendChild(cell);
    });

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "user-action-group";

    const canManage =
      currentProfile?.role === "superadmin" ||
      (currentProfile?.role === "admin" && user.role === "user");

    if (canManage) {
      actions.appendChild(
        makeButton("Edit", "user-action-btn edit", () => openEditUser(user)),
      );

      if (user.id !== currentUser?.id) {
        const archived = user.status === "archived";

        const statusButton = makeButton(
          archived ? "Restore" : "Archive",
          archived ? "user-action-btn restore" : "user-action-btn archive",
          () =>
            changeUserStatus(
              user,
              archived ? "restore" : "archive",
              statusButton,
            ),
        );

        actions.appendChild(statusButton);
      }
    } else {
      actions.textContent = "—";
    }

    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });

  $("usersCount").textContent = `Showing ${users.length} account(s)`;
}

function filterUsers() {
  const query = $("userSearch").value.toLowerCase().trim();

  const filtered = allUsers.filter((user) =>
    [user.full_name, user.email, user.role, user.designation, user.status].some(
      (value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
    ),
  );

  renderUsers(filtered);
}

$("userSearch").addEventListener("input", filterUsers);
$("refreshDashboard").addEventListener("click", loadDashboard);
$("refreshUsers").addEventListener("click", loadUsers);

// ========================================
// MODAL STYLING
// ========================================

function setupUserModalStyles() {
  if ($("foxgloveUserModalStyles")) return;

  const style = document.createElement("style");
  style.id = "foxgloveUserModalStyles";

  style.textContent = `
    .fg-user-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .fg-add-user-btn, .fg-save-btn {
      background: #153b70;
      color: white;
      border: 0;
      border-radius: 9px;
      padding: 12px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .fg-add-user-btn:hover, .fg-save-btn:hover {
      background: #0a2850;
    }
    .fg-add-user-btn[hidden] {
      display: none !important;
    }
    .fg-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(8,20,40,.68);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .fg-modal-overlay.hidden {
      display: none !important;
    }
    .fg-modal {
      background: white;
      color: #18243a;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      border-radius: 16px;
      padding: 26px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
    }
    .fg-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .fg-modal-header h2 {
      margin: 0;
      color: #153b70;
      font-size: 23px;
    }
    .fg-modal-subtitle {
      color: #687589;
      font-size: 13px;
      margin: 10px 0 20px;
    }
    .fg-close-btn {
      border: 0;
      background: #edf1f6;
      border-radius: 8px;
      padding: 7px 12px;
      font-size: 20px;
      cursor: pointer;
    }
    .fg-form-group {
      margin-bottom: 16px;
    }
    .fg-form-group label {
      display: block;
      margin-bottom: 7px;
    }
    .fg-form-group input,
    .fg-form-group select {
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      border: 1px solid #cfd7e3;
      border-radius: 8px;
      background: white;
      color: #172b45;
    }
    .fg-password-wrap {
      position: relative;
    }
    .fg-password-wrap input {
      padding-right: 76px;
    }
    .fg-password-toggle {
      position: absolute;
      top: 50%;
      right: 8px;
      transform: translateY(-50%);
      background: transparent;
      border: 0;
      color: #153b70;
      font-weight: 600;
      cursor: pointer;
      padding: 8px;
    }
    .fg-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 20px;
    }
    .fg-save-btn:disabled {
      opacity: .6;
      cursor: not-allowed;
    }
    .fg-cancel-btn {
      background: #edf1f6;
      color: #26384f;
      border: 0;
      border-radius: 8px;
      padding: 12px 18px;
      cursor: pointer;
    }
    .fg-form-message {
      font-size: 13px;
      margin-top: 12px;
    }
    .fg-form-message.error {
      color: #a91d1d;
    }
    .fg-form-message.success {
      color: #17804b;
    }
    @media(max-width:600px) {
      .fg-modal { padding: 20px; }
      .fg-modal-actions { flex-direction: column-reverse; }
      .fg-modal-actions button { width: 100%; }
    }
  `;

  document.head.appendChild(style);
}

// ========================================
// CREATE USER
// ========================================

function setupCreateUserUI() {
  const section = $("usersSection");
  if (!section || $("addNewUserBtn")) return;

  setupUserModalStyles();

  const addButton = makeButton(
    "+ Add New User",
    "fg-add-user-btn",
    openCreateUser,
  );

  addButton.id = "addNewUserBtn";
  addButton.hidden = true;

  const refreshButton = $("refreshUsers");

  const actions = document.createElement("div");
  actions.className = "fg-user-actions";

  refreshButton.parentNode.insertBefore(actions, refreshButton);
  actions.append(addButton, refreshButton);

  const overlay = document.createElement("div");
  overlay.id = "createUserOverlay";
  overlay.className = "fg-modal-overlay hidden";

  overlay.innerHTML = `
    <div class="fg-modal" role="dialog" aria-modal="true"
         aria-labelledby="fgCreateUserTitle">
      <div class="fg-modal-header">
        <h2 id="fgCreateUserTitle">Create New User</h2>
        <button type="button" class="fg-close-btn"
                id="closeCreateUserBtn" aria-label="Close">
          &times;
        </button>
      </div>
      <p class="fg-modal-subtitle">
        Foxglove Connect — User Management
      </p>
      <form id="createUserForm">
        <div class="fg-form-group">
          <label for="newUserName">Full Name *</label>
          <input id="newUserName" type="text"
                 required maxlength="120"
                 autocomplete="off">
        </div>
        <div class="fg-form-group">
          <label for="newUserEmail">Email Address *</label>
          <input id="newUserEmail" type="email"
                 required autocomplete="off">
        </div>
        <div class="fg-form-group">
          <label for="newUserDesignation">Designation</label>
          <input id="newUserDesignation" type="text"
                 maxlength="120">
        </div>
        <div class="fg-form-group">
          <label for="newUserRole">Select Role *</label>
          <select id="newUserRole" required></select>
        </div>
        <div class="fg-form-group">
          <label for="newUserPassword">Password *</label>
          <div class="fg-password-wrap">
            <input id="newUserPassword"
                   type="password"
                   minlength="12"
                   required autocomplete="new-password">
            <button type="button"
                    id="toggleNewUserPassword"
                    class="fg-password-toggle"
                    aria-label="Show password">Show</button>
          </div>
        </div>
        <div id="createUserMessage"
             class="fg-form-message"
             role="status"></div>
        <div class="fg-modal-actions">
          <button type="button" id="cancelCreateUserBtn"
                  class="fg-cancel-btn">Cancel</button>
          <button type="submit" id="saveNewUserBtn"
                  class="fg-save-btn">Create User</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  let submitting = false;
  let previousFocus = null;

  const form = $("createUserForm");
  const passwordInput = $("newUserPassword");
  const passwordToggle = $("toggleNewUserPassword");

  function hidePassword() {
    passwordInput.type = "password";
    passwordToggle.textContent = "Show";
    passwordToggle.setAttribute("aria-label", "Show password");
  }

  passwordToggle.addEventListener("click", () => {
    const visible = passwordInput.type === "password";
    passwordInput.type = visible ? "text" : "password";
    passwordToggle.textContent = visible ? "Hide" : "Show";
    passwordToggle.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password",
    );
  });

  function closeCreate() {
    if (submitting) return;

    overlay.classList.add("hidden");
    form.reset();
    hidePassword();
    $("createUserMessage").textContent = "";
    previousFocus?.focus?.();
  }

  function updateVisibility() {
    addButton.hidden = !isManager();
  }

  $("closeCreateUserBtn").addEventListener("click", closeCreate);
  $("cancelCreateUserBtn").addEventListener("click", closeCreate);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeCreate();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
      closeCreate();
    }
  });

  function openCreateUser() {
    if (!isManager()) return;

    previousFocus = document.activeElement;
    form.reset();
    hidePassword();

    const select = $("newUserRole");
    select.replaceChildren();

    const roles =
      currentProfile.role === "superadmin"
        ? ["user", "admin", "superadmin"]
        : ["user", "admin"];

    roles.forEach((role) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = displayRole(role);
      select.appendChild(option);
    });

    $("createUserMessage").textContent = "";
    $("createUserMessage").className = "fg-form-message";
    overlay.classList.remove("hidden");
    $("newUserName").focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !isManager()) return;

    const full_name = $("newUserName").value.trim();
    const email = $("newUserEmail").value.trim().toLowerCase();
    const designation = $("newUserDesignation").value.trim();
    const role = $("newUserRole").value;
    const password = passwordInput.value;

    const message = $("createUserMessage");
    const save = $("saveNewUserBtn");

    message.textContent = "";
    message.className = "fg-form-message";

    if (!full_name || !email || password.length < 12) {
      message.textContent =
        "Valid name, email और कम-से-कम 12 characters का password दें।";
      message.classList.add("error");
      return;
    }

    const allowedRoles =
      currentProfile.role === "superadmin"
        ? ["superadmin", "admin", "user"]
        : ["admin", "user"];

    if (!allowedRoles.includes(role)) {
      message.textContent = "You cannot create this role.";
      message.classList.add("error");
      return;
    }

    submitting = true;
    save.disabled = true;
    save.textContent = "Creating User...";

    try {
      const result = await invokeFunction("manage-users", {
        action: "create",
        full_name,
        email,
        designation,
        role,
        password,
      });

      form.reset();
      hidePassword();
      overlay.classList.add("hidden");
      previousFocus?.focus?.();

      showMessage(
        "appMessage",
        result.audit_logged === false
          ? `User ${email} created, but audit log could not be saved.`
          : `User ${email} successfully created.`,
        result.audit_logged === false ? "info" : "success",
      );

      await Promise.allSettled([loadUsers(), loadDashboard()]);
    } catch (error) {
      message.textContent = error?.message || "Unable to create user.";
      message.classList.add("error");
    } finally {
      submitting = false;
      save.disabled = false;
      save.textContent = "Create User";
    }
  });

  new MutationObserver(updateVisibility).observe(section, {
    attributes: true,
    attributeFilter: ["class"],
  });

  new MutationObserver(updateVisibility).observe($("dashboardPage"), {
    attributes: true,
    attributeFilter: ["class"],
  });

  updateVisibility();
}

// ========================================
// EDIT USER
// ========================================

let editingUserId = null;
let editingBusy = false;
let editPreviousFocus = null;

function setupEditUserUI() {
  if ($("editUserOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "editUserOverlay";
  overlay.className = "user-edit-overlay hidden";

  overlay.innerHTML = `
    <div class="user-edit-modal" role="dialog"
         aria-modal="true" aria-labelledby="editUserTitle">
      <div class="user-edit-header">
        <h2 id="editUserTitle">Edit User</h2>
        <button type="button" id="closeEditUser"
                class="user-edit-close"
                aria-label="Close">&times;</button>
      </div>
      <form id="editUserForm">
        <label for="editUserName">Full Name *</label>
        <input id="editUserName" type="text"
               maxlength="120" required>

        <label for="editUserEmail">Email Address *</label>
        <input id="editUserEmail" type="email" required>

        <label for="editUserDesignation">Designation</label>
        <input id="editUserDesignation" type="text"
               maxlength="120">

        <label for="editUserRole">Role *</label>
        <select id="editUserRole" required></select>

        <div id="editUserError" class="user-edit-error"
             role="alert"></div>

        <div class="user-edit-footer">
          <button type="button" id="cancelEditUser"
                  class="user-edit-cancel">Cancel</button>
          <button type="submit" id="saveEditUser"
                  class="user-edit-save">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  function closeEdit() {
    if (editingBusy) return;

    overlay.classList.add("hidden");
    editingUserId = null;
    $("editUserForm").reset();
    $("editUserError").textContent = "";
    editPreviousFocus?.focus?.();
  }

  $("closeEditUser").addEventListener("click", closeEdit);
  $("cancelEditUser").addEventListener("click", closeEdit);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeEdit();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
      closeEdit();
    }
  });

  $("editUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (editingBusy || !editingUserId) return;

    const targetId = editingUserId;
    const full_name = $("editUserName").value.trim();
    const email = $("editUserEmail").value.trim().toLowerCase();
    const designation = $("editUserDesignation").value.trim();
    const role = $("editUserRole").value;

    $("editUserError").textContent = "";

    if (!full_name || !email) {
      $("editUserError").textContent = "Name and email are required.";
      return;
    }

    editingBusy = true;

    const button = $("saveEditUser");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const result = await invokeFunction("user-actions", {
        action: "update",
        target_user_id: targetId,
        full_name,
        email,
        designation,
        role,
      });

      if (targetId === currentUser?.id) {
        currentProfile = {
          ...currentProfile,
          full_name,
          email,
          designation,
          role,
        };

        renderAccount();
        renderNavigation();
      }

      overlay.classList.add("hidden");
      editingUserId = null;

      showMessage(
        "appMessage",
        result.audit_logged === false
          ? "User updated, but audit log could not be saved."
          : "User successfully updated.",
        result.audit_logged === false ? "info" : "success",
      );

      await Promise.allSettled([loadUsers(), loadDashboard()]);
    } catch (error) {
      $("editUserError").textContent =
        error?.message || "Unable to update user.";
    } finally {
      editingBusy = false;
      button.disabled = false;
      button.textContent = "Save Changes";
    }
  });
}

function openEditUser(user) {
  if (!isManager()) return;

  if (currentProfile.role === "admin" && user.role !== "user") {
    return;
  }

  setupEditUserUI();

  editingUserId = user.id;
  editPreviousFocus = document.activeElement;

  $("editUserName").value = user.full_name || "";
  $("editUserEmail").value = user.email || "";
  $("editUserDesignation").value = user.designation || "";
  $("editUserError").textContent = "";

  const roleSelect = $("editUserRole");
  roleSelect.replaceChildren();

  const roles =
    currentProfile.role === "superadmin"
      ? ["user", "admin", "superadmin"]
      : ["user"];

  roles.forEach((role) => {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = displayRole(role);
    roleSelect.appendChild(option);
  });

  roleSelect.value = user.role;
  roleSelect.disabled = user.id === currentUser?.id;

  $("editUserOverlay").classList.remove("hidden");
  $("editUserName").focus();
}

// ========================================
// ARCHIVE / RESTORE USER
// ========================================

async function changeUserStatus(user, action, button) {
  if (!isManager()) return;

  if (currentProfile.role === "admin" && user.role !== "user") {
    return;
  }

  if (user.id === currentUser?.id) {
    showMessage(
      "appMessage",
      "You cannot archive or restore your own account.",
    );
    return;
  }

  const verb = action === "archive" ? "archive" : "restore";

  const confirmed = window.confirm(
    `Are you sure you want to ${verb} ${user.full_name || user.email}?`,
  );

  if (!confirmed) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Please wait...";

  try {
    const result = await invokeFunction("user-actions", {
      action,
      target_user_id: user.id,
    });

    showMessage(
      "appMessage",
      result.audit_logged === false
        ? `User ${verb} completed, but audit log could not be saved.`
        : `User successfully ${
            action === "archive" ? "archived" : "restored"
          }.`,
      result.audit_logged === false ? "info" : "success",
    );

    await Promise.allSettled([loadUsers(), loadDashboard()]);
  } catch (error) {
    showMessage(
      "appMessage",
      error?.message || "Unable to change user status.",
    );
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

// ========================================
// AUDIT LOGS
// ========================================

const AUDIT_PAGE_SIZE = 100;

let auditLogs = [];
let auditOffset = 0;
let auditHasMore = false;
let auditLoading = false;

const auditActionLabels = {
  USER_CREATED: "User Created",
  USER_UPDATED: "User Updated",
  USER_ARCHIVED: "User Archived",
  USER_RESTORED: "User Restored",
};

function getAuditActionClass(action) {
  return (
    {
      USER_CREATED: "created",
      USER_UPDATED: "updated",
      USER_ARCHIVED: "archived",
      USER_RESTORED: "restored",
    }[action] || ""
  );
}

function formatAuditDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "—";
  }

  const parts = [];

  if (
    details.previous_role &&
    details.new_role &&
    details.previous_role !== details.new_role
  ) {
    parts.push(`Role: ${details.previous_role} → ${details.new_role}`);
  }

  if (
    details.previous_status &&
    details.new_status &&
    details.previous_status !== details.new_status
  ) {
    parts.push(`Status: ${details.previous_status} → ${details.new_status}`);
  }

  if (details.name_changed === true) {
    parts.push("Name changed");
  }

  if (details.email_changed === true) {
    parts.push("Email changed");
  }

  if (details.designation_changed === true) {
    parts.push("Designation changed");
  }

  return parts.length ? parts.join(" | ") : "—";
}

function renderAuditLogs() {
  const tbody = $("auditTableBody");
  if (!tbody) return;

  tbody.replaceChildren();

  const search = $("auditSearch")?.value.trim().toLowerCase() || "";

  const filtered = auditLogs.filter((log) => {
    const searchable = [
      log.actor_name,
      log.actor_email,
      log.target_name,
      log.target_email,
      log.actor_id,
      log.target_user_id,
      log.action,
      auditActionLabels[log.action],
      formatAuditDetails(log.details),
    ];

    return searchable.some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(search),
    );
  });

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 5;
    cell.textContent = auditLoading
      ? "Loading audit logs..."
      : "No matching audit logs found.";

    row.appendChild(cell);
    tbody.appendChild(row);
  }

  filtered.forEach((log) => {
    const row = document.createElement("tr");

    const values = [
      formatAuditDate(log.created_at),
      log.actor_name || log.actor_email || log.actor_id || "Unknown",
      log.target_name || log.target_email || log.target_user_id || "Unknown",
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    const actionCell = document.createElement("td");
    const badge = document.createElement("span");

    badge.className = `audit-action-badge ${getAuditActionClass(log.action)}`;

    badge.textContent =
      auditActionLabels[log.action] || log.action || "Unknown";

    actionCell.appendChild(badge);
    row.appendChild(actionCell);

    const detailsCell = document.createElement("td");
    detailsCell.className = "audit-details";
    detailsCell.textContent = formatAuditDetails(log.details);
    row.appendChild(detailsCell);

    tbody.appendChild(row);
  });

  $("auditCount").textContent =
    `Showing ${filtered.length} of ${auditLogs.length} loaded logs` +
    (auditHasMore ? " — More available" : "");

  $("loadMoreAuditLogs").classList.toggle("hidden", !auditHasMore);

  $("loadMoreAuditLogs").disabled = auditLoading;
}

async function loadAuditLogs(loadMore = false) {
  if (!isManager() || auditLoading) return;

  if (
    !$("auditTableBody") ||
    !$("auditSearch") ||
    !$("auditActionFilter") ||
    !$("auditCount") ||
    !$("loadMoreAuditLogs")
  ) {
    showMessage("appMessage", "Audit Logs HTML elements are missing.");
    return;
  }

  auditLoading = true;

  const previous = {
    logs: auditLogs,
    offset: auditOffset,
    hasMore: auditHasMore,
  };

  if (!loadMore) {
    auditLogs = [];
    auditOffset = 0;
    auditHasMore = false;
  }

  renderAuditLogs();

  try {
    const actionFilter = $("auditActionFilter").value;

    let query = supabase
      .from("user_audit_logs")
      .select("id, actor_id, target_user_id, action, details, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (actionFilter !== "all") {
      query = query.eq("action", actionFilter);
    }

    const { data, error } = await query.range(
      auditOffset,
      auditOffset + AUDIT_PAGE_SIZE - 1,
    );

    if (error) throw error;

    const rows = data || [];

    const userIds = [
      ...new Set(
        rows
          .flatMap((log) => [log.actor_id, log.target_user_id])
          .filter(Boolean),
      ),
    ];

    const profileMap = new Map();

    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (profileError) throw profileError;

      (profiles || []).forEach((profile) => {
        profileMap.set(profile.id, profile);
      });
    }

    const enriched = rows.map((log) => {
      const actor = profileMap.get(log.actor_id);
      const target = profileMap.get(log.target_user_id);

      return {
        ...log,
        actor_name: actor?.full_name || null,
        actor_email: actor?.email || null,
        target_name: target?.full_name || null,
        target_email: target?.email || null,
      };
    });

    auditLogs = loadMore ? [...auditLogs, ...enriched] : enriched;

    auditOffset += rows.length;
    auditHasMore = rows.length === AUDIT_PAGE_SIZE;
  } catch (error) {
    auditLogs = previous.logs;
    auditOffset = previous.offset;
    auditHasMore = previous.hasMore;

    showMessage("appMessage", friendlyError(error));
  } finally {
    auditLoading = false;
    renderAuditLogs();
  }
}

$("auditSearch")?.addEventListener("input", renderAuditLogs);

$("auditActionFilter")?.addEventListener("change", () => loadAuditLogs());

$("refreshAuditLogs")?.addEventListener("click", () => loadAuditLogs());

$("loadMoreAuditLogs")?.addEventListener("click", () => loadAuditLogs(true));

// ========================================
// PHASE 5: DYNAMIC FORM BUILDER
// ========================================

const fbFieldTypes = [
  ["text", "Short Text"],
  ["textarea", "Long Text"],
  ["number", "Number"],
  ["date", "Date"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["select", "Dropdown"],
  ["checkbox", "Checkbox"],
];

let fbForms = [];
let fbCurrentId = null;
let fbFields = [];
let fbOriginalStatus = "draft";
let fbDirty = false;
let fbBusy = false;

let fbSelectedIndex = -1;
let fbDetailsEditing = false;
function setupFormBuilderUI() {
  if ($("createFormBtn")?.dataset.fbBound === "true") return;
  $("createFormBtn").dataset.fbBound = "true";
  $("createFormBtn").addEventListener("click", fbStartNew);
  $("fbDetailsForm").addEventListener("submit", fbSubmitDetails);
  $("fbCloseDetails").addEventListener("click", fbCloseDetails);
  $("fbCancelDetails").addEventListener("click", fbCloseDetails);
  $("fbDetailsOverlay").addEventListener("click", (e) => {
    if (e.target === $("fbDetailsOverlay")) fbCloseDetails();
  });
  $("fbEditDetailsBtn").addEventListener("click", () => fbOpenDetails(true));
  $("addFormFieldBtn").addEventListener("click", () => fbAddField("text"));
  for (const [type, label] of fbFieldTypes) {
    const btn = fbButton("＋ " + label, () => fbAddField(type));
    btn.classList.add("fb-palette-button");
    $("fbFieldPalette").appendChild(btn);
  }
  $("saveDraftBtn").addEventListener("click", () => fbSave("draft"));
  $("publishFormBtn").addEventListener("click", () => fbSave("published"));
  $("previewFormBtn").addEventListener("click", fbPreview);
  $("closeFormPreviewBtn").addEventListener("click", fbClosePreview);
  $("formPreviewOverlay").addEventListener("click", (e) => {
    if (e.target === $("formPreviewOverlay")) fbClosePreview();
  });
  $("backToFormsBtn").addEventListener("click", fbBackToList);
  $("refreshFormsBtn").addEventListener("click", loadBuilderForms);
  $("formSearch").addEventListener("input", fbRenderList);
  $("formStatusFilter").addEventListener("change", fbRenderList);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fbClosePreview();
      fbCloseDetails();
    }
  });
}
function fbOpenDetails(edit = false) {
  fbDetailsEditing = edit;
  $("fbDetailsHeading").textContent = edit
    ? "Edit Form Details"
    : "Create New Form";
  $("fbSubmitDetails").textContent = edit ? "Save Details" : "Create Form";
  $("fbDetailsTitle").value = edit ? $("formTitle").value : "";
  $("fbDetailsDescription").value = edit ? $("formDescription").value : "";
  $("fbDetailsOverlay").classList.remove("hidden");
  $("fbDetailsTitle").focus();
}
function fbCloseDetails() {
  $("fbDetailsOverlay").classList.add("hidden");
}
async function fbSubmitDetails(event) {
  event.preventDefault();
  if (!isManager() || fbBusy) return;
  const title = $("fbDetailsTitle").value.trim();
  const description = $("fbDetailsDescription").value.trim();
  if (!title) return;
  fbBusy = true;
  const button = $("fbSubmitDetails");
  button.disabled = true;
  try {
    if (fbDetailsEditing) {
      if (!fbCurrentId) throw new Error("Open a form first.");
      const { error } = await supabase
        .from("forms")
        .update({ title, description, updated_at: new Date().toISOString() })
        .eq("id", fbCurrentId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("forms")
        .insert({
          title,
          description,
          status: "draft",
          created_by: currentUser.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      fbReset();
      fbCurrentId = data.id;
    }
    $("formTitle").value = title;
    $("formDescription").value = description;
    fbDirty = false;
    fbCloseDetails();
    fbShowEditor(true);
    fbRenderFields();
    await loadBuilderForms();
    fbNotify(
      fbDetailsEditing
        ? "Form details saved."
        : "Form created. Now add fields from the left.",
      "success",
    );
  } catch (error) {
    fbNotify(friendlyError(error));
  } finally {
    fbBusy = false;
    button.disabled = false;
  }
}
function fbAddField(type) {
  if (!fbCurrentId) {
    fbNotify("First create the form name and description.");
    return;
  }
  fbFields.push(fbNewField({ field_type: type, label: "" }));
  fbSelectedIndex = fbFields.length - 1;
  fbDirty = true;
  fbRenderFields();
}
function fbNewField(field = {}) {
  return {
    id: field.id || null,
    label: field.label || "",
    field_type: field.field_type || "text",
    placeholder: field.placeholder || "",
    required: Boolean(field.required),
    options: Array.isArray(field.options) ? [...field.options] : [],
  };
}

function fbNode(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;

  if (className) {
    element.className = className;
  }

  return element;
}

function fbButton(text, handler, disabled = false) {
  const button = fbNode("button", text, "fb-btn");
  button.type = "button";
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}

function fbNotify(message, type = "error") {
  showMessage("formBuilderMessage", message, type);
}

function fbShowEditor(show) {
  $("formListPanel").classList.toggle("hidden", show);
  $("formEditorPanel").classList.toggle("hidden", !show);
  $("createFormBtn").classList.toggle("hidden", show);
}

function fbReset() {
  fbCurrentId = null;
  fbOriginalStatus = "draft";
  fbFields = [];
  fbSelectedIndex = -1;
  fbDirty = false;
  $("formTitle").value = "";
  $("formDescription").value = "";
  fbRenderFields();
}
function fbStartNew() {
  if (!isManager()) return;
  clearMessage("formBuilderMessage");
  fbOpenDetails(false);
}

async function loadBuilderForms() {
  if (!isManager() || !$("builderSection")) return;

  try {
    const { data, error } = await supabase
      .from("forms")
      .select("id,title,description,status,archived,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    fbForms = data || [];
    fbRenderList();
  } catch (error) {
    fbNotify(friendlyError(error));
  }
}

function fbRenderList() {
  const list = $("formList");
  if (!list) return;

  list.replaceChildren();

  const query = $("formSearch").value.trim().toLowerCase();
  const status = $("formStatusFilter").value;

  const rows = fbForms.filter(
    (form) =>
      (status === "all" ||
        (status === "archived"
          ? form.archived
          : !form.archived && form.status === status)) &&
      [form.title, form.description].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      ),
  );

  if (!rows.length) {
    list.appendChild(fbNode("p", "No forms found.", "fb-empty"));
    return;
  }

  for (const form of rows) {
    const card = fbNode(
      "article",
      "",
      "fb-card fb-pro-card" + (form.archived ? " fb-is-archived" : ""),
    );
    const header = fbNode("div", "", "fb-pro-header");
    header.appendChild(
      fbNode(
        "span",
        form.archived
          ? "Archived"
          : form.status === "published"
            ? "Published"
            : "Draft",
        `fb-status ${form.archived ? "archived" : form.status}`,
      ),
    );
    header.appendChild(
      fbNode("span", `Updated ${formatDate(form.updated_at)}`, "fb-pro-date"),
    );
    const description = fbNode(
      "p",
      form.description || "No description provided",
      "fb-pro-description",
    );
    const actions = fbNode("div", "", "fb-pro-actions");
    if (!form.archived) {
      actions.appendChild(fbButton("Edit Form", () => fbOpen(form.id)));
    }
    if (form.status === "published" || form.archived) {
      const toggle = fbButton(form.archived ? "Restore" : "Archive", () =>
        fbChangeArchive(form, !form.archived),
      );
      toggle.classList.add(form.archived ? "fb-restore-btn" : "fb-archive-btn");
      actions.appendChild(toggle);
    }
    if (currentProfile?.role === "superadmin") {
      const remove = fbButton("Delete", () => fbDeleteForm(form));
      remove.classList.add("fb-delete-btn");
      actions.appendChild(remove);
    }
    card.append(header, fbNode("h3", form.title), description, actions);
    list.appendChild(card);
  }
}

async function fbChangeArchive(form, archive) {
  if (!isManager()) return;
  if (
    !window.confirm(
      `${archive ? "Archive" : "Restore"} form “${form.title}”? ${archive ? "It will disappear from assigned users' available forms." : "Its existing assignments will become available again."}`,
    )
  )
    return;
  try {
    const { error } = await supabase.rpc("fox_set_form_archived", {
      p_form_id: form.id,
      p_archived: archive,
    });
    if (error) throw error;
    await loadBuilderForms();
    fbNotify(
      archive ? "Form archived successfully." : "Form restored successfully.",
      "success",
    );
  } catch (e) {
    fbNotify(friendlyError(e) + " — Run PHASE7_SUPABASE.sql first.");
  }
}
async function fbDeleteForm(form) {
  if (currentProfile?.role !== "superadmin") return;
  if (
    !window.confirm(
      `PERMANENT DELETE: “${form.title}”? All assignments, fields and submitted responses will be permanently removed.`,
    )
  )
    return;
  const confirmation = window.prompt(
    "Type DELETE to confirm permanent deletion:",
  );
  if (confirmation !== "DELETE") return;
  try {
    const { error } = await supabase.rpc("fox_delete_form", {
      p_form_id: form.id,
    });
    if (error) throw error;
    await loadBuilderForms();
    fbNotify("Form and related data permanently deleted.", "success");
  } catch (e) {
    fbNotify(friendlyError(e) + " — Run PHASE7_SUPABASE.sql first.");
  }
}

async function fbOpen(id) {
  if (!isManager()) return;

  clearMessage("formBuilderMessage");

  try {
    const { data: form, error: formError } = await supabase
      .from("forms")
      .select("id,title,description,status")
      .eq("id", id)
      .single();

    if (formError) throw formError;

    const { data: fields, error: fieldsError } = await supabase
      .from("form_fields")
      .select("id,label,field_type,placeholder,required,options,sort_order")
      .eq("form_id", id)
      .order("sort_order", { ascending: true });

    if (fieldsError) throw fieldsError;

    fbCurrentId = form.id;
    fbOriginalStatus = form.status;
    fbFields = (fields || []).map(fbNewField);

    $("formTitle").value = form.title;
    $("formDescription").value = form.description || "";

    fbDirty = false;
    fbSelectedIndex = fbFields.length ? 0 : -1;
    fbRenderFields();
    fbShowEditor(true);
  } catch (error) {
    fbNotify(friendlyError(error));
  }
}

function fbRenderFields() {
  const editor = $("formFieldsEditor");
  const canvas = $("fbLiveFields");
  if (!editor || !canvas) return;
  editor.replaceChildren();
  canvas.replaceChildren();
  $("fbWorkspaceTitle").textContent = $("formTitle").value || "Untitled Form";
  $("fbWorkspaceDescription").textContent =
    $("formDescription").value || "No description";
  $("fbCanvasTitle").textContent = $("formTitle").value || "Untitled Form";
  $("fbCanvasDescription").textContent = $("formDescription").value;
  $("fbFieldCount").textContent =
    `${fbFields.length} field${fbFields.length === 1 ? "" : "s"}`;
  if (!fbFields.length) {
    canvas.appendChild(
      fbNode(
        "div",
        "Your form is ready. Add fields from the left to build it.",
        "fb-canvas-empty",
      ),
    );
    editor.appendChild(
      fbNode("p", "Select a field type above to start.", "muted"),
    );
    return;
  }
  if (fbSelectedIndex >= fbFields.length) fbSelectedIndex = fbFields.length - 1;
  fbFields.forEach((field, index) => {
    const card = fbNode(
      "div",
      "",
      "fb-live-field" +
        (field.field_type === "textarea" ? " fb-span-full" : "") +
        (index === fbSelectedIndex ? " fb-selected" : ""),
    );
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Edit field ${field.label || index + 1}`);
    card.addEventListener("click", () => {
      fbSelectedIndex = index;
      fbRenderFields();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fbSelectedIndex = index;
        fbRenderFields();
      }
    });
    const top = fbNode("div", "", "fb-live-top");
    top.appendChild(
      fbNode(
        "strong",
        `${field.label || "Untitled field"}${field.required ? " *" : ""}`,
      ),
    );
    const actions = fbNode("div", "", "fb-live-actions");
    actions.append(
      fbButton(
        "↑",
        (e) => {
          fbMove(index, -1);
        },
        index === 0,
      ),
      fbButton(
        "↓",
        (e) => {
          fbMove(index, 1);
        },
        index === fbFields.length - 1,
      ),
      fbButton("×", () => {
        fbFields.splice(index, 1);
        fbSelectedIndex = Math.min(index, fbFields.length - 1);
        fbDirty = true;
        fbRenderFields();
      }),
    );
    actions.addEventListener("click", (e) => e.stopPropagation());
    top.appendChild(actions);
    card.appendChild(top);
    const control = fbMakeControl(field, true);
    card.appendChild(control);
    canvas.appendChild(card);
  });
  if (fbSelectedIndex < 0) {
    editor.appendChild(
      fbNode("p", "Click a field on the right to edit it.", "muted"),
    );
    return;
  }
  const field = fbFields[fbSelectedIndex];
  editor.appendChild(
    fbNode(
      "p",
      `Editing field ${fbSelectedIndex + 1} of ${fbFields.length}`,
      "fb-kicker",
    ),
  );
  const makeLabel = (text, control) => {
    const l = fbNode("label", text);
    editor.append(l, control);
  };
  const name = document.createElement("input");
  name.type = "text";
  name.maxLength = 150;
  name.value = field.label;
  name.placeholder = "e.g. Company Name";
  name.addEventListener("input", () => {
    field.label = name.value;
    fbDirty = true;
    fbRenderCanvasOnly();
  });
  makeLabel("Field Label *", name);
  const type = document.createElement("select");
  for (const [value, text] of fbFieldTypes) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    type.appendChild(opt);
  }
  type.value = field.field_type;
  type.addEventListener("change", () => {
    field.field_type = type.value;
    fbDirty = true;
    fbRenderFields();
  });
  makeLabel("Field Type", type);
  const placeholder = document.createElement("input");
  placeholder.type = "text";
  placeholder.maxLength = 200;
  placeholder.value = field.placeholder;
  placeholder.placeholder = "Placeholder text";
  placeholder.addEventListener("input", () => {
    field.placeholder = placeholder.value;
    fbDirty = true;
    fbRenderCanvasOnly();
  });
  makeLabel("Placeholder", placeholder);
  if (field.field_type === "select") {
    const options = document.createElement("textarea");
    options.rows = 5;
    options.value = field.options.join("\n");
    options.placeholder = "Option 1\nOption 2";
    options.addEventListener("input", () => {
      field.options = options.value
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      fbDirty = true;
      fbRenderCanvasOnly();
    });
    makeLabel("Dropdown Options (one per line)", options);
  }
  const requiredRow = fbNode("div", "", "fb-required-row");
  const required = document.createElement("input");
  required.type = "checkbox";
  required.checked = field.required;
  required.addEventListener("change", () => {
    field.required = required.checked;
    fbDirty = true;
    fbRenderCanvasOnly();
  });
  requiredRow.append(required, fbNode("span", "Required field"));
  editor.appendChild(requiredRow);
  editor.appendChild(
    fbNode(
      "p",
      "Long Text fields automatically use the full width. All other fields display two per row on desktop.",
      "muted",
    ),
  );
}
function fbRenderCanvasOnly() {
  const active = document.activeElement;
  // Update live canvas without rebuilding the editor and losing keyboard focus.
  const canvas = $("fbLiveFields");
  canvas.replaceChildren();
  fbFields.forEach((field, index) => {
    const card = fbNode(
      "div",
      "",
      "fb-live-field" +
        (field.field_type === "textarea" ? " fb-span-full" : "") +
        (index === fbSelectedIndex ? " fb-selected" : ""),
    );
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Edit field ${field.label || index + 1}`);
    card.addEventListener("click", () => {
      fbSelectedIndex = index;
      fbRenderFields();
    });
    const top = fbNode("div", "", "fb-live-top");
    top.appendChild(
      fbNode(
        "strong",
        `${field.label || "Untitled field"}${field.required ? " *" : ""}`,
      ),
    );
    const actions = fbNode("div", "", "fb-live-actions");
    actions.append(
      fbButton("↑", () => fbMove(index, -1), index === 0),
      fbButton("↓", () => fbMove(index, 1), index === fbFields.length - 1),
      fbButton("×", () => {
        fbFields.splice(index, 1);
        fbSelectedIndex = Math.min(index, fbFields.length - 1);
        fbDirty = true;
        fbRenderFields();
      }),
    );
    actions.addEventListener("click", (e) => e.stopPropagation());
    top.appendChild(actions);
    card.append(top, fbMakeControl(field, true));
    canvas.appendChild(card);
  });
}
function fbMakeControl(field, disabled = false) {
  let control;
  if (field.field_type === "textarea") {
    control = document.createElement("textarea");
    control.rows = 3;
  } else if (field.field_type === "select") {
    control = document.createElement("select");
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Select an option";
    control.appendChild(first);
    for (const value of field.options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      control.appendChild(option);
    }
  } else {
    control = document.createElement("input");
    control.type = { phone: "tel" }[field.field_type] || field.field_type;
  }
  if (control.type === "number") control.step = "any";
  control.placeholder = field.placeholder || "";
  control.required = field.required;
  control.disabled = disabled;
  return control;
}

function fbMove(index, delta) {
  const next = index + delta;

  if (next < 0 || next >= fbFields.length) return;

  [fbFields[index], fbFields[next]] = [fbFields[next], fbFields[index]];

  fbSelectedIndex = next;
  fbDirty = true;
  fbRenderFields();
}

function fbValidate(requireFields = true) {
  const title = $("formTitle").value.trim();

  if (!title) {
    throw new Error("Form Title required है।");
  }

  if (title.length > 150) {
    throw new Error("Form Title बहुत लंबा है।");
  }

  if (requireFields && !fbFields.length) {
    throw new Error("Publish करने से पहले कम-से-कम एक field जोड़ें।");
  }

  for (let i = 0; i < fbFields.length; i++) {
    const field = fbFields[i];

    if (!field.label.trim()) {
      throw new Error(`Field ${i + 1} का label required है।`);
    }

    if (field.field_type === "select" && !field.options.length) {
      throw new Error(`Field ${i + 1} में dropdown options जोड़ें।`);
    }
  }
}

async function fbSave(status) {
  if (!isManager() || fbBusy) return;

  try {
    fbValidate(status === "published");
  } catch (error) {
    fbNotify(error.message);
    return;
  }

  if (fbCurrentId && fbOriginalStatus === "published" && status === "draft") {
    fbNotify("Published form को Draft में वापस नहीं कर सकते।");
    return;
  }

  fbBusy = true;
  clearMessage("formBuilderMessage");

  $("saveDraftBtn").disabled = true;
  $("publishFormBtn").disabled = true;

  let formId = fbCurrentId;

  try {
    const payload = {
      title: $("formTitle").value.trim(),
      description: $("formDescription").value.trim(),
      updated_at: new Date().toISOString(),
    };

    if (!formId) {
      const { data, error } = await supabase
        .from("forms")
        .insert({
          ...payload,
          status: "draft",
          created_by: currentUser.id,
        })
        .select("id")
        .single();

      if (error) throw error;

      formId = data.id;
      fbCurrentId = formId;
    } else {
      const { error } = await supabase
        .from("forms")
        .update(payload)
        .eq("id", formId);

      if (error) throw error;
    }

    // The database requires form_fields.id and may not have a UUID default.
    // Generate IDs only for new fields; preserve IDs for existing fields.
    const rows = fbFields.map((field, index) => ({
      id: field.id || crypto.randomUUID(),
      form_id: formId,
      label: field.label.trim(),
      field_type: field.field_type,
      placeholder: field.placeholder.trim(),
      required: field.required,
      options: field.field_type === "select" ? field.options : [],
      sort_order: index,
    }));

    let saved = [];
    if (rows.length) {
      const { data, error: fieldError } = await supabase
        .from("form_fields")
        .upsert(rows)
        .select("id,label,field_type,placeholder,required,options,sort_order");
      if (fieldError) throw fieldError;
      saved = data || [];
    }

    const ids = (saved || []).map((field) => field.id);

    const { data: existing, error: readError } = await supabase
      .from("form_fields")
      .select("id")
      .eq("form_id", formId);

    if (readError) throw readError;

    const removed = (existing || [])
      .map((field) => field.id)
      .filter((id) => !ids.includes(id));

    if (removed.length) {
      const { error: deleteError } = await supabase
        .from("form_fields")
        .delete()
        .eq("form_id", formId)
        .in("id", removed);

      if (deleteError) throw deleteError;
    }

    if (status !== fbOriginalStatus) {
      const { error: statusError } = await supabase
        .from("forms")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", formId);

      if (statusError) throw statusError;
    }

    fbFields = (saved || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(fbNewField);

    fbOriginalStatus = status;
    fbDirty = false;

    fbRenderFields();
    await loadBuilderForms();

    fbNotify(
      status === "published"
        ? "Form successfully published."
        : "Draft saved successfully.",
      "success",
    );
  } catch (error) {
    fbNotify("Save incomplete: " + friendlyError(error));
  } finally {
    fbBusy = false;
    $("saveDraftBtn").disabled = false;
    $("publishFormBtn").disabled = false;
  }
}

function fbPreview() {
  const content = $("formPreviewContent");
  content.replaceChildren();
  content.append(
    fbNode("h2", $("formTitle").value || "Untitled Form"),
    fbNode("p", $("formDescription").value || "", "muted"),
  );
  const grid = fbNode("div", "", "fb-live-grid fb-preview-grid");
  for (const field of fbFields) {
    const wrapper = fbNode(
      "div",
      "",
      "fb-preview-field" +
        (field.field_type === "textarea" ? " fb-span-full" : ""),
    );
    wrapper.append(
      fbNode(
        "label",
        `${field.label || "Untitled field"}${field.required ? " *" : ""}`,
      ),
      fbMakeControl(field, false),
    );
    grid.appendChild(wrapper);
  }
  if (!fbFields.length)
    grid.appendChild(fbNode("p", "No fields added yet.", "muted"));
  content.appendChild(grid);
  content.appendChild(
    fbNode("p", "Preview only — responses are not submitted.", "muted"),
  );
  $("formPreviewOverlay").classList.remove("hidden");
}

function fbClosePreview() {
  $("formPreviewOverlay").classList.add("hidden");
}

function fbBackToList() {
  if (fbBusy) return;

  if (fbDirty && !window.confirm("Unsaved changes discard करें?")) {
    return;
  }

  fbReset();
  clearMessage("formBuilderMessage");
  fbShowEditor(false);
  loadBuilderForms();
}

// ========================================
// INITIALIZATION
// ========================================

async function initializeApp() {
  const savedEmail = localStorage.getItem("foxglove_email");

  if (savedEmail) {
    $("loginEmail").value = savedEmail;
    $("rememberMe").checked = true;
  }

  const url = new URL(window.location.href);

  recoveryMode =
    url.searchParams.get("type") === "recovery" ||
    url.hash.includes("type=recovery");

  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      showPage("resetPage");
    }

    if (event === "SIGNED_OUT") {
      currentUser = null;
      currentProfile = null;

      if (!recoveryMode) {
        showPage("loginPage");
      }
    }
  });

  setupCreateUserUI();
  setupFormBuilderUI();

  if (recoveryMode) {
    showPage("resetPage");
    return;
  }

  await handleSession();
}

initializeApp();

// ========================================
// PHASE 6: ASSIGNMENTS, MY FORMS, SUBMISSIONS
// Requires PHASE6_SUPABASE.sql to be run first.
// ========================================
let p6CurrentForm = null;
let p6EditingSubmission = null;
let p6CurrentFields = [];
let p6AssignedForms = [];
let p6MyAssignments = [];
const p6Text = (id, value) => {
  const el = $(id);
  if (el) el.textContent = value ?? "";
};
const p6Msg = (id, message, type = "error") => showMessage(id, message, type);
function p6Option(select, value, label) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  select.appendChild(el);
}
function p6EmptyRow(tbody, columns, message) {
  const tr = document.createElement("tr"),
    td = document.createElement("td");
  td.colSpan = columns;
  td.textContent = message;
  tr.appendChild(td);
  tbody.appendChild(tr);
}
async function p6LoadAssignments() {
  if (!isManager()) return;
  clearMessage("p6AssignMessage");
  try {
    const [formsRes, usersRes, assignRes] = await Promise.all([
      supabase
        .from("forms")
        .select("id,title,status,archived")
        .eq("status", "published")
        .eq("archived", false)
        .order("title"),
      supabase
        .from("profiles")
        .select("id,full_name,email,status,role")
        .eq("status", "active")
        .order("full_name"),
      supabase
        .from("form_assignments")
        .select("id,form_id,user_id,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    for (const r of [formsRes, usersRes, assignRes]) if (r.error) throw r.error;
    const forms = formsRes.data || [],
      users = usersRes.data || [],
      assignments = assignRes.data || [];
    const fs = $("p6FormSelect"),
      us = $("p6UserSelect");
    const oldForm = fs.value, oldUser = us.value;
    fs.replaceChildren();
    us.replaceChildren();
    p6Option(fs, "", "Select a published form");
    p6Option(us, "", "Select an account (any role)");
    forms.forEach((f) => p6Option(fs, f.id, f.title));
    users.forEach((u) =>
      p6Option(us, u.id, `${u.full_name || u.email} (${u.role}) — ${u.email}`),
    );
    if ([...fs.options].some(x => x.value === oldForm)) fs.value = oldForm;
    if ([...us.options].some(x => x.value === oldUser)) us.value = oldUser;
    const body = $("p6AssignmentsBody");
    body.replaceChildren();
    if (!assignments.length) p6EmptyRow(body, 4, "No assignments yet.");
    for (const a of assignments) {
      const tr = document.createElement("tr");
      const form = forms.find((f) => f.id === a.form_id),
        user = users.find((u) => u.id === a.user_id);
      for (const value of [
        form?.title || "Unknown form",
        user?.full_name || user?.email || "Unknown account",
        formatDate(a.created_at),
      ]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      const td = document.createElement("td");
      const btn = makeButton(
        "Unassign",
        "user-action-btn archive",
        async () => {
          if (!confirm("Remove this form assignment?")) return;
          btn.disabled = true;
          const { error } = await supabase
            .from("form_assignments")
            .delete()
            .eq("id", a.id);
          if (error) {
            p6Msg("p6AssignMessage", friendlyError(error));
            btn.disabled = false;
          } else await p6LoadAssignments();
        },
      );
      td.appendChild(btn);
      tr.appendChild(td);
      body.appendChild(tr);
    }
  } catch (e) {
    p6Msg(
      "p6AssignMessage",
      friendlyError(e) +
        " — Run PHASE6_SUPABASE.sql in Supabase SQL Editor first.",
    );
  }
}
async function p6Assign() {
  const form_id = $("p6FormSelect").value,
    user_id = $("p6UserSelect").value;
  if (!form_id || !user_id) {
    p6Msg("p6AssignMessage", "Please select a form and account.");
    return;
  }
  const btn = $("p6AssignBtn");
  btn.disabled = true;
  try {
    const { error } = await supabase
      .from("form_assignments")
      .upsert(
        { form_id, user_id, assigned_by: currentUser.id },
        { onConflict: "form_id,user_id" },
      );
    if (error) throw error;
    await p6LoadAssignments();
    p6Msg("p6AssignMessage", "Form assigned successfully.", "success");
  } catch (e) {
    p6Msg("p6AssignMessage", friendlyError(e));
  } finally {
    btn.disabled = false;
  }
}
async function p6LoadMyForms({preserveEditor = false} = {}) {
  clearMessage("p6MyMessage");
  if (!preserveEditor || $("p6FillPanel").classList.contains("hidden")) {
    $("p6FillPanel").classList.add("hidden");
    $("p6MyList").classList.remove("hidden");
    $("p6History").classList.remove("hidden");
    p6EditingSubmission = null;
  }
  try {
    const { data: assignments, error } = await supabase
      .from("form_assignments")
      .select("form_id")
      .eq("user_id", currentUser.id);
    if (error) throw error;
    p6MyAssignments = (assignments || []).map((a) => a.form_id);
    let forms = [];
    if (p6MyAssignments.length) {
      const r = await supabase
        .from("forms")
        .select("id,title,description,status,archived")
        .in("id", p6MyAssignments)
        .eq("status", "published")
        .eq("archived", false)
        .order("title");
      if (r.error) throw r.error;
      forms = r.data || [];
    }
    p6AssignedForms = forms;
    const list = $("p6MyList");
    list.replaceChildren();
    if (!forms.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No published forms assigned to you yet.";
      list.appendChild(p);
    }
    forms.forEach((f) => {
      const card = document.createElement("div");
      card.className = "p6-card";
      const title = document.createElement("h3"),
        desc = document.createElement("p");
      title.textContent = f.title;
      desc.textContent = f.description || "No description";
      card.append(
        title,
        desc,
        makeButton("Fill Form", "secondary-btn", () => p6OpenForm(f)),
      );
      list.appendChild(card);
    });
    await p6LoadHistory();
  } catch (e) {
    p6Msg(
      "p6MyMessage",
      friendlyError(e) + " — Database setup may be required.",
    );
  }
}
async function p6LoadHistory() {
  const list = $("p6HistoryList");
  list.replaceChildren();
  const data = [];
  for (let offset = 0; ; offset += 500) {
    const { data: batch, error } = await supabase
      .from("form_submissions")
      .select("id,form_id,submitted_at,answers")
      .eq("submitted_by", currentUser.id)
      .order("submitted_at", { ascending: false })
      .range(offset, offset + 499);
    if (error) { p6Msg("p6MyMessage", friendlyError(error)); return; }
    data.push(...(batch || []));
    if ((batch || []).length < 500) break;
  }
  if (!data.length) {
    list.textContent = "No submissions yet.";
    return;
  }
  const renderHistory = () => {
    list.replaceChildren();
    for (const item of foxPageSlice("history", data)) {
    const row = document.createElement("div");
    row.className = "p6-history-row";
    const form = p6AssignedForms.find(f => f.id === item.form_id);
    const label = document.createElement("span");
    label.textContent = `${form?.title || "Form (not currently assigned)"} — ${formatAuditDate(item.submitted_at)}`;
    row.appendChild(label);
    if (form) row.appendChild(makeButton("Edit", "secondary-btn", () => p6OpenForm(form, item)));
    list.appendChild(row);
    }
    foxPageControls("history", list, data.length, renderHistory);
  };
  renderHistory();
}
async function p6OpenForm(form, submission = null) {
  clearMessage("p6MyMessage");
  try {
    const { data, error } = await supabase
      .from("form_fields")
      .select("id,label,field_type,placeholder,required,options,sort_order")
      .eq("form_id", form.id)
      .order("sort_order");
    if (error) throw error;
    p6CurrentForm = form;
    p6EditingSubmission = submission;
    p6CurrentFields = data || [];
    p6Text("p6FillTitle", form.title);
    p6Text("p6FillDescription", form.description || "");
    const container = $("p6FillFields");
    container.replaceChildren();
    for (const field of p6CurrentFields) {
      const wrapper = document.createElement("div");
      if (field.field_type === "textarea") wrapper.className = "p6-full";
      const label = document.createElement("label");
      label.htmlFor = `p6_field_${field.id}`;
      label.textContent = field.label + (field.required ? " *" : "");
      wrapper.appendChild(label);
      let input;
      if (field.field_type === "textarea")
        input = document.createElement("textarea");
      else if (field.field_type === "select") {
        input = document.createElement("select");
        p6Option(input, "", "Select an option");
        const opts = Array.isArray(field.options) ? field.options : [];
        opts.forEach((opt) => p6Option(input, String(opt), String(opt)));
      } else {
        input = document.createElement("input");
        input.type =
          {
            phone: "tel",
            checkbox: "checkbox",
            number: "number",
            date: "date",
            email: "email",
          }[field.field_type] || "text";
      }
      if (input.type === "number") input.step = "any";
      input.id = `p6_field_${field.id}`;
      input.name = field.id;
      input.required = !!field.required;
      if (foxIsEmployeeField(field.label)) {
        if (field.field_type !== "text" && field.field_type !== "email") {
          input = document.createElement("input");
          input.type = "text";
          input.id = `p6_field_${field.id}`;
          input.name = field.id;
        }
        input.value = currentProfile?.full_name || "";
        input.readOnly = true;
        input.setAttribute("aria-readonly", "true");
        input.classList.add("fox-locked");
        const note = document.createElement("small");
        note.className = "muted";
        note.textContent = "Automatically filled from your login profile";
        wrapper.appendChild(note);
      }
      if (submission && !foxIsEmployeeField(field.label)) {
        const old = submission.answers?.[field.id];
        if (field.field_type === "checkbox") input.checked = old === true || old === "true";
        else if (old !== null && old !== undefined) input.value = String(old);
      }
      if (field.placeholder && field.field_type !== "checkbox")
        input.placeholder = field.placeholder;
      wrapper.appendChild(input);
      container.appendChild(wrapper);
    }
    $("p6SubmitBtn").textContent = submission ? "Update Submission" : "Submit Form";
    $("p6MyList").classList.add("hidden");
    $("p6History").classList.add("hidden");
    $("p6FillPanel").classList.remove("hidden");
  } catch (e) {
    p6Msg("p6MyMessage", friendlyError(e));
  }
}
async function p6Submit(event) {
  event.preventDefault();
  if (!p6CurrentForm) return;
  const values = {};
  for (const field of p6CurrentFields) {
    const input = $(`p6_field_${field.id}`);
    values[field.id] = foxIsEmployeeField(field.label)
      ? currentProfile?.full_name || ""
      : field.field_type === "checkbox"
        ? input.checked
        : field.field_type === "number"
          ? input.value === ""
            ? null
            : Number(input.value)
          : input.value;
  }
  const btn = $("p6SubmitBtn");
  btn.disabled = true;
  try {
    const request = p6EditingSubmission
      ? supabase.from("form_submissions")
          .update({ answers: values })
          .eq("id", p6EditingSubmission.id)
          .eq("submitted_by", currentUser.id)
          .eq("form_id", p6CurrentForm.id)
          .select("id")
          .single()
      : supabase.from("form_submissions")
          .insert({form_id: p6CurrentForm.id, submitted_by: currentUser.id, answers: values})
          .select("id")
          .single();
    const { error } = await request;
    if (error) throw error;
    await p6LoadMyForms();
    p6Msg("p6MyMessage", "Submission saved successfully. ROI will reflect the updated data after refresh.", "success");
  } catch (e) {
    p6Msg("p6MyMessage", friendlyError(e));
  } finally {
    btn.disabled = false;
  }
}
// Display pagination only: 10 visible records per page, with numbered page buttons.
const foxPageState = new Map();
function foxPageSlice(key, records) {
  const pages = Math.max(1, Math.ceil(records.length / 10));
  const current = Math.min(foxPageState.get(key) || 0, pages - 1);
  foxPageState.set(key, current);
  return records.slice(current * 10, current * 10 + 10);
}
function foxPageControls(key, anchor, count, redraw) {
  if (!anchor) return;
  let nav = document.getElementById('foxPager_' + key);
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'foxPager_' + key;
    nav.className = 'fox-pagination';
    nav.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;margin:14px 0;';
    anchor.insertAdjacentElement('afterend', nav);
  }
  nav.replaceChildren();
  const pages = Math.ceil(count / 10);
  if (pages <= 1) return;
  const current = Math.min(foxPageState.get(key) || 0, pages - 1);
  const add = (label, page, active = false) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary-btn';
    btn.textContent = label;
    btn.disabled = page === current;
    btn.setAttribute('aria-label', 'Go to page ' + (page + 1));
    if (active) { btn.style.fontWeight = 'bold'; btn.setAttribute('aria-current', 'page'); }
    btn.addEventListener('click', () => { foxPageState.set(key, page); redraw(); });
    nav.append(btn);
  };
  add('Previous', Math.max(0, current - 1));
  const start = Math.max(0, Math.min(current - 2, pages - 5));
  for (let i = start; i < Math.min(pages, start + 5); i++) add(String(i + 1), i, i === current);
  add('Next', Math.min(pages - 1, current + 1));
}
function foxTablePager(key, bodyId, records, renderRow) {
  const body = $(bodyId);
  body.replaceChildren();
  const currentRows = foxPageSlice(key, records);
  currentRows.forEach(renderRow);
  foxPageControls(key, body.closest('table'), records.length,
    () => foxTablePager(key, bodyId, records, renderRow));
}
let p6SubAll = [];
let p6SubForms = [];
let p6SubUsers = [];
let p6SubFields = [];
function p6SubPopulate(id, rows, defaultText, textFn) {
  const select = $(id), old = select.value;
  select.replaceChildren();
  p6Option(select, "", defaultText);
  for (const x of rows) p6Option(select, x.id, textFn(x));
  if ([...select.options].some(o => o.value === old)) select.value = old;
}
function p6RenderSubmissions() {
  const form = $("p6SubForm").value, user = $("p6SubUser").value;
  const entryId = $("p6SubId").value.trim().toLowerCase();
  const filtered = p6SubAll.filter(x => entryId ? x.id.toLowerCase() === entryId : ((!form || x.form_id === form) && (!user || x.submitted_by === user)));
  const visible = foxPageSlice("submissions", filtered);
  const body = $("p6SubmissionsBody");
  body.replaceChildren();
  $("p6SubCount").textContent = `${filtered.length} matching submissions`;
  if (!filtered.length) p6EmptyRow(body, 6, "No submissions match these filters.");
  for (const sub of visible) {
    const tr = document.createElement("tr"),
      formRow = p6SubForms.find(f => f.id === sub.form_id),
      userRow = p6SubUsers.find(u => u.id === sub.submitted_by);
    for (const v of [formatAuditDate(sub.submitted_at), formRow?.title || "Unknown form", userRow?.full_name || userRow?.email || "Unknown account"]) {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    }
    const td = document.createElement("td"), details = document.createElement("details"),
      summary = document.createElement("summary"), pre = document.createElement("div");
    summary.textContent = "View Answers";
    pre.className = "p6-details";
    pre.textContent = Object.entries(sub.answers || {}).map(([id, val]) =>
      `${p6SubFields.find(f => f.id === id)?.label || id}: ${typeof val === "boolean" ? (val ? "Yes" : "No") : (val ?? "—")}`
    ).join("\n");
    details.append(summary, pre); td.appendChild(details); tr.appendChild(td);
    const idCell = document.createElement("td"); idCell.textContent = sub.id; tr.appendChild(idCell);
    const actions = document.createElement("td");
    if (isManager()) actions.append(makeButton("Edit", "secondary-btn", () => managerEntryEdit(sub)), makeButton("Delete", "secondary-btn", () => managerEntryDelete(sub)));
    tr.appendChild(actions); body.appendChild(tr);
  }
  foxPageControls("submissions", body.closest("table"), filtered.length, p6RenderSubmissions);
}
async function p6LoadSubmissions() {
  clearMessage("p6SubmissionsMessage");
  try {
    const [formsRes, usersRes] = await Promise.all([
      supabase.from("forms").select("id,title").order("title"),
      supabase.from("profiles").select("id,full_name,email").order("full_name"),
    ]);
    if (formsRes.error) throw formsRes.error;
    if (usersRes.error) throw usersRes.error;
    p6SubForms = formsRes.data || [];
    p6SubUsers = usersRes.data || [];
    // Read all matching records in pages; never silently hide records after 200.
    const all = [];
    for (let offset = 0; ; offset += 500) {
      const r = await supabase.from("form_submissions")
        .select("id,form_id,submitted_by,answers,submitted_at")
        .order("submitted_at", {ascending:false}).order("id", {ascending:false})
        .range(offset, offset+499);
      if (r.error) throw r.error;
      all.push(...(r.data || []));
      if ((r.data || []).length < 500) break;
    }
    p6SubAll = all;
    const ids = [...new Set(all.map(x => x.form_id))];
    p6SubFields = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await supabase.from("form_fields").select("id,form_id,label").in("form_id", ids.slice(i,i+100));
      if (r.error) throw r.error;
      p6SubFields.push(...(r.data || []));
    }
    p6SubPopulate("p6SubForm", p6SubForms, "All Forms", x => x.title);
    p6SubPopulate("p6SubUser", p6SubUsers, "All Users", x => x.full_name || x.email || x.id);
    p6RenderSubmissions();
  } catch (e) { p6Msg("p6SubmissionsMessage", friendlyError(e)); }
}
function p6Setup() {
  $("p6RefreshAssignments").addEventListener("click", p6LoadAssignments);
  $("p6AssignBtn").addEventListener("click", p6Assign);
  $("p6RefreshMy").addEventListener("click", () => p6LoadMyForms({preserveEditor:true}));
  $("p6BackMy").addEventListener("click", p6LoadMyForms);
  $("p6FillForm").addEventListener("submit", p6Submit);
  $("p6RefreshSubmissions").addEventListener("click", p6LoadSubmissions);
  $("p6SubUser").addEventListener("change", p6RenderSubmissions);
  $("p6SubForm").addEventListener("change", p6RenderSubmissions);
  $("p6SubId").addEventListener("input", () => { foxPageState.set("submissions", 0); p6RenderSubmissions(); });
  $("p6SubClear").addEventListener("click", () => {
    $("p6SubId").value = "";
    $("p6SubUser").value = "";
    $("p6SubForm").value = "";
    p6RenderSubmissions();
  });
}
p6Setup();

// ========================================
// PHASE 8 — REPORTS AND ANALYTICS
// ========================================
const p8State = {
  page: 0,
  pageSize: 10,
  total: 0,
  forms: [],
  users: [],
  fields: [],
  filters: {},
  loaded: false,
  busy: false,
};
const p8Safe = (value) =>
  value === null || value === undefined
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
const p8Name = (id) => {
  const u = p8State.users.find((x) => x.id === id);
  return u
    ? `${u.full_name || u.email || "Account"} (${u.role || "user"})`
    : "Unknown account";
};
const p8FormName = (id) =>
  p8State.forms.find((x) => x.id === id)?.title || "Deleted / unknown form";
const p8Date = (value) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function p8Query() {
  let q = supabase
    .from("form_submissions")
    .select("id,form_id,submitted_by,answers,submitted_at", { count: "exact" });
  const f = p8State.filters;
  if (f.form) q = q.eq("form_id", f.form);
  if (f.employee) q = q.eq("submitted_by", f.employee);
  return q;
}
async function p8LoadLookups() {
  const [fr, ur] = await Promise.all([
    supabase.from("forms").select("id,title,status,archived").order("title"),
    supabase
      .from("profiles")
      .select("id,full_name,email,role,status")
      .order("full_name"),
  ]);
  if (fr.error) throw fr.error;
  if (ur.error) throw ur.error;
  p8State.forms = fr.data || [];
  p8State.users = ur.data || [];
  for (const [id, rows, first] of [
    ["p8Form", p8State.forms, "All forms"],
    ["p8Employee", p8State.users, "All accounts"],
  ]) {
    const el = $(id),
      old = el.value;
    el.replaceChildren();
    p6Option(el, "", first);
    for (const item of rows)
      p6Option(
        el,
        item.id,
        id === "p8Form"
          ? item.title
          : `${item.full_name || item.email} (${item.role})`,
      );
    el.value = old;
  }
  p8State.loaded = true;
}
function p8GetFilters() {
  return {
    form: $("p8Form").value,
    employee: $("p8Employee").value,
  };
}
function p8ValidateFilters(f) {
  // Only form and account filters are available.
}
function p8Metric(label, value) {
  const box = document.createElement("div");
  box.className = "p8-metric";
  const l = document.createElement("span"),
    v = document.createElement("strong");
  l.textContent = label;
  v.textContent = Number(value).toLocaleString("en-IN");
  box.append(l, v);
  return box;
}
async function p8LoadReports(reloadLookups = false) {
  if (!isManager()) return;
  if (p8State.busy) return;
  p8State.busy = true;
  clearMessage("p8Message");
  try {
    if (!p8State.loaded || reloadLookups) await p8LoadLookups();
    p8ValidateFilters(p8State.filters);
    const start = p8State.page * p8State.pageSize;
    const r = await p8Query()
      .order("submitted_at", { ascending: false })
      .range(start, start + p8State.pageSize - 1);
    if (r.error) throw r.error;
    p8State.total = r.count || 0;
    const rows = r.data || [],
      body = $("p8Rows");
    body.replaceChildren();
    const formIds = [...new Set(rows.map((x) => x.form_id))];
    let fields = [];
    if (formIds.length) {
      const result = await supabase
        .from("form_fields")
        .select("id,form_id,label,sort_order")
        .in("form_id", formIds);
      if (result.error) throw result.error;
      fields = result.data || [];
    }
    if (!rows.length)
      p6EmptyRow(body, 4, "No submissions match these filters.");
    for (const entry of rows) {
      const tr = document.createElement("tr");
      for (const value of [
        p8Date(entry.submitted_at),
        p8FormName(entry.form_id),
        p8Name(entry.submitted_by),
      ]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      const td = document.createElement("td"),
        details = document.createElement("details"),
        summary = document.createElement("summary"),
        answers = document.createElement("div");
      summary.textContent = "View Answers";
      answers.className = "p8-answers";
      answers.textContent =
        Object.entries(entry.answers || {})
          .map(
            ([id, value]) =>
              `${fields.find((x) => x.id === id)?.label || id}: ${p8Safe(value)}`,
          )
          .join("\n") || "No answers";
      details.append(summary, answers);
      td.appendChild(details);
      tr.appendChild(td);
      body.appendChild(tr);
    }
    $("p8Count").textContent =
      `${p8State.total.toLocaleString("en-IN")} matching submissions`;
    $("p8PageLabel").textContent =
      `Page ${p8State.page + 1} of ${Math.max(1, Math.ceil(p8State.total / p8State.pageSize))}`;
    $("p8Prev").disabled = p8State.page === 0;
    $("p8Next").disabled = start + p8State.pageSize >= p8State.total;
    const totalPages = Math.ceil(p8State.total / p8State.pageSize);
    let pager = document.getElementById("foxPager_reports");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "foxPager_reports";
      pager.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:10px 0;";
      $("p8PageLabel").insertAdjacentElement("afterend", pager);
    }
    pager.replaceChildren();
    if (totalPages > 1) {
      const first = Math.max(0, Math.min(p8State.page - 2, totalPages - 5));
      for (let i = first; i < Math.min(totalPages, first + 5); i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "secondary-btn";
        btn.textContent = String(i + 1);
        btn.disabled = i === p8State.page;
        if (i === p8State.page) btn.setAttribute("aria-current", "page");
        btn.addEventListener("click", () => { p8State.page = i; p8LoadReports(); });
        pager.append(btn);
      }
    }
    await p8Performance();
  } catch (e) {
    showMessage("p8Message", friendlyError(e));
  } finally {
    p8State.busy = false;
  }
}
// Aggregate only a bounded, explicitly disclosed number of records. Pagination stays server-side.
async function p8Performance() {
  const limit = 10000,
    step = 500,
    counts = new Map();
  let seen = 0;
  while (seen < Math.min(limit, p8State.total)) {
    const r = await p8Query().range(
      seen,
      Math.min(seen + step, limit, p8State.total) - 1,
    );
    if (r.error) throw r.error;
    for (const x of r.data || [])
      counts.set(x.submitted_by, (counts.get(x.submitted_by) || 0) + 1);
    if (!(r.data || []).length) break;
    seen += r.data.length;
  }
  const summary = $("p8Summary");
  summary.replaceChildren();
  summary.append(
    p8Metric("Matching submissions", p8State.total),
    p8Metric("Active submitters (sample)", counts.size),
    p8Metric(
      "Forms in selected results",
      new Set((await p8DistinctFormsSample()).map((x) => x.form_id)).size,
    ),
  );
  const target = $("p8Performance");
  target.replaceChildren();
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    target.textContent = "No employee performance data for selected filters.";
    return;
  }
  const max = sorted[0][1];
  for (const [id, count] of sorted.slice(0, 25)) {
    const row = document.createElement("div");
    row.className = "p8-perf-row";
    const label = document.createElement("span");
    label.textContent = p8Name(id);
    const bar = document.createElement("div");
    bar.className = "p8-bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(1, (100 * count) / max)}%`;
    bar.appendChild(fill);
    const num = document.createElement("strong");
    num.textContent = count.toLocaleString("en-IN");
    row.append(label, bar, num);
    target.appendChild(row);
  }
  if (p8State.total > limit) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = `Performance chart samples the first ${limit.toLocaleString("en-IN")} matching submissions; totals and paginated records remain exact.`;
    target.appendChild(note);
  }
}
async function p8DistinctFormsSample() {
  const r = await p8Query().range(0, Math.min(p8State.total, 1000) - 1);
  if (r.error) throw r.error;
  return r.data || [];
}
function p8CsvCell(value) {
  let str = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(str)) str = "'" + str;
  return '"' + str.replace(/"/g, '""') + '"';
}
async function p8ExportCsv() {
  if (!isManager() || p8State.busy) return;
  // Export exactly the filters currently selected on screen.
  const selectedFilters = p8GetFilters();
  if (JSON.stringify(selectedFilters) !== JSON.stringify(p8State.filters)) {
    p8State.filters = selectedFilters;
    p8State.page = 0;
    await p8LoadReports();
  }
  p8State.busy = true;
  const btn = $("p8Export");
  btn.disabled = true;
  clearMessage("p8Message");
  try {
    const limit = 10000,
      step = 500,
      entries = [];
    for (let start = 0; start < limit; start += step) {
      const r = await p8Query()
        .order("submitted_at", { ascending: false })
        .range(start, start + step - 1);
      if (r.error) throw r.error;
      entries.push(...(r.data || []));
      if ((r.data || []).length < step) break;
    }
    if (!entries.length) {
      showMessage("p8Message", "No matching submissions to export.", "info");
      return;
    }
    const ids = [...new Set(entries.map((x) => x.form_id))];
    const fieldMap = new Map();
    for (let start = 0; start < ids.length; start += 100) {
      const r = await supabase
        .from("form_fields")
        .select("id,form_id,label,sort_order")
        .in("form_id", ids.slice(start, start + 100));
      if (r.error) throw r.error;
      for (const f of r.data || []) fieldMap.set(f.id, f);
    }
    const keys = [
      ...new Set(entries.flatMap((x) => Object.keys(x.answers || {}))),
    ];
    keys.sort(
      (a, b) =>
        (fieldMap.get(a)?.sort_order ?? 999) -
        (fieldMap.get(b)?.sort_order ?? 999),
    );
    const header = [
      "Submission ID",
      "Submitted At (IST)",
      "Form",
      "Account",
      "Account ID",
      ...keys.map((k) => `${fieldMap.get(k)?.label || "Field"} [${k}]`),
    ];
    const lines = [header.map(p8CsvCell).join(",")];
    for (const x of entries) {
      const row = [
        x.id,
        p8Date(x.submitted_at),
        p8FormName(x.form_id),
        p8Name(x.submitted_by),
        x.submitted_by,
        ...keys.map((k) =>
          p8Safe(x.answers?.[k]) === "—" ? "" : p8Safe(x.answers?.[k]),
        ),
      ];
      lines.push(row.map(p8CsvCell).join(","));
    }
    const blob = new Blob(["\ufeff", lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `foxglove-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showMessage(
      "p8Message",
      `Exported ${entries.length.toLocaleString("en-IN")} submissions.${p8State.total > limit ? " Export capped at 10,000 rows; narrow the filters for the remaining records." : ""}`,
      "success",
    );
  } catch (e) {
    showMessage("p8Message", friendlyError(e));
  } finally {
    btn.disabled = false;
    p8State.busy = false;
  }
}
async function p8DashboardStats(grid) {
  try {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const [allForms, activeForms, allSubs, todaySubs] = await Promise.all([
      supabase.from("forms").select("id", { count: "exact", head: true }),
      supabase
        .from("forms")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("archived", false),
      supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .gte("submitted_at", `${today}T00:00:00+05:30`),
    ]);
    for (const r of [allForms, activeForms, allSubs, todaySubs])
      if (r.error) throw r.error;
    [
      ["Total Forms", allForms.count, "📝"],
      ["Active Published Forms", activeForms.count, "📋"],
      ["Total Submissions", allSubs.count, "📊"],
      ["Today Submissions (IST)", todaySubs.count, "📅"],
    ].forEach(([label, n, icon]) =>
      grid.appendChild(createStatCard(label, n || 0, icon)),
    );
  } catch (e) {
    showMessage(
      "appMessage",
      `Form statistics unavailable: ${friendlyError(e)}`,
    );
  }
}
function p8Setup() {
  $("p8Refresh").addEventListener("click", () => p8LoadReports(true));
  $("p8Apply").addEventListener("click", () => {
    p8State.filters = p8GetFilters();
    p8State.page = 0;
    p8LoadReports();
  });
  $("p8Clear").addEventListener("click", () => {
    for (const id of ["p8Form", "p8Employee"])
      $(id).value = "";
    p8State.filters = {};
    p8State.page = 0;
    p8LoadReports();
  });
  $("p8Prev").addEventListener("click", () => {
    if (p8State.page > 0) {
      p8State.page--;
      p8LoadReports();
    }
  });
  $("p8Next").addEventListener("click", () => {
    if ((p8State.page + 1) * p8State.pageSize < p8State.total) {
      p8State.page++;
      p8LoadReports();
    }
  });
  $("p8Export").addEventListener("click", p8ExportCsv);
}
p8Setup();

// ROI report module. Loaded after app.js in the same module scope via import.
const foxIsEmployeeField = (label) =>
  /^(employee\s*name|employee|sales\s*person|salesperson)$/i.test(
    String(label || "").trim(),
  );
const foxMoney = (v) =>
  v == null
    ? "Incomplete"
    : Number(v).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      });
const foxPct = (v) => (v == null ? "n.a." : Number(v).toFixed(2) + "%");
function foxOptions(id, items, all) {
  const el = $(id),
    old = el.value;
  el.replaceChildren();
  p6Option(el, "", all);
  items.forEach((x) => p6Option(el, x.value, x.label));
  if ([...el.options].some((x) => x.value === old)) el.value = old;
}
async function foxFetchAll(table, columns) {
  let out = [];
  for (let i = 0; ; i += 1000) {
    const r = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(i, i + 999);
    if (r.error) throw r.error;
    out.push(...(r.data || []));
    if ((r.data || []).length < 1000) return out;
  }
}
function foxRows(id, rows, n, empty) {
  const b = $(id);
  b.replaceChildren();
  for (const row of foxPageSlice(id, rows)) {
    const tr = document.createElement("tr");
    for (const v of row) {
      const td = document.createElement("td");
      td.textContent = v ?? "—";
      tr.append(td);
    }
    b.append(tr);
  }
  if (!rows.length) p6EmptyRow(b, n, empty);
  foxPageControls(id, b.closest("table"), rows.length, () => foxRows(id, rows, n, empty));
}
let foxRequest = 0;
async function foxRender() {
  const request = ++foxRequest;
  clearMessage("foxMessage");
  try {
    const r = await supabase.rpc("fox_roi_report", {
      p_month: $("foxMonth").value ? $("foxMonth").value + "-01" : null,
      p_employee: $("foxUser").value || null,
      p_product: $("foxProduct").value || null,
      p_client: null,
      p_group: "employee",
    });
    if (request !== foxRequest) return;
    if (r.error) throw r.error;
    const d = r.data,
      t = d.totals,
      scope = t.company_scope;
    const metrics = [
      ["Sales / Revenue", foxMoney(t.revenue)],
      ["Payment Received", foxMoney(t.received)],
      ["Outstanding", foxMoney(t.outstanding)],
      ["Purchase Cost", foxMoney(t.cost)],
      ["Gross Profit", foxMoney(t.gross)],
      ["Total Expenses", scope ? foxMoney(t.expenses) : "Company-wide only"],
      ["Net Profit / Loss", scope ? foxMoney(t.net) : "Company-wide only"],
      ["ROI on Cost", t.incomplete ? "Incomplete" : foxPct(t.roi)],
      ["Gross Margin", t.incomplete ? "Incomplete" : foxPct(t.margin)],
    ];
    $("foxMetrics").replaceChildren();
    for (const [k, v] of metrics) {
      const el = document.createElement("div");
      el.className = "fox-metric";
      const a = document.createElement("span"),
        b = document.createElement("strong");
      a.textContent = k;
      b.textContent = v;
      el.append(a, b);
      $("foxMetrics").append(el);
    }
    $("foxScopeNote").textContent = scope
      ? "SQL-calculated company totals. Expenses deducted once per month."
      : "Filtered gross profitability only; company expenses are not allocated.";
    $("foxIssue").textContent = [
      ...d.issues.map(
        (x) => `${x.month} / ${x.product} / ${x.category}: ${x.issue}`,
      ),
      ...d.sync_errors.map((x) => `Sync ${x.id}: ${x.message}`),
    ].join("; ");
    foxRows(
      "foxRoiRows",
      d.groups.map((g) => [
        g.name,
        g.n,
        foxMoney(g.revenue),
        foxMoney(g.received),
        foxMoney(g.outstanding),
        foxMoney(g.cost),
        foxMoney(g.gross),
        g.incomplete ? "CHECK DATA" : foxPct(g.roi),
      ]),
      8,
      "No matching sales.",
    );
    foxRows(
      "foxMonthlyBody",
      d.monthly.map((m) => [
        m.month.slice(0, 7),
        foxMoney(m.revenue),
        foxMoney(m.received),
        foxMoney(m.outstanding),
        foxMoney(m.cost),
        foxMoney(m.gross),
        foxMoney(m.expenses),
        foxMoney(m.net),
      ]),
      8,
      scope
        ? "No monthly data."
        : "Clear employee and product filters for company totals.",
    );
  } catch (e) {
    if (request === foxRequest) {
      $("foxMetrics").replaceChildren();
      $("foxRoiRows").replaceChildren();
      $("foxMonthlyBody").replaceChildren();
      showMessage("foxMessage", friendlyError(e) + " — Check PHASE10_ROI.sql.");
    }
  }
}
async function foxRoiLoad() {
  if (!isManager()) return;
  clearMessage("foxMessage");
  try {
    const [sales, rates, expenses, users] = await Promise.all([
      foxFetchAll(
        "sales",
        "id,sale_month,employee_id,employee_name,product,client_name",
      ),
      foxFetchAll("product_purchase", "*"),
      foxFetchAll("expenses", "*"),
      foxFetchAll("profiles", "id,full_name,email,status"),
    ]);
    const months = [
      ...new Set(
        [
          ...sales.map((s) => s.sale_month),
          ...rates.map((s) => s.purchase_month),
          ...expenses.map((s) => s.expense_month),
        ].map((x) => x.slice(0, 7)),
      ),
    ]
      .sort()
      .reverse();
    foxOptions(
      "foxMonth",
      months.map((x) => ({ value: x, label: x })),
      "All Months / Total",
    );
    const u = new Map(users.map((x) => [x.id, x.full_name || x.email]));
    sales.forEach((x) => {
      if (x.employee_id && !u.has(x.employee_id))
        u.set(x.employee_id, x.employee_name || "Unknown");
    });
    foxOptions(
      "foxUser",
      [...u].map(([value, label]) => ({ value, label })),
      "All Employees",
    );
    for (const [id, key, label] of [
      ["foxProduct", "product", "All Products"],
    ])
      foxOptions(
        id,
        [...new Set(sales.map((x) => x[key]).filter(Boolean))]
          .sort()
          .map((x) => ({ value: x, label: x })),
        label,
      );
    foxRows(
      "foxRatesBody",
      rates.map((x) => [
        x.purchase_month.slice(0, 7),
        x.product,
        x.category,
        x.purchase_rate,
        "Form submission",
      ]),
      5,
      "No purchase rates.",
    );
    foxRows(
      "foxExpensesBody",
      expenses.map((x) => [
        x.expense_name,
        foxMoney(x.amount),
        x.expense_month.slice(0, 7),
        "Form submission",
      ]),
      4,
      "No expenses.",
    );
    await foxRender();
  } catch (e) {
    $("foxMetrics").replaceChildren();
    showMessage("foxMessage", friendlyError(e) + " — Verify Phase 10 setup.");
  }
}
function foxRoiSetup() {
  for (const id of [
    "foxMonth",
    "foxUser",
    "foxProduct",
  ])
    $(id).addEventListener("change", foxRender);
  $("foxRefresh").addEventListener("click", foxRoiLoad);
}
foxRoiSetup();

// Personal sales report: server returns only the signed-in user's permitted totals.
let mySalesData = [], mySalesRequest = 0;
function mySalesFiltered() {
  return mySalesData.filter(x => (!$("mySalesMonth").value || x.sale_month.slice(0,7) === $("mySalesMonth").value) && (!$("mySalesProduct").value || x.product === $("mySalesProduct").value));
}
function mySalesRender() {
  const rows = mySalesFiltered();
  const totals = rows.reduce((a,x) => [a[0]+Number(x.revenue),a[1]+Number(x.received),a[2]+Number(x.outstanding)], [0,0,0]);
  $("mySalesMetrics").replaceChildren(...["Sales / Revenue","Payment Received","Outstanding"].map((label,i) => createStatCard(label,foxMoney(totals[i]),"₹")));
  foxRows("mySalesRows",rows.map(x => [x.sale_month.slice(0,7),x.product,foxMoney(x.revenue),foxMoney(x.received),foxMoney(x.outstanding)]),5,"No matching sales.");
}
async function mySalesLoad() {
  const request = ++mySalesRequest, owner = currentUser?.id;
  mySalesData = []; mySalesRender(); clearMessage("mySalesMessage");
  $("mySalesExport").disabled = true;
  try {
    const r = await supabase.rpc("fox_my_sales_report");
    if (request !== mySalesRequest || currentUser?.id !== owner) return;
    if (r.error) throw r.error;
    mySalesData = r.data || [];
    for (const [id,values,label] of [["mySalesMonth",mySalesData.map(x=>x.sale_month.slice(0,7)),"All Months"],["mySalesProduct",mySalesData.map(x=>x.product),"All Products"]]) foxOptions(id,[...new Set(values)].sort().reverse().map(x=>({value:x,label:x})),label);
    mySalesRender(); $("mySalesExport").disabled = false;
  } catch(e) { if(request===mySalesRequest) showMessage("mySalesMessage",friendlyError(e)); }
}
for (const id of ["mySalesMonth","mySalesProduct"]) $(id).addEventListener("change",()=>{foxPageState.set("mySalesRows",0);mySalesRender();});
$("mySalesRefresh").addEventListener("click",mySalesLoad);
$("mySalesExport").addEventListener("click",()=>{
  const rows = mySalesFiltered();
  const lines = [["Month","Product","Sales / Revenue","Payment Received","Outstanding"],...rows.map(x=>[x.sale_month.slice(0,7),x.product,x.revenue,x.received,x.outstanding])];
  const url=URL.createObjectURL(new Blob(["\ufeff",lines.map(r=>r.map(p8CsvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="my-sales-report.csv";a.click();URL.revokeObjectURL(url);
});
let managerEditing = null;
async function managerEntryEdit(sub) {
  if (!isManager()) return;
  clearMessage("p6SubmissionsMessage");
  try {
    const r=await supabase.from("form_fields").select("id,label,field_type,required,options,sort_order").eq("form_id",sub.form_id).order("sort_order");
    if(r.error) throw r.error;
    if(!r.data?.length) throw new Error("No editable form fields found.");
    managerEditing={sub,fields:r.data};
    const box=$("managerEntryFields");box.replaceChildren();
    for(const f of r.data){
      const wrap=document.createElement("div"), label=document.createElement("label");label.textContent=f.label;wrap.append(label);
      const input=document.createElement(f.field_type==="select"?"select":f.field_type==="textarea"?"textarea":"input");
      input.id="manager_field_"+f.id;label.htmlFor=input.id;
      if(f.field_type==="select"){p6Option(input,"","Select an option");for(const opt of f.options||[])p6Option(input,String(opt),String(opt));if(sub.answers?.[f.id]!=null && ![...input.options].some(o=>o.value===String(sub.answers[f.id])))p6Option(input,String(sub.answers[f.id]),String(sub.answers[f.id]));}
      else if(input.tagName==="INPUT")input.type=({number:"number",date:"date",checkbox:"checkbox",email:"email",phone:"tel"})[f.field_type]||"text";
      if(input.type==="number")input.step="any";
      if(input.type==="checkbox")input.checked=sub.answers?.[f.id]===true||sub.answers?.[f.id]==="true";else input.value=sub.answers?.[f.id]??"";
      input.required=!!f.required;if(foxIsEmployeeField(f.label)){input.disabled=true;input.required=false;}
      wrap.append(input);box.append(wrap);
    }
    $("managerEntryTitle").textContent="Edit Entry: "+sub.id;$("managerEntryPanel").classList.remove("hidden");$("managerEntryPanel").scrollIntoView({block:"start"});
  }catch(e){showMessage("p6SubmissionsMessage",friendlyError(e));}
}
$("managerEntryCancel").addEventListener("click",()=>{managerEditing=null;$("managerEntryPanel").classList.add("hidden");});
$("managerEntryForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!isManager()||!managerEditing)return;
  const {sub,fields}=managerEditing, answers={...sub.answers};
  for(const f of fields){if(foxIsEmployeeField(f.label))continue;const input=$("manager_field_"+f.id);answers[f.id]=input.type==="checkbox"?input.checked:input.type==="number"?(input.value===""?null:Number(input.value)):input.value;}
  $("managerEntrySave").disabled=true;
  try{const r=await supabase.rpc("fox_manager_update_entry",{p_id:sub.id,p_answers:answers});if(r.error)throw r.error;$("managerEntryCancel").click();await p6LoadSubmissions();showMessage("p6SubmissionsMessage","Entry updated successfully.","success");}catch(err){showMessage("p6SubmissionsMessage",friendlyError(err));}finally{$("managerEntrySave").disabled=false;}
});
async function managerEntryDelete(sub){
  if(!isManager()||!confirm("Permanently delete entry "+sub.id+" and its linked financial data?"))return;
  try{const r=await supabase.rpc("fox_manager_delete_entry",{p_id:sub.id});if(r.error)throw r.error;if(managerEditing?.sub.id===sub.id)$("managerEntryCancel").click();await p6LoadSubmissions();showMessage("p6SubmissionsMessage","Entry deleted successfully.","success");}catch(e){showMessage("p6SubmissionsMessage",friendlyError(e));}
}
