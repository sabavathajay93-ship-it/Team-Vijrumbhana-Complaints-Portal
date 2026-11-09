const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL;
const TOKEN_KEY = "vijrumbhana_admin_token";
const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginMessage = document.getElementById("loginMessage");
const dashboardMessage = document.getElementById("dashboardMessage");
const complaintsList = document.getElementById("complaintsList");
const token = () => sessionStorage.getItem(TOKEN_KEY);

async function api(path, options = {}) {
  if (!API_BASE_URL) throw new Error("Admin API URL is not configured.");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
function showDashboard() { loginSection.hidden = true; dashboardSection.hidden = false; loadComplaints(); }
function addText(parent, tag, value) { const el = document.createElement(tag); el.textContent = value; parent.appendChild(el); return el; }
async function loadComplaints() {
  complaintsList.replaceChildren(); dashboardMessage.textContent = "Loading complaints...";
  try {
    const complaints = await api("/api/admin/complaints");
    dashboardMessage.textContent = "";
    document.getElementById("summary").textContent = `${complaints.length} complaint(s) found.`;
    if (!complaints.length) { addText(complaintsList, "p", "No complaints submitted yet."); return; }
    for (const complaint of complaints) {
      const card = document.createElement("article"); card.className = "form-card"; card.style.marginTop = "20px";
      addText(card, "h3", complaint.studentName);
      addText(card, "p", `Institution: ${complaint.institutionType || "—"} / ${complaint.institutionName || "—"}`);
      addText(card, "p", `Class: ${complaint.className} | Section: ${complaint.section} | Roll: ${complaint.rollNumber}`);
      addText(card, "p", `Phone: ${complaint.phone}`);
      addText(card, "p", `Complaint: ${complaint.details}`);
      addText(card, "p", `Submitted: ${new Date(complaint.createdAt).toLocaleString()}`);
      const label = addText(card, "label", "Complaint Status");
      const select = document.createElement("select"); select.setAttribute("aria-label", `Status for complaint ${complaint.id}`);
      ["Pending", "In Progress", "Resolved"].forEach(value => { const option = document.createElement("option"); option.value = value; option.textContent = value; select.appendChild(option); });
      select.value = complaint.status; label.after(select);
      const update = document.createElement("button"); update.type = "button"; update.textContent = "Update Status";
      update.addEventListener("click", async () => { update.disabled = true; try { await api(`/api/admin/complaints/${encodeURIComponent(complaint.id)}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); dashboardMessage.textContent = "Status updated."; await loadComplaints(); } catch (error) { dashboardMessage.textContent = error.message; } finally { update.disabled = false; } });
      card.appendChild(update); complaintsList.appendChild(card);
    }
  } catch (error) {
    if (error.message.includes("Unauthorized") || error.message.includes("token") || error.message.includes("log in")) { sessionStorage.removeItem(TOKEN_KEY); dashboardSection.hidden = true; loginSection.hidden = false; }
    complaintsList.replaceChildren(); dashboardMessage.textContent = error.message;
  }
}
loginForm.addEventListener("submit", async event => {
  event.preventDefault(); const button = document.getElementById("loginButton"); button.disabled = true; loginMessage.textContent = "Checking password...";
  try { const result = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: document.getElementById("password").value }) }); sessionStorage.setItem(TOKEN_KEY, result.token); document.getElementById("password").value = ""; showDashboard(); }
  catch (error) { loginMessage.textContent = error.message; }
  finally { button.disabled = false; }
});
document.getElementById("refreshButton").addEventListener("click", loadComplaints);
document.getElementById("logoutButton").addEventListener("click", () => { sessionStorage.removeItem(TOKEN_KEY); complaintsList.replaceChildren(); dashboardSection.hidden = true; loginSection.hidden = false; loginMessage.textContent = "You have logged out."; });
if (token()) showDashboard();
