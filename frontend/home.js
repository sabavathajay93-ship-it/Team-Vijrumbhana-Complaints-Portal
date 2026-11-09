const form = document.getElementById("complaintForm");
const message = document.getElementById("formMessage");
const button = document.getElementById("submitButton");
const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!API_BASE_URL) { message.textContent = "Portal configuration is missing. Please contact the administrator."; return; }
  message.textContent = "";
  button.disabled = true;
  button.textContent = "Submitting...";
  const data = new FormData(form);
  const complaint = {
    studentName: String(data.get("studentName") || "").trim(),
    institutionType: String(data.get("institutionType") || "").trim(),
    institutionName: String(data.get("institutionName") || "").trim(),
    className: String(data.get("className") || "").trim(),
    section: String(data.get("section") || "").trim(),
    rollNumber: String(data.get("rollNumber") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    details: String(data.get("details") || "").trim()
  };
  try {
    const response = await fetch(`${API_BASE_URL}/api/complaints`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(complaint)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not submit your complaint.");
    message.textContent = `Success! Your complaint was submitted. Reference: ${result.id}`;
    message.style.color = "green";
    form.reset();
  } catch (error) {
    message.textContent = `${error.message} Please try again.`;
    message.style.color = "red";
  } finally {
    button.disabled = false;
    button.textContent = "Submit Complaint";
  }
});
